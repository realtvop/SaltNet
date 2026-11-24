import type { User } from "@core/user/type";
import type { CredentialsFile } from "../../src/runtime/credentials";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { Store } from "../../src/store/store";
import { Buffer } from "node:buffer";
import { existsSync, readFileSync, statSync } from "node:fs";
import { CollectionKind } from "@core/collection/type";
import { LXNS_OAUTH_LIFETIME } from "@core/integrations/lxns/oauth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRegistry } from "../../src/commands";
import { readCredentials, stageCredentials } from "../../src/runtime/credentials";
import * as credentialFiles from "../../src/runtime/credentials";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import {
    listUsers,
    makeDefaultUser,
    readUser,
    readUserCounts,
    readUserRemovalFingerprint,
    replaceUsers,
} from "../../src/users/repository";
import { userBindCommand } from "../../src/util/printedCommand";
import { splitCommandLine } from "../../src/util/shell";
import { commandIn, LXNS_URL, NOW } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { jsonResponse } from "../mockHttp";
import { parsePrintedCommand } from "../printedCommand";
import { allFixtureRecords, recordOf, scoreEvent, user } from "../scoreUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const stores: Store[] = [];
const env = {
    SALTNET_API_URL: "https://game.test",
    SALTNET_API_FALLBACK_URL: "https://fallback.test",
    SALTNET_LXNS_CLIENT_ID: "FAKE-LXNS-CLIENT",
    SALTNET_LXNS_REDIRECT_URI: "https://callback.test/saltnet?lxns_auth_complete",
};
const qrUrl = `${env.SALTNET_API_URL}/getQRInfo`;
const tokenUrl = `${LXNS_URL}/api/v0/oauth/token`;
const qr = `SGWCMAID${"0".repeat(56)}FAKE0001`;
const callbackCode = "FAKE-LXNS-CODE-1234";
const dfToken = "FAKE-DF-IMPORT-1234";
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
function fakeJwt(id: number, name: string) {
    return `${encode({ alg: "FAKE" })}.${encode({ id, name })}.FAKE-SIGNATURE`;
}
const oldLxnsId = 9_001_001;
const oldLxnsName = "FAKE-OLD-LXNS";
const oldLxns = {
    lxnsAuthorization: {
        accessToken: fakeJwt(oldLxnsId, oldLxnsName),
        refreshToken: "FAKE-OLD-LXNS-REFRESH-1234",
        tokenType: "Bearer",
        expiresAt: NOW.getTime() + 3_000_000,
    },
    lxnsAccountId: oldLxnsId,
    lxnsIssuedAt: NOW.getTime() - 60_000,
};
const lxnsId = 9_001_002;
const lxnsName = "FAKE-LXNS-NEW-PROFILE";
const jwt = fakeJwt(lxnsId, lxnsName);
const refreshToken = "FAKE-NEW-LXNS-REFRESH-1234";
const tokenResponse = jsonResponse({
    access_token: jwt,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: 3600,
});
const otherUid = "fake-other-user";
const newGameId = 99_980_002;
const fishName = "-fake new fish's name";
const tables = [
    "scores",
    "score_events",
    "rating_history",
    "b50_snapshot",
    "user_items",
    "user_characters",
];
const oldCounts = { scores: 1, scoreEvents: 1, ratingHistory: 1, b50: 1, items: 1, characters: 1 };
const emptyCounts = {
    scores: 0,
    scoreEvents: 0,
    ratingHistory: 0,
    b50: 0,
    items: 0,
    characters: 0,
};
const schema = createRegistry().find("user bind")!.spec.dataSchema!;

type Path = "id" | "qr" | "df-name" | "lxns";
type Options = NonNullable<Parameters<typeof commandIn>[3]>;

afterEach(() => {
    for (const store of stores.splice(0)) store.close();
});

