import type { CommandContext } from "../../src/commands/registry";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { Store } from "../../src/store/store";
import type { Route } from "../mockHttp";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { LXNS_OAUTH_LIFETIME, LXNS_OAUTH_SCOPE } from "@core/integrations/lxns/oauth";
import { afterEach, describe, expect, it } from "vitest";
import { createRegistry } from "../../src/commands";
import { loadConfig } from "../../src/runtime/config";
import { readCredentials } from "../../src/runtime/credentials";
import { createHttp } from "../../src/runtime/http";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { completeLxnsBind } from "../../src/users/lxnsBind";
import { listUsers, readUser, replaceUsers } from "../../src/users/repository";
import { commandIn, LXNS_URL, NOW } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { createHarness } from "../harness";
import { jsonResponse, mockFetch, textResponse } from "../mockHttp";
import { parsePrintedCommand } from "../printedCommand";
import { useTempHome } from "../tempHome";
import { useTimeZone } from "../zone";

useTimeZone("Asia/Shanghai");
const makeHome = useTempHome();
const registry = createRegistry();
const schema = registry.find("user bind")!.spec.dataSchema!;
const uid = "fake-user-a";
const otherUid = "fake-user-b";
const accountId = 9_000_001;
const accountName = "FAKE-LXNS-PROFILE";
const clientId = "FAKE-LXNS-CLIENT";
const redirectUri = "https://callback.test/saltnet?lxns_auth_complete";
const tokenUrl = `${LXNS_URL}/api/v0/oauth/token`;
const code = "FAKE-LXNS-CODE-0001";
const refreshToken = "FAKE-LXNS-REFRESH-0001";
const env = { SALTNET_LXNS_CLIENT_ID: clientId, SALTNET_LXNS_REDIRECT_URI: redirectUri };
const expiresIn = 3600;