function fixture(kind: Path, index: number) {
    const paths = makeHome();
    const store = openStore(paths);
    stores.push(store);
    const uid = index === 0 ? "fake-default-user" : "-fake-second-user";
    const record = recordOf(allFixtureRecords().charts[0]);
    const current: User = {
        ...user(uid, "FAKE-OLD-SCORE-NAME", {
            updateTime: NOW.getTime(),
            rating: 9999,
            detailed: { "1-0": record },
            b50: { sd: [record], dx: [] },
            items: [[{ itemKind: CollectionKind.Title, itemId: 1, stock: 1, isValid: true }]],
            characters: [
                {
                    characterId: 1,
                    point: 1,
                    useCount: 1,
                    level: 1,
                    nextAwake: 0,
                    nextAwakePercent: 0,
                    awakening: 0,
                },
            ],
            ratingHistory: [{ time: NOW.getTime(), rating: 9999 }],
        }),
        remark: "FAKE-BIND-USER",
        divingFish: { name: "FAKE-OLD-DF-NAME", importToken: null },
        lxns: kind === "df-name" ? undefined : { id: oldLxnsId, name: oldLxnsName, auth: null },
    };
    if (kind !== "df-name") {
        current.inGame = {
            id: 99_980_001,
            name: "FAKE-GAME-NAME",
            enabled: true,
            useFastUpdate: true,
        };
    }
    const other = user(otherUid, "FAKE-OTHER-NAME");
    replaceUsers(store, index === 0 ? [current, other] : [other, current], [
        scoreEvent("fake-bind-event", uid, "1-0", 1),
    ]);
    const entry = kind === "df-name" ? undefined : { ...oldLxns, divingFishImportToken: dfToken };
    const otherEntry = { divingFishImportToken: "FAKE-OTHER-DF-TOKEN-1234" };
    stageCredentials(paths, {
        version: 1,
        users: entry ? { [otherUid]: otherEntry, [uid]: entry } : { [otherUid]: otherEntry },
    }).commit();
    expect(readUserCounts(store, uid)).toEqual(oldCounts);
    return { paths, store, uid, current, other, entry, otherEntry };
}

function runPrinted(paths: RuntimePaths, line: string, options: Options = {}) {
    const [bin, group, action, ...args] = splitCommandLine(line);
    expect([bin, group, action]).toEqual(["saltnet", "user", "bind"]);
    return commandIn(paths, group, [action, "--verbose", ...args], {
        network: {},
        env,
        ...options,
    });
}

function localFiles(paths: RuntimePaths) {
    return [paths.database, `${paths.database}-wal`, paths.credentials].map(file =>
        existsSync(file) ? readFileSync(file) : null
    );
}

function noJournal(store: Store) {
    expect(store.db.prepare("SELECT * FROM sync_runs").all()).toEqual([]);
}

function expectPrivate(
    paths: RuntimePaths,
    outputs: { stdout: string; stderr: string }[],
    verifier?: string
) {
    const dbFiles = [paths.database, `${paths.database}-wal`].filter(existsSync);
    const disk = dbFiles.map(file => readFileSync(file).toString()).join("");
    const logged = outputs.map(output => output.stdout + output.stderr).join("");
    for (const secret of [
        dfToken,
        oldLxns.lxnsAuthorization.accessToken,
        oldLxns.lxnsAuthorization.refreshToken,
        jwt,
        refreshToken,
        callbackCode,
        qr,
        qr.slice(-64),
        verifier,
    ]) {
        if (secret) {
            expect(logged).not.toContain(secret);
            expect(disk).not.toContain(secret);
        }
    }
}

async function previewCommand(paths: RuntimePaths, kind: Path, ref: string) {
    const source = kind === "id" || kind === "qr" ? "ingame" : kind;
    if (kind === "lxns") {
        const start = await runPrinted(paths, userBindCommand(ref, "lxns"));
        expect(start.code).toBe(0);
        const state = new URL(start.json.data.authorizeUrl).searchParams.get("state")!;
        const verifier = readCredentials(paths).pendingLxnsAuthorizations![state].codeVerifier;
        const callback = new URL(env.SALTNET_LXNS_REDIRECT_URI);
        callback.searchParams.set("state", state);
        callback.searchParams.set("code", callbackCode);
        return {
            line: userBindCommand(ref, source, [], ["--callback", "-"]),
            options: { stdin: callback.href, network: { [tokenUrl]: tokenResponse } },
            verifier,
            state,
        };
    }
    if (kind === "qr") {
        return {
            line: userBindCommand(ref, source, [], ["--qr", "-"]),
            options: {
                stdin: qr,
                network: { [qrUrl]: jsonResponse({ errorID: 0, userID: newGameId }) },
            },
        };
    }
    return {
        line:
            kind === "id"
                ? userBindCommand(ref, source, [], ["--id", String(newGameId)])
                : userBindCommand(ref, source, ref.startsWith("-") ? [fishName] : ["--", fishName]),
        options: {},
    };
}