function jwtWith(payload: object) {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "FAKE" })}.${encode(payload)}.FAKE-SIGNATURE`;
}

function jwt(name = accountName) {
    return jwtWith({ name, id: accountId });
}

const accessToken = jwt();
const auth = { accessToken, refreshToken, tokenType: "Bearer" };
const tokenResponse = jsonResponse({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: expiresIn,
});

function bind(
    paths: RuntimePaths,
    userUid: string,
    args: string[],
    options: NonNullable<Parameters<typeof commandIn>[3]> = {}
) {
    // A uid that starts with `-` must follow `--`, after which nothing is read as an option.
    const words = userUid.startsWith("-")
        ? ["bind", "--verbose", ...args, "--", userUid, "lxns"]
        : ["bind", userUid, "lxns", "--verbose", ...args];
    return commandIn(paths, "user", words, {
        network: {},
        ...options,
        env: { ...env, ...options.env },
    });
}

function linkFor(state: string, authorizationCode = code) {
    const callback = new URL(redirectUri);
    callback.searchParams.set("state", state);
    callback.searchParams.set("code", authorizationCode);
    return callback;
}

const stores: Store[] = [];
afterEach(() => {
    for (const store of stores.splice(0)) store.close();
});

function fixture(existingAccountId: number | null = null, userUid = uid) {
    const paths = makeHome();
    const store = openStore(paths);
    stores.push(store);
    const user = {
        uid: userUid,
        remark: "Fake CLI user",
        lxns: { id: existingAccountId, name: null, auth: null },
        divingFish: { name: "fake-diving-fish-name", importToken: null },
        inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: 12345 },
    };
    replaceUsers(store, [user, { ...user, uid: otherUid }], []);
    return { paths, store, user };
}

async function start(paths: RuntimePaths, userUid = uid) {
    const result = await bind(paths, userUid, ["--offline"]);
    expect(result.json).toMatchObject({ ok: true, command: "user bind" });
    expect(result.requests).toEqual([]);
    const url = new URL(result.json.data.authorizeUrl);
    const state = url.searchParams.get("state")!;
    const transaction = readCredentials(paths).pendingLxnsAuthorizations![state];
    return { result, url, state, transaction, link: linkFor(state) };
}

function expectPrivate(result: { stdout: string; stderr: string }, ...values: string[]) {
    for (const secret of [code, accessToken, refreshToken, ...values]) {
        expect(result.stdout).not.toContain(secret);
        expect(result.stderr).not.toContain(secret);
    }
}

describe("user bind lxns", () => {
    it("opens an offline, private PKCE transaction and replaces only that user's previous one", async () => {
        const { paths } = fixture();
        const first = await start(paths);
        const other = await start(paths, otherUid);
        const second = await start(paths);
        const { result, url, state, transaction } = second;
        expectConforms(schema, result.json.data);
        expect(result.json.data.expiresAt).toBe("2026-11-11T09:15:00+08:00");
        expect(`${url.origin}${url.pathname}`).toBe(`${LXNS_URL}/oauth/authorize`);
        expect(Object.fromEntries(url.searchParams)).toEqual({
            response_type: "code",
            client_id: clientId,
            redirect_uri: redirectUri,
            code_challenge: createHash("sha256")
                .update(transaction.codeVerifier)
                .digest("base64url"),
            state,
            code_challenge_method: "S256",
            scope: LXNS_OAUTH_SCOPE,
        });
        expect(Object.keys(readCredentials(paths).pendingLxnsAuthorizations!).sort()).toEqual(
            [state, other.state].sort()
        );
        expect(state).not.toBe(first.state);
        expect(transaction).toMatchObject({
            userUid: uid,
            clientId,
            redirectUri,
            expiresAt: NOW.getTime() + LXNS_OAUTH_LIFETIME,
        });
        expect(transaction.codeVerifier).not.toBe(state);
        expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
        expectPrivate(result, transaction.codeVerifier);
    });

    it("exchanges exactly once, binds the JWT's profile, and keeps credentials out of SQLite and output", async () => {
        const { paths, store, user } = fixture();
        const { link, transaction } = await start(paths);
        const result = await bind(paths, uid, ["--callback", "-"], {
            stdin: ` ${link.href}\n`,
            network: { [tokenUrl]: tokenResponse },
            env: { SALTNET_LXNS_BASE_URL: "https://changed-lxns.test" },
        });
        expect(result.json).toMatchObject({
            ok: true,
            data: {
                uid,
                source: "lxns",
                changed: true,
                lxns: { id: accountId, name: accountName },
            },
        });
        expectConforms(schema, result.json.data);
        expect(result.requests.map(request => [request.url, request.init?.method])).toEqual([
            [tokenUrl, "POST"],
        ]);
        expect(result.requests[0].init).toMatchObject({ redirect: "error" });
        expect(Object.fromEntries(new URLSearchParams(result.requests[0].init?.body))).toEqual({
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            redirect_uri: redirectUri,
            code_verifier: transaction.codeVerifier,
        });
        expect(readCredentials(paths)).toEqual({
            version: 1,
            users: {
                [uid]: {
                    lxnsAuthorization: { ...auth, expiresAt: NOW.getTime() + expiresIn * 1000 },
                    lxnsAccountId: accountId,
                    lxnsIssuedAt: NOW.getTime(),
                },
            },
            pendingLxnsAuthorizations: {},
        });
        expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
        expect(readUser(store, uid)).toEqual({
            ...user,
            lxns: { auth: null, name: accountName, id: accountId },
        });
        expect(store.db.prepare("SELECT * FROM sync_runs").all()).toEqual([]);
        const stored = JSON.stringify(store.db.prepare("SELECT * FROM users").all());
        for (const secret of [accessToken, refreshToken, transaction.codeVerifier, code]) {
            expect(stored).not.toContain(secret);
            expect(readFileSync(paths.database, "utf8")).not.toContain(secret);
            expect(readFileSync(`${paths.database}-wal`, "utf8")).not.toContain(secret);
        }
        expectPrivate(result, transaction.codeVerifier, link.href);
        const repeated = await bind(paths, uid, ["--callback", "-"], { stdin: link.href });
        expect(repeated.json.error.code).toBe("LXNS_REAUTH_REQUIRED");
        expect(repeated.requests).toEqual([]);
    });

    it.each([
        { kind: "wrong state", error: "LXNS_REAUTH_REQUIRED" },
        { kind: "wrong user", error: "LXNS_REAUTH_REQUIRED" },
        { kind: "expired", error: "LXNS_REAUTH_REQUIRED" },
        { kind: "failed callback", error: "LXNS_REAUTH_REQUIRED" },
        { kind: "wrong address", error: "USAGE" },
        { kind: "invalid link", error: "USAGE" },
        { kind: "argv link", error: "USAGE" },
    ])(
        "rejects $kind without revealing the callback or sending a request",
        async ({ kind, error }) => {
            const { paths } = fixture();
            const { link, transaction } = await start(paths);
            if (kind === "wrong state") link.searchParams.set("state", "FAKE-WRONG-STATE");
            if (kind === "wrong address") link.pathname = "/fake-wrong-callback";
            if (kind === "failed callback") {
                link.searchParams.set("error", "access_denied");
                link.searchParams.set("error_description", `${code} ${transaction.codeVerifier}`);
            }
            const before = readFileSync(paths.credentials, "utf8");
            const target = kind === "wrong user" ? otherUid : uid;
            const result = await bind(
                paths,
                target,
                ["--callback", kind === "argv link" ? link.href : "-"],
                {
                    stdin: kind === "invalid link" ? `invalid callback ${code}` : link.href,
                    now: kind === "expired" ? new Date(NOW.getTime() + LXNS_OAUTH_LIFETIME) : NOW,
                    network: { [tokenUrl]: tokenResponse },
                }
            );
            expect(result.json.error.code).toBe(error);
            if (error === "LXNS_REAUTH_REQUIRED")
                expect(result.json.error.fix).toBe(`saltnet user bind ${target} lxns`);
            expect(result.requests).toEqual([]);
            expect(readFileSync(paths.credentials, "utf8")).toBe(before);
            expectPrivate(result, link.href, transaction.codeVerifier);
        }
    );

    it("restarts with a fix that runs as printed for a uid that starts with -", async () => {
        const dashUid = "-fake dash user";
        const { paths } = fixture(null, dashUid);
        const { link } = await start(paths, dashUid);
        const result = await bind(paths, dashUid, ["--callback", "-"], {
            stdin: link.href,
            now: new Date(NOW.getTime() + LXNS_OAUTH_LIFETIME),
            network: { [tokenUrl]: tokenResponse },
        });
        expect(result.json.error.code).toBe("LXNS_REAUTH_REQUIRED");
        expect(parsePrintedCommand(result.json.error.fix)).toMatchObject({
            command: "user bind",
            positionals: { user: dashUid, source: "lxns" },
        });
        expect(result.requests).toEqual([]);
    });

    it("keeps the same pending record when the token endpoint returns an explicit error", async () => {
        const { paths, store, user } = fixture();
        const { link, transaction } = await start(paths);
        const before = readFileSync(paths.credentials, "utf8");
        const result = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            network: {
                [tokenUrl]: jsonResponse(
                    {
                        error: "server_error",
                        error_description: `${code} ${transaction.codeVerifier} ${refreshToken}`,
                    },
                    503
                ),
            },
        });
        expect(result.json.error.code).toBe("UPSTREAM_ERROR");
        expect(result.requests).toHaveLength(1);
        expect(readFileSync(paths.credentials, "utf8")).toBe(before);
        expect(readUser(store, uid)).toEqual(user);
        expectPrivate(result, transaction.codeVerifier);
    });

    it.each([
        {
            kind: "invalid_grant",
            response: jsonResponse({ error: "invalid_grant" }, 400),
            error: "LXNS_REAUTH_REQUIRED",
        },
        {
            kind: "a 5xx without an OAuth body",
            response: textResponse(`FAKE gateway failure ${refreshToken}`, 502),
            error: "UPSTREAM_ERROR",
        },
        {
            kind: "an OAuth error in a 200 body",
            response: jsonResponse({ error: "temporarily_unavailable" }),
            error: "UPSTREAM_ERROR",
        },
    ])(
        "restores the pending record when the token endpoint answers with $kind",
        async ({ response, error }) => {
            const { paths, store, user } = fixture();
            const { link, transaction } = await start(paths);
            const before = readFileSync(paths.credentials, "utf8");
            const result = await bind(paths, uid, ["--callback", "-"], {
                stdin: link.href,
                network: { [tokenUrl]: response },
            });
            expect(result.json.error.code).toBe(error);
            expect(result.json.error.fix).toBe(`saltnet user bind ${uid} lxns`);
            expect(result.requests).toHaveLength(1);
            expect(readFileSync(paths.credentials, "utf8")).toBe(before);
            expect(readUser(store, uid)).toEqual(user);
            expectPrivate(result, transaction.codeVerifier);
        }
    );

    it("sanitizes transport errors and requires a new code when no response was received", async () => {
        const { paths, store } = fixture();
        const { link, state, transaction } = await start(paths);
        const fail: Route = () => {
            throw new Error(`${code} ${transaction.codeVerifier} ${refreshToken}`);
        };
        const fetch = mockFetch({ [tokenUrl]: fail });
        const { io } = createHarness({
            fetch,
            now: NOW,
            env: { ...env, SALTNET_LXNS_BASE_URL: LXNS_URL },
        });
        const options = loadConfig(paths, { env: io.env, version: "0.0.0" });
        const ctx: CommandContext = {
            io,
            config: options,
            registry,
            version: "0.0.0",
            paths,
            store: () => store,
            http: settings =>
                createHttp({
                    ...settings,
                    fetch,
                    timeoutMs: 1000,
                    timeoutKey: "network.timeoutMs",
                    userAgent: "test",
                }),
            log: () => {},
        };
        const pending = completeLxnsBind(ctx, store, listUsers(store)[0], link.href);
        await expect(pending).rejects.toMatchObject({
            code: "NETWORK",
            retryable: false,
        });
        await expect(pending).rejects.toHaveProperty("message", "连接落雪授权服务失败");
        await expect(pending).rejects.not.toHaveProperty("cause");
        expect(fetch.requests).toHaveLength(1);
        expect(readCredentials(paths).pendingLxnsAuthorizations![state]).toMatchObject({
            codeHash: createHash("sha256").update(code).digest("hex"),
        });
        const retry = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            network: { [tokenUrl]: tokenResponse },
        });
        expect(retry.json.error.code).toBe("LXNS_REAUTH_REQUIRED");
        expect(retry.requests).toEqual([]);
        expectPrivate(retry, transaction.codeVerifier);
    });

    it("resumes from the saved exchange when the first SQLite user write is interrupted", async () => {
        const { paths, store, user } = fixture();
        const { link, state, transaction } = await start(paths);
        const issuedAt = NOW.getTime() + 14 * 60_000;
        store.db.exec(
            "CREATE TRIGGER fake_interrupt BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT, 'fake interruption'); END"
        );
        const failed = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            now: new Date(issuedAt),
            network: { [tokenUrl]: tokenResponse },
        });
        expect(failed.json.error.code).toBe("INTERNAL");
        expect(failed.requests).toHaveLength(1);
        expectPrivate(failed, transaction.codeVerifier);
        expect(readUser(store, uid)).toEqual(user);
        const saved = readCredentials(paths).pendingLxnsAuthorizations![state];
        expect(saved.token).toEqual({ auth, expiresAt: issuedAt + expiresIn * 1000 });
        expect(saved.issuedAt).toBe(issuedAt);
        expect(saved.expiresAt).toBe(issuedAt + LXNS_OAUTH_LIFETIME);
        expect(readFileSync(paths.credentials, "utf8")).not.toContain(code);
        store.db.exec("DROP TRIGGER fake_interrupt");

        const wrongCode = await bind(paths, uid, ["--callback", "-"], {
            stdin: linkFor(state, "FAKE-DIFFERENT-CODE").href,
            now: new Date(issuedAt + 60_000),
        });
        expect(wrongCode.json.error.code).toBe("LXNS_REAUTH_REQUIRED");
        expect(wrongCode.requests).toEqual([]);
        const resumed = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            now: new Date(issuedAt + 60_000),
        });
        expect(resumed.json.ok).toBe(true);
        expect(resumed.requests).toEqual([]);
        expect(readCredentials(paths).users[uid].lxnsIssuedAt).toBe(issuedAt);
        expect(readCredentials(paths).pendingLxnsAuthorizations).toEqual({});
        expectPrivate(resumed, transaction.codeVerifier);
    });

    it.each([
        { kind: "a refresh token", secret: refreshToken },
        { kind: "an authorization code", secret: code },
    ])("rejects a token profile that echoes $kind in its name", async ({ secret }) => {
        const { paths, store, user } = fixture();
        const { link, transaction } = await start(paths);
        const result = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            network: {
                [tokenUrl]: jsonResponse({
                    access_token: jwt(`FAKE-PROFILE ${secret}`),
                    refresh_token: refreshToken,
                    token_type: "Bearer",
                    expires_in: expiresIn,
                }),
            },
        });
        expect(result.json.error.code).toBe("UPSTREAM_ERROR");
        expect(readUser(store, uid)).toEqual(user);
        expect(readCredentials(paths).users).toEqual({});
        const resumed = await bind(paths, uid, ["--yes", "FAKE-CODE"]);
        expect(resumed.json.error.code).toBe("LXNS_REAUTH_REQUIRED");
        expect(resumed.requests).toEqual([]);
        expectPrivate(result, transaction.codeVerifier);
        expectPrivate(resumed, transaction.codeVerifier);
    });

    it("rejects --yes when reauthorizing the same LXNS account", async () => {
        const { paths, store, user } = fixture(accountId);
        const { link } = await start(paths);
        const credentialsBefore = readFileSync(paths.credentials, "utf8");
        const result = await bind(paths, uid, ["--callback", "-", "--yes", "FAKE-CODE"], {
            stdin: link.href,
            network: { [tokenUrl]: tokenResponse },
        });
        expect(result.json.error.code).toBe("USAGE");
        expect(result.json.error.fix).toBeUndefined();
        expect(result.requests).toEqual([]);
        expect(readUser(store, uid)).toEqual(user);
        expect(readFileSync(paths.credentials, "utf8")).toBe(credentialsBefore);

        const retried = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            network: { [tokenUrl]: tokenResponse },
        });
        expect(retried.code).toBe(0);
        expect(retried.json.data.uid).toBe(uid);
        expect(retried.json.data).not.toHaveProperty("oldUid");
        expect(readUser(store, uid)?.data).toEqual(user.data);
    });

    it.each([
        { kind: "a zero id", payload: { name: accountName, id: 0 } },
        { kind: "a fractional id", payload: { name: accountName, id: 1.5 } },
        { kind: "an unsafe id", payload: { name: accountName, id: 2 ** 53 } },
        { kind: "a name that is not a string", payload: { name: 12345, id: accountId } },
    ])("rejects a token profile with $kind", async ({ payload }) => {
        const { paths, store, user } = fixture();
        const { link, transaction } = await start(paths);
        const result = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            network: {
                [tokenUrl]: jsonResponse({
                    access_token: jwtWith(payload),
                    refresh_token: refreshToken,
                    token_type: "Bearer",
                    expires_in: expiresIn,
                }),
            },
        });
        expect(result.json.error.code).toBe("UPSTREAM_ERROR");
        expect(readUser(store, uid)).toEqual(user);
        expect(readCredentials(paths).users).toEqual({});
        expectPrivate(result, transaction.codeVerifier);
    });

    it("previews a changed identity and retains the exchanged token for 15 more minutes", async () => {
        const { paths, store, user } = fixture(accountId + 1);
        const { link, state, transaction } = await start(paths);
        const now = new Date(NOW.getTime() + 60_000);
        const result = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            now,
            network: { [tokenUrl]: tokenResponse },
        });
        expect(result.json.error).toMatchObject({
            code: "CONFIRMATION_REQUIRED",
            codeRejected: false,
        });
        expect(result.requests).toHaveLength(1);
        expect(readUser(store, uid)).toEqual(user);
        const credentials = readCredentials(paths);
        expect(credentials.users).toEqual({});
        expect(credentials.pendingLxnsAuthorizations![state]).toMatchObject({
            token: { auth },
            issuedAt: now.getTime(),
            expiresAt: now.getTime() + LXNS_OAUTH_LIFETIME,
        });
        expectPrivate(result, transaction.codeVerifier);
    });

    it("refuses completion under another process's user sync lock", async () => {
        const { paths, store } = fixture();
        const { link, transaction } = await start(paths);
        const held = acquireLock(store, `sync:${uid}`, { ttlMs: 60_000, now: () => NOW.getTime() });
        expect(held.acquired).toBe(true);
        const result = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            network: { [tokenUrl]: tokenResponse },
        });
        expect(result.json.error.code).toBe("SYNC_IN_PROGRESS");
        expect(result.requests).toEqual([]);
        expectPrivate(result, transaction.codeVerifier);
    });

    it("refuses to start under another process's user sync lock", async () => {
        const { paths, store } = fixture();
        const held = acquireLock(store, `sync:${uid}`, { ttlMs: 60_000, now: () => NOW.getTime() });
        expect(held.acquired).toBe(true);
        const result = await bind(paths, uid, ["--offline"]);
        expect(result.json.error.code).toBe("SYNC_IN_PROGRESS");
        expect(result.requests).toEqual([]);
        expect(existsSync(paths.credentials)).toBe(false);
    });

    it("writes no authorization when the sync lock is lost while it waits for the credential lock", async () => {
        const { paths, store } = fixture();
        const held = acquireLock(store, "credentials", { ttlMs: 30_000 });
        if (!held.acquired) throw new Error("expected the credentials lock");
        const starting = bind(paths, uid, ["--offline"]);
        try {
            const syncLock = store.db.prepare("SELECT owner FROM locks WHERE name = ?");
            for (let tries = 0; !syncLock.get(`sync:${uid}`); tries++) {
                if (tries > 400) throw new Error("the command never took the user's sync lock");
                await new Promise(resolve => setTimeout(resolve, 5));
            }
            // Another process takes the user's lock over while this one waits for the credentials.
            store.db
                .prepare("UPDATE locks SET owner = 'FAKE-OTHER-OWNER' WHERE name = ?")
                .run(`sync:${uid}`);
        } finally {
            held.lock.release();
        }
        const result = await starting;
        expect(result.json.error.code).toBe("INTERNAL");
        expect(existsSync(paths.credentials)).toBe(false);
    });

    it("asks for a new authorization when the credential lock is lost during the exchange", async () => {
        const { paths, store, user } = fixture();
        const { link, state, transaction } = await start(paths);
        const result = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            network: {
                [tokenUrl]: () => {
                    // Another process took over the expired lock while the request was out.
                    store.db
                        .prepare("UPDATE locks SET owner = 'FAKE-OTHER-OWNER' WHERE name = ?")
                        .run("credentials");
                    return tokenResponse;
                },
            },
        });
        expect(result.json.error.code).toBe("DB_LOCKED");
        expect(result.requests).toHaveLength(1);
        expect(readUser(store, uid)).toEqual(user);
        const credentials = readCredentials(paths);
        expect(credentials.users).toEqual({});
        expect(credentials.pendingLxnsAuthorizations![state]).not.toHaveProperty("token");
        expectPrivate(result, transaction.codeVerifier);

        store.db.prepare("DELETE FROM locks").run();
        const retry = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            network: { [tokenUrl]: tokenResponse },
        });
        expect(retry.json.error.code).toBe("LXNS_REAUTH_REQUIRED");
        expect(retry.requests).toEqual([]);
    });

    it("keeps the exchanged token when the sync lock is lost during the exchange", async () => {
        const { paths, store, user } = fixture();
        const { link, state, transaction } = await start(paths);
        const result = await bind(paths, uid, ["--callback", "-"], {
            stdin: link.href,
            network: {
                [tokenUrl]: () => {
                    store.db
                        .prepare("UPDATE locks SET owner = 'FAKE-OTHER-OWNER' WHERE name = ?")
                        .run(`sync:${uid}`);
                    return tokenResponse;
                },
            },
        });
        expect(result.json.error.code).toBe("INTERNAL");
        expect(readUser(store, uid)).toEqual(user);
        expect(readCredentials(paths).users).toEqual({});
        expect(readCredentials(paths).pendingLxnsAuthorizations![state]).toMatchObject({
            token: { auth },
        });
        expectPrivate(result, transaction.codeVerifier);

        store.db.prepare("DELETE FROM locks").run();
        const resumed = await bind(paths, uid, ["--callback", "-"], { stdin: link.href });
        expect(resumed.json.ok).toBe(true);
        expect(resumed.requests).toEqual([]);
        expect(readUser(store, uid)?.lxns).toEqual({
            auth: null,
            name: accountName,
            id: accountId,
        });
        expectPrivate(resumed, transaction.codeVerifier);
    });
});