describe.each(["id", "qr", "df-name", "lxns"] as const)("identity change via %s", kind => {
    it.each([0, 1])(
        "previews and confirms the user at index %i with a runnable fix",
        async index => {
            const { paths, store, uid, current, other, entry, otherEntry } = fixture(kind, index);
            const ref = index === 0 ? "0" : uid;
            const { line, options, verifier, state } = await previewCommand(paths, kind, ref);
            const before = localFiles(paths);
            const fingerprint = readUserRemovalFingerprint(store, uid);
            const preview = await runPrinted(paths, line, options);
            expect(preview.code).toBe(6);
            expect(preview.json.error).toMatchObject({
                code: "CONFIRMATION_REQUIRED",
                codeRejected: false,
                preview: {
                    user: { uid, index, name: current.remark },
                    before: {
                        inGameId: current.inGame.id,
                        lxnsId: current.lxns?.id ?? null,
                        lxnsName: current.lxns?.name ?? null,
                        divingFishName: current.divingFish.name,
                    },
                    after: {
                        inGameId: kind === "qr" || kind === "id" ? newGameId : current.inGame.id,
                        lxnsId: kind === "lxns" ? lxnsId : (current.lxns?.id ?? null),
                        lxnsName: kind === "lxns" ? lxnsName : (current.lxns?.name ?? null),
                        divingFishName: kind === "df-name" ? fishName : current.divingFish.name,
                    },
                    counts: oldCounts,
                },
            });
            expect(readUserRemovalFingerprint(store, uid)).toBe(fingerprint);
            if (kind === "lxns") {
                expect(preview.requests.map(request => request.url)).toEqual([tokenUrl]);
                expect(readFileSync(paths.database)).toEqual(before[0]);
                expect(readCredentials(paths)).toMatchObject({
                    users: { [uid]: entry, [otherUid]: otherEntry },
                    pendingLxnsAuthorizations: {
                        [state!]: {
                            issuedAt: NOW.getTime(),
                            expiresAt: NOW.getTime() + LXNS_OAUTH_LIFETIME,
                        },
                    },
                });
            } else {
                expect(localFiles(paths)).toEqual(before);
                expect(preview.requests.map(request => request.url)).toEqual(
                    kind === "qr" ? [qrUrl] : []
                );
            }
            noJournal(store);

            const fix = preview.json.error.fix!;
            const parsed = parsePrintedCommand(fix);
            expect(parsed.positionals.user).toBe(uid);
            expect(parsed.options.yes).toBe(preview.json.error.confirmationCode);
            expect(parsed.options.qr).toBeUndefined();
            expect(parsed.options.callback).toBeUndefined();
            if (kind === "qr" || kind === "id") expect(parsed.options.id).toBe(String(newGameId));
            if (kind === "df-name") expect(parsed.positionals.value).toBe(fishName);

            const checked = localFiles(paths);
            const wrongFix = fix.replace(preview.json.error.confirmationCode, "WRONG123");
            const wrong = await runPrinted(paths, wrongFix);
            expect(wrong.code).toBe(6);
            expect(wrong.json.error).toMatchObject({
                codeRejected: true,
                confirmationCode: preview.json.error.confirmationCode,
            });
            expect(localFiles(paths)).toEqual(checked);
            expect(wrong.requests).toEqual([]);

            const held = acquireLock(store, `sync:${uid}`, {
                ttlMs: 60_000,
                now: () => NOW.getTime(),
            });
            if (!held.acquired) throw new Error("test could not acquire the sync lock");
            const whileLocked = localFiles(paths);
            const locked = await runPrinted(paths, fix);
            expect(locked.json.error.code).toBe("SYNC_IN_PROGRESS");
            expect(locked.requests).toEqual([]);
            expect(localFiles(paths)).toEqual(whileLocked);
            held.lock.release();

            // Simulate a score-only change with the same number of rows.
            store.db
                .prepare("UPDATE score_events SET achievements = 101 WHERE user_uid = ?")
                .run(uid);
            const edited = localFiles(paths);
            const stale = await runPrinted(paths, fix);
            expect(stale.code).toBe(6);
            expect(stale.json.error).toMatchObject({ codeRejected: true });
            expect(stale.json.error.confirmationCode).not.toBe(preview.json.error.confirmationCode);
            expect(stale.requests).toEqual([]);
            expect(localFiles(paths)).toEqual(edited);

            const done = await runPrinted(paths, stale.json.error.fix!);
            expect(done.code).toBe(0);
            expect(done.requests).toEqual([]);
            const newUid = done.json.data.uid as string;
            expect(newUid).not.toBe(uid);
            expect(done.json.data).toMatchObject({
                oldUid: uid,
                newUid,
                index,
                changed: true,
                counts: emptyCounts,
            });
            expectConforms(schema, done.json.data);
            expect(listUsers(store).map(row => row.uid)).toEqual(
                index === 0 ? [newUid, otherUid] : [otherUid, newUid]
            );
            expect(readUser(store, otherUid)).toEqual(other);
            expect(readUser(store, uid)).toBeUndefined();
            expect(readUser(store, newUid)).toMatchObject({
                remark: current.remark,
                settings: current.settings,
                data: { updateTime: null, name: null, rating: null },
            });
            expect(readUser(store, newUid)?.data).toEqual({
                updateTime: null,
                name: null,
                rating: null,
            });
            for (const table of tables) {
                expect(
                    store.db.prepare(`SELECT * FROM ${table} WHERE user_uid = ?`).all(uid)
                ).toEqual([]);
            }
            const { users, pendingLxnsAuthorizations } = readCredentials(paths);
            expect(users).not.toHaveProperty(uid);
            expect(users[otherUid]).toEqual(otherEntry);
            if (kind === "lxns") {
                expect(users[newUid]).toEqual({
                    divingFishImportToken: dfToken,
                    lxnsAuthorization: {
                        accessToken: jwt,
                        refreshToken,
                        tokenType: "Bearer",
                        expiresAt: NOW.getTime() + 3_600_000,
                    },
                    lxnsAccountId: lxnsId,
                    lxnsIssuedAt: NOW.getTime(),
                });
                expect(pendingLxnsAuthorizations).toEqual({});
            } else {
                expect(users[newUid]).toEqual(entry);
            }
            noJournal(store);
            expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
            expectPrivate(paths, [preview, wrong, locked, stale, done], verifier);
        }
    );
});

it("rejects an expired LXNS confirmation and prints the restart command without writing", async () => {
    const { paths, store, uid } = fixture("lxns", 1);
    const { line, options, verifier } = await previewCommand(paths, "lxns", uid);
    const preview = await runPrinted(paths, line, options);
    const before = localFiles(paths);
    const result = await runPrinted(paths, preview.json.error.fix!, {
        now: new Date(NOW.getTime() + LXNS_OAUTH_LIFETIME),
    });
    expect(result.json.error.code).toBe("LXNS_REAUTH_REQUIRED");
    expect(result.requests).toEqual([]);
    expect(parsePrintedCommand(result.json.error.fix)).toMatchObject({
        positionals: { user: uid, source: "lxns" },
        options: {},
    });
    expect(localFiles(paths)).toEqual(before);
    noJournal(store);
    expectPrivate(paths, [result], verifier);
});

it("pins a default user's confirmation to its uid and invalidates it after reordering", async () => {
    const { paths, store, uid, other } = fixture("id", 0);
    const { line } = await previewCommand(paths, "id", "0");
    const preview = await runPrinted(paths, line);
    makeDefaultUser(store, otherUid);
    const before = localFiles(paths);
    const stale = await runPrinted(paths, preview.json.error.fix!);
    expect(stale.json.error).toMatchObject({
        code: "CONFIRMATION_REQUIRED",
        codeRejected: true,
        preview: { user: { uid, index: 1 } },
    });
    expect(readUser(store, otherUid)).toEqual(other);
    expect(localFiles(paths)).toEqual(before);
});

it("rolls back the old user's data and discards staged credentials if replacement fails", async () => {
    const { paths, store } = fixture("id", 0);
    const { line } = await previewCommand(paths, "id", "0");
    const preview = await runPrinted(paths, line);
    store.db.exec(
        "CREATE TRIGGER fake_interrupt BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'fake interruption'); END"
    );
    const before = localFiles(paths);
    const result = await runPrinted(paths, preview.json.error.fix!);
    expect(result.json.error.code).toBe("INTERNAL");
    // Credential lock bookkeeping may add WAL frames, but it leaves no rows behind.
    expect(readFileSync(paths.database)).toEqual(before[0]);
    expect(readFileSync(paths.credentials)).toEqual(before[2]);
    expect(listUsers(store).map(row => row.uid)).toEqual(["fake-default-user", otherUid]);
    expect(readUserCounts(store, "fake-default-user")).toEqual(oldCounts);
    noJournal(store);
});

it.each(["id", "lxns"] as const)(
    "refuses sync of the replacement uid before the %s bind publishes credentials",
    async kind => {
        const { paths, store, uid } = fixture(kind, 0);
        const { line, options } = await previewCommand(paths, kind, "0");
        const preview = await runPrinted(paths, line, options);
        const stage = credentialFiles.stageCredentials;
        const clock = vi.spyOn(Date, "now").mockReturnValue(NOW.getTime());
        let sync: ReturnType<typeof commandIn> | undefined;
        const spy = vi
            .spyOn(credentialFiles, "stageCredentials")
            .mockImplementation((paths, content) => {
                const staged = stage(paths, content);
                return {
                    ...staged,
                    commit() {
                        const replacement = listUsers(store)[0].uid;
                        expect(replacement).not.toBe(uid);
                        sync = commandIn(
                            paths,
                            "sync",
                            ["--user", replacement, "--source", "df-token"],
                            {
                                network: {},
                            }
                        );
                        staged.commit();
                    },
                };
            });
        try {
            expect((await runPrinted(paths, preview.json.error.fix!)).code).toBe(0);
            const result = await sync;
            expect(result?.json.error.code).toBe("SYNC_IN_PROGRESS");
            expect(result?.requests).toEqual([]);
        } finally {
            spy.mockRestore();
            clock.mockRestore();
        }
    }
);

it("binds a confirmation code to the identity it previewed", async () => {
    const { paths, uid } = fixture("id", 0);
    const { line } = await previewCommand(paths, "id", uid);
    const preview = await runPrinted(paths, line);
    const code = preview.json.error.confirmationCode;
    const before = localFiles(paths);
    const otherId = String(newGameId + 1);
    const other = await runPrinted(
        paths,
        userBindCommand(uid, "ingame", [], ["--id", otherId, "--yes", code])
    );
    expect(other.json.error).toMatchObject({
        code: "CONFIRMATION_REQUIRED",
        codeRejected: true,
        preview: { after: { inGameId: newGameId + 1 } },
    });
    expect(other.json.error.confirmationCode).not.toBe(code);
    expect(parsePrintedCommand(other.json.error.fix).options.id).toBe(otherId);
    expect(localFiles(paths)).toEqual(before);
});

it("binds an LXNS confirmation code to the exchange it previewed", async () => {
    const { paths, store, uid } = fixture("lxns", 0);
    const first = await previewCommand(paths, "lxns", uid);
    const firstPreview = await runPrinted(paths, first.line, first.options);
    const code = firstPreview.json.error.confirmationCode;

    // Authorize again a minute later: the same new profile, but another exchange.
    const later = { now: new Date(NOW.getTime() + 60_000) };
    const restart = await runPrinted(paths, userBindCommand(uid, "lxns"), later);
    expect(restart.code).toBe(0);
    const state = new URL(restart.json.data.authorizeUrl).searchParams.get("state")!;
    const callback = new URL(env.SALTNET_LXNS_REDIRECT_URI);
    callback.searchParams.set("state", state);
    callback.searchParams.set("code", "FAKE-LXNS-CODE-5678");
    const second = await runPrinted(paths, first.line, {
        ...later,
        stdin: callback.href,
        network: { [tokenUrl]: tokenResponse },
    });
    expect(second.json.error).toMatchObject({
        code: "CONFIRMATION_REQUIRED",
        preview: firstPreview.json.error.preview,
    });
    expect(second.json.error.confirmationCode).not.toBe(code);

    const before = localFiles(paths);
    const stale = await runPrinted(paths, userBindCommand(uid, "lxns", [], ["--yes", code]), later);
    expect(stale.json.error).toMatchObject({
        code: "CONFIRMATION_REQUIRED",
        codeRejected: true,
        confirmationCode: second.json.error.confirmationCode,
    });
    expect(stale.requests).toEqual([]);
    expect(localFiles(paths)).toEqual(before);
    noJournal(store);
});

it("moves only an LXNS authorization of the user's own account to the new uid", async () => {
    const { paths, uid } = fixture("id", 0);
    stageCredentials(paths, {
        version: 1,
        users: {
            [uid]: { ...oldLxns, lxnsAccountId: oldLxnsId + 100, divingFishImportToken: dfToken },
        },
    }).commit();
    const { line } = await previewCommand(paths, "id", uid);
    const preview = await runPrinted(paths, line);
    const done = await runPrinted(paths, preview.json.error.fix!);
    expect(done.code).toBe(0);
    expect(readCredentials(paths).users).toEqual({
        [done.json.data.uid]: { divingFishImportToken: dfToken },
    });
});

it("drops the old uid's pending LXNS authorization and keeps other users' ones", async () => {
    const { paths, uid } = fixture("id", 0);
    const stateOf = async (ref: string) => {
        const start = await runPrinted(paths, userBindCommand(ref, "lxns"));
        expect(start.code).toBe(0);
        return new URL(start.json.data.authorizeUrl).searchParams.get("state")!;
    };
    await stateOf(uid);
    const otherState = await stateOf(otherUid);
    const { line } = await previewCommand(paths, "id", uid);
    const preview = await runPrinted(paths, line);
    const done = await runPrinted(paths, preview.json.error.fix!);
    expect(done.code).toBe(0);
    const pending = readCredentials(paths).pendingLxnsAuthorizations ?? {};
    expect(Object.keys(pending)).toEqual([otherState]);
    expect(pending[otherState]).toMatchObject({ userUid: otherUid });
});

it("does not confirm an exchange whose profile was never checked against its callback", async () => {
    const { paths, store, uid } = fixture("lxns", 0);
    const { line, options, state } = await previewCommand(paths, "lxns", uid);
    const preview = await runPrinted(paths, line, options);
    expect(preview.json.error.code).toBe("CONFIRMATION_REQUIRED");
    // An exchange saved before its profile was checked, as the first LXNS bind wrote it.
    const current = readCredentials(paths);
    const record: Record<string, unknown> = { ...current.pendingLxnsAuthorizations![state!] };
    expect(record.profileChecked).toBe(true);
    delete record.profileChecked;
    type Pending = NonNullable<CredentialsFile["pendingLxnsAuthorizations"]>[string];
    stageCredentials(paths, {
        ...current,
        pendingLxnsAuthorizations: { [state!]: record as unknown as Pending },
    }).commit();
    const before = localFiles(paths);
    const result = await runPrinted(paths, preview.json.error.fix!);
    expect(result.json.error.code).toBe("LXNS_REAUTH_REQUIRED");
    expect(parsePrintedCommand(result.json.error.fix)).toMatchObject({
        positionals: { user: uid, source: "lxns" },
        options: {},
    });
    expect(result.requests).toEqual([]);
    expect(localFiles(paths)).toEqual(before);
    noJournal(store);
});

it("confirms the user whose uid the fix names, even when that uid looks like an index", async () => {
    const paths = makeHome();
    const store = openStore(paths);
    stores.push(store);
    const numeric: User = { ...user("1", "FAKE-NUMERIC-UID"), remark: "FAKE-NUMERIC-USER" };
    numeric.inGame = { id: 99_980_001, name: "FAKE-GAME-NAME", enabled: true, useFastUpdate: true };
    const other = user(otherUid, "FAKE-OTHER-NAME");
    replaceUsers(store, [numeric, other], []);
    const preview = await runPrinted(
        paths,
        userBindCommand("0", "ingame", [], ["--id", String(newGameId)])
    );
    expect(preview.json.error).toMatchObject({
        code: "CONFIRMATION_REQUIRED",
        preview: { user: { uid: "1", index: 0 } },
    });
    const fix = preview.json.error.fix!;
    expect(parsePrintedCommand(fix).positionals.user).toBe("uid:1");
    const done = await runPrinted(paths, fix);
    expect(done.code).toBe(0);
    expect(done.json.data).toMatchObject({ oldUid: "1", index: 0, changed: true });
    expect(readUser(store, otherUid)).toEqual(other);
    expect(readUser(store, done.json.data.uid)?.inGame?.id).toBe(newGameId);
});

it("cancels a pending replacement confirmation when LXNS is unbound", async () => {
    const { paths, store, uid } = fixture("lxns", 1);
    const pending = await previewCommand(paths, "lxns", uid);
    const preview = await runPrinted(paths, pending.line, pending.options);
    expect(preview.json.error?.code).toBe("CONFIRMATION_REQUIRED");
    const unbound = await commandIn(paths, "user", ["unbind", "--", uid, "lxns"]);
    expect(unbound.code).toBe(0);
    const stale = await runPrinted(paths, preview.json.error.fix!);
    expect(stale.json.error?.code).toBe("LXNS_REAUTH_REQUIRED");
    expect(readUser(store, uid)?.lxns?.id).toBeNull();
    expect(readCredentials(paths).users[uid]?.lxnsAuthorization).toBeUndefined();
    expect(readCredentials(paths).pendingLxnsAuthorizations?.[pending.state!]).toBeUndefined();
});

it("cannot apply a stale uid-zero bind confirmation to the new default user", async () => {
    const paths = makeHome();
    const store = openStore(paths);
    stores.push(store);
    const original = user("0", "Original player");
    original.inGame = { id: 99_980_001, name: null, enabled: true, useFastUpdate: true };
    const replacement = user("new-default", "New default");
    replaceUsers(store, [original, replacement], []);
    const preview = await runPrinted(
        paths,
        userBindCommand("0", "ingame", [], ["--id", String(newGameId)])
    );
    expect(preview.json.error?.code).toBe("CONFIRMATION_REQUIRED");
    replaceUsers(store, [replacement], []);
    const stale = await runPrinted(paths, preview.json.error.fix!);
    expect(stale.json.error?.code).toBe("NOT_FOUND");
    const legacy = await runPrinted(
        paths,
        userBindCommand(
            "0",
            "ingame",
            [],
            ["--id", String(newGameId), "--yes", preview.json.error.confirmationCode]
        )
    );
    expect(legacy.json.error?.code).toBe("USAGE");
    expect(legacy.json.error.fix).toBeUndefined();
    expect(readUser(store, "new-default")).toEqual(replacement);
});
