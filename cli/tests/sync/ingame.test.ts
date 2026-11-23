import type { CommandContext } from "../../src/commands/registry";
import type { UserCredentials } from "../../src/runtime/credentials";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { Route } from "../mockHttp";
import { Buffer } from "node:buffer";
import { readFileSync, statSync } from "node:fs";
import { SaltAPIEndpoints } from "@core/integrations/saltnet/client";
import { ComboStatus, SyncStatus } from "@core/mai/types";
import { describe, expect, it } from "vitest";
import { syncDataSchema } from "../../src/commands/sync";
import { CliError } from "../../src/errors";
import { resolveConfig } from "../../src/runtime/config";
import { readCredentials, stageCredentials } from "../../src/runtime/credentials";
import { createHttp } from "../../src/runtime/http";
import { openStore } from "../../src/store/store";
import { postQrGameApi } from "../../src/sync/ingame";
import { readRuns } from "../../src/sync/journal";
import { readScoreEvents, readUsers } from "../../src/users/repository";
import { commandIn, LXNS_URL, NOW, routes } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { delayedRoute, jsonResponse, mockFetch } from "../mockHttp";
import { allFixtureRecords, recordOf, seedScoreUsers, user } from "../scoreUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const uid = "fake-game-user";
const gameId = 99000001;
const otherGameId = 99000002;
const lxnsId = 99000003;
const qrInput = `SGWCMAID${"0".repeat(56)}FAKE0001`;
const qrCode = qrInput.slice(-64);
const qrLink = `https://qr.example.test/?MAID${qrCode}`;
const dfToken = "FAKE-DF-IMPORT-P3-9";
const refreshToken = "FAKE-LXNS-REFRESH-P3-9";
const rotatedToken = "FAKE-LXNS-REFRESH-P3-9-ROTATED";
const backend = "https://game.example.test";
const fallback = "https://game-fallback.example.test";
const getQr = `${backend}/getQRInfo`;
const update = `${backend}/updateUser`;
const lxnsPlayer = `${LXNS_URL}/api/v0/user/maimai/player`;
const lxnsScores = `${lxnsPlayer}/scores`;
const lxnsToken = `${LXNS_URL}/api/v0/oauth/token`;
const dfRecords = "https://www.diving-fish.com/api/maimaidxprober/player/records";

const chart = allFixtureRecords().charts.find(c => c.music.info.type === "SD")!;
const record = recordOf(chart);
const gameRecord = { ...record, fc: ComboStatus.None, fs: SyncStatus.None, play_count: 0 };

function gameResult(userId = gameId, info: object = {}) {
    return jsonResponse({
        userId,
        userName: "Fake Game Player",
        rating: 15000,
        divingFishData: [gameRecord],
        b50: { sd: [gameRecord], dx: [] },
        items: [],
        characters: [],
        info,
    });
}

function jwt(exp: number) {
    const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url");
    const payload = Buffer.from(JSON.stringify({ id: lxnsId, name: "Fake LXNS", exp })).toString(
        "base64url"
    );
    return `${header}.${payload}.FAKE_SIG`;
}

function lxnsCredentials(accessToken: string, expiresAt: number): UserCredentials {
    return {
        lxnsAccountId: lxnsId,
        lxnsIssuedAt: NOW.getTime() - 120_000,
        lxnsAuthorization: { accessToken, tokenType: "Bearer", expiresAt, refreshToken },
    };
}

function fakePlayer(id: number | null = gameId) {
    const player = user(uid, "Fake Local Player", { rating: 14000 });
    player.inGame = { id, enabled: true, useFastUpdate: false };
    return player;
}

function gameSync(
    paths: RuntimePaths,
    args: string[],
    responses: Record<string, Route> = {},
    stdin?: string,
    env: Record<string, string> = {}
) {
    return commandIn(paths, "sync", [...args, "--verbose"], {
        env: { SALTNET_API_URL: backend, SALTNET_API_FALLBACK_URL: fallback, ...env },
        network: routes(responses),
        stdin,
    });
}

type HttpRequestOptions = Parameters<CommandContext["http"]>[0];

/** What `postQrGameApi` needs, with a short deadline that still names the setting asked for. */
function qrContext(fetch: ReturnType<typeof mockFetch>, seen: HttpRequestOptions[] = []) {
    return {
        config: resolveConfig({ env: { SALTNET_API_URL: backend } }),
        http: (options: HttpRequestOptions) => {
            seen.push(options);
            return createHttp({
                timeoutKey: options?.timeoutKey ?? "network.timeoutMs",
                timeoutMs: 20,
                userAgent: "saltnet-cli/fake",
                fetch,
            });
        },
    };
}

function persisted(paths: RuntimePaths) {
    const store = openStore(paths);
    try {
        return {
            users: readUsers(store),
            events: readScoreEvents(store),
            runs: readRuns(store).items,
            scores: store.db.prepare("SELECT * FROM scores").all(),
            b50: store.db.prepare("SELECT * FROM b50_snapshot").all(),
            ratings: store.db.prepare("SELECT * FROM rating_history ORDER BY position").all(),
        };
    } finally {
        store.close();
    }
}

function expectPrivate(
    paths: RuntimePaths,
    result: { stdout: string; stderr: string },
    secrets: string[]
) {
    const saved = readFileSync(paths.database, "utf8");
    for (const secret of secrets) {
        expect(result.stdout).not.toContain(secret);
        expect(result.stderr).not.toContain(secret);
        expect(saved).not.toContain(secret);
    }
}

describe("in-game sync", () => {
    it("looks up a QR link and logs in once, persisting scores, rating, events and a full journal", async () => {
        const paths = makeHome();
        const player = fakePlayer(null);
        player.inGame.useFastUpdate = true;
        await seedScoreUsers(paths, [player]);
        stageCredentials(paths, {
            version: 1,
            users: { [uid]: { divingFishImportToken: dfToken } },
        }).commit();

        const result = await gameSync(
            paths,
            ["--source", "ingame", "--qr", "-"],
            { [getQr]: jsonResponse({ errorID: 0, userID: gameId }), [update]: gameResult() },
            `  ${qrLink}\n`
        );
        expect(result.requests.map(r => r.url)).toEqual([getQr, update]);
        expect(result.requests.map(r => r.init?.method)).toEqual(["POST", "POST"]);
        expect(result.requests.map(r => JSON.parse(r.init?.body ?? "{}"))).toEqual([
            { qrCode },
            { userId: gameId, importToken: "", qrCode },
        ]);
        expect(result.requests[1].init).toMatchObject({ redirect: "manual" });
        expect(result.code).toBe(0);
        expectConforms(syncDataSchema, result.json.data);
        expect(result.json.data).toMatchObject({
            source: "ingame",
            mode: "full",
            rating: { before: 14000, after: 15000 },
            counts: { charts: 1, added: 1 },
            uploads: [],
        });

        const state = persisted(paths);
        expect(state.scores).toHaveLength(1);
        expect(state.b50).toHaveLength(1);
        expect(state.ratings).toEqual([
            expect.objectContaining({ rating: 14000 }),
            expect.objectContaining({ rating: 15000 }),
        ]);
        expect(state.events).toMatchObject([{ source: "inGame" }]);
        expect(state.users[0]).toMatchObject({
            inGame: { id: gameId, name: "Fake Game Player", useFastUpdate: true },
            data: { userId: gameId, rating: 15000 },
        });
        expect(state.runs).toMatchObject([
            { source: "ingame", mode: "full", outcome: "ok", summary: { mode: "full" } },
        ]);
        expect(JSON.stringify(state.runs)).not.toContain(String(gameId));
        expect(result.stdout + result.stderr).not.toContain(String(gameId));
        expectPrivate(paths, result, [qrCode, qrLink, dfToken]);
        expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
    });

    it.each(["short", "https://qr.example.test/?MAIDshort", "  "])(
        "rejects malformed stdin before any request (%j)",
        async input => {
            const paths = makeHome();
            await seedScoreUsers(paths, [fakePlayer()]);
            const result = await gameSync(paths, ["--qr", "-"], {}, input);
            expect(result.code).toBe(4);
            expect(result.json.error.code).toBe("QR_INVALID");
            expect(result.requests).toEqual([]);
            expect(persisted(paths).runs).toEqual([]);
        }
    );

    it("rejects a command-line QR and a QR option for a non-game source", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [fakePlayer()]);
        for (const args of [
            ["--qr", qrInput],
            ["--source", "lxns", "--qr", "-"],
        ]) {
            const result = await gameSync(paths, args, {}, qrInput);
            expect(result.code).toBe(2);
            expect(result.json.error.code).toBe("USAGE");
            expect(result.requests).toEqual([]);
            expectPrivate(paths, result, [qrCode]);
        }
    });

    it("requires a QR code without a stored id and points to the selected user", async () => {
        const paths = makeHome();
        const other = { ...fakePlayer(null), uid: "fake second user" };
        await seedScoreUsers(paths, [fakePlayer(), other]);
        const result = await gameSync(paths, ["--user", other.uid]);
        expect(result.code).toBe(4);
        expect(result.json.error).toMatchObject({
            code: "QR_REQUIRED",
            fix: "saltnet sync --user 'fake second user' --source ingame --qr -",
        });
        expect(result.requests).toEqual([]);
    });

    it("reports expiration from the lookup or from the subsequent login", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [fakePlayer()]);
        const expiredLookup = await gameSync(
            paths,
            ["--qr", "-"],
            { [getQr]: jsonResponse({ errorID: 1, error: qrCode }) },
            qrInput
        );
        expect(expiredLookup.requests.map(r => r.url)).toEqual([getQr]);
        expect(expiredLookup.json.error.code).toBe("QR_INVALID");

        const expiredLogin = await gameSync(
            paths,
            ["--qr", "-"],
            {
                [getQr]: jsonResponse({ errorID: 0, userID: gameId }),
                [update]: jsonResponse({ error: `二维码已过期 ${qrCode}` }, 400),
            },
            qrInput
        );
        expect(expiredLogin.requests.map(r => r.url)).toEqual([getQr, update]);
        expect(expiredLogin.json.error.code).toBe("QR_INVALID");
        expect(persisted(paths).runs).toMatchObject([
            { mode: "full", outcome: "failed", errorCode: "QR_INVALID" },
        ]);
        expectPrivate(paths, expiredLookup, [qrCode]);
        expectPrivate(paths, expiredLogin, [qrCode]);
    });

    it("refuses another account before login, catalog refresh or any persistent write", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [fakePlayer()]);
        const before = persisted(paths);
        const result = await gameSync(
            paths,
            ["--qr", "-"],
            { [getQr]: jsonResponse({ errorID: 0, userID: otherGameId }), [update]: gameResult() },
            qrInput
        );
        expect(result.code).toBe(2);
        expect(result.json.error).toMatchObject({
            code: "USAGE",
            message: "二维码属于另一个舞萌账号",
        });
        expect(result.requests.map(r => r.url)).toEqual([getQr]);
        expect(persisted(paths)).toEqual(before);
        expectPrivate(paths, result, [qrCode, String(otherGameId)]);
    });

    it.each([getQr, update])("does not send a QR again after HTTP 5xx from %s", async endpoint => {
        const paths = makeHome();
        await seedScoreUsers(paths, [fakePlayer()]);
        const result = await gameSync(
            paths,
            ["--qr", "-"],
            {
                [getQr]: jsonResponse({ errorID: 0, userID: gameId }),
                [update]: gameResult(),
                [endpoint]: jsonResponse({ error: `echo: ${qrCode} ${gameId}` }, 503),
                [`${fallback}/getQRInfo`]: jsonResponse({ errorID: 0, userID: gameId }),
                [`${fallback}/updateUser`]: gameResult(),
            },
            qrInput
        );
        expect(result.code).toBe(5);
        expect(result.json.error).toMatchObject({ code: "UPSTREAM_ERROR", retryable: false });
        expect(result.requests.map(r => r.url)).toEqual(
            endpoint === getQr ? [getQr] : [getQr, update]
        );
        expect(result.stdout + result.stderr).not.toContain(String(gameId));
        expectPrivate(paths, result, [qrCode]);
        const state = persisted(paths);
        expect(state.scores).toEqual([]);
        expect(state.runs).toEqual(
            endpoint === getQr
                ? []
                : [
                      expect.objectContaining({
                          mode: "full",
                          outcome: "failed",
                          errorCode: "UPSTREAM_ERROR",
                      }),
                  ]
        );
    });

    it("discards request details and the underlying cause on a QR transport failure", async () => {
        const secretDetails = `connection failed for ${qrCode} user ${gameId}`;
        const fetch = mockFetch({
            [update]: () => {
                throw new Error(secretDetails, { cause: new Error(secretDetails) });
            },
        });
        const ctx = {
            config: resolveConfig({ env: { SALTNET_API_URL: backend } }),
            http: () =>
                createHttp({
                    timeoutKey: "network.updateTimeoutMs",
                    timeoutMs: 1000,
                    userAgent: "saltnet-cli/fake",
                    fetch,
                }),
        };
        const error: unknown = await postQrGameApi(ctx, SaltAPIEndpoints.UpdateUser, {
            qrCode,
            userId: gameId,
        }).catch((error: unknown) => error);
        expect(fetch.requests).toHaveLength(1);
        if (!(error instanceof CliError)) throw new Error("Expected a CliError");
        expect(error).toMatchObject({ code: "NETWORK", retryable: false });
        expect(error.cause).toBeUndefined();
        expect(error.stack).not.toContain(qrCode);
        expect(error.stack).not.toContain(String(gameId));
    });

    it("rejects an echoed credential even in a successful response body", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [fakePlayer()]);
        const result = await gameSync(
            paths,
            ["--qr", "-"],
            {
                [getQr]: jsonResponse({ errorID: 0, userID: gameId }),
                [update]: gameResult(gameId, { echo: qrCode }),
            },
            qrInput
        );
        expect(result.code).toBe(5);
        const state = persisted(paths);
        expect(state.scores).toEqual([]);
        expect(state.runs).toMatchObject([{ mode: "full", outcome: "failed" }]);
        expectPrivate(paths, result, [qrCode]);
    });

    it("does not leak a player id from a retried fast request", async () => {
        const paths = makeHome();
        const player = fakePlayer();
        player.data.name = null;
        await seedScoreUsers(paths, [player]);
        const result = await gameSync(paths, ["--source", "ingame"], {
            [update]: () => {
                throw new Error(`connection failed for ${gameId}`);
            },
            [`${fallback}/updateUser`]: jsonResponse(
                { error: `request failed for ${gameId}` },
                400
            ),
        });
        expect(result.requests.map(r => r.url)).toEqual([update, update, `${fallback}/updateUser`]);
        expect(result.code).toBe(5);
        expect(result.json.error.code).toBe("UPSTREAM_ERROR");
        const state = persisted(paths);
        expect(state.scores).toEqual([]);
        expect(state.runs).toMatchObject([{ mode: "fast", outcome: "failed" }]);
        expect(result.stdout + result.stderr + JSON.stringify(state.runs)).not.toContain(
            String(gameId)
        );
    });

    it("auto prefers the game, refreshes LXNS under the journaled sync lock and supplements scores", async () => {
        const paths = makeHome();
        const player = fakePlayer();
        player.data.name = null; // Display-name fallback must stay out of logs and the journal.
        player.lxns = { id: lxnsId, name: "Fake LXNS", auth: null };
        await seedScoreUsers(paths, [player]);
        const expired = NOW.getTime() - 10_000;
        const expiredJwt = jwt(expired / 1000);
        const newJwt = jwt(NOW.getTime() / 1000 + 3600);
        stageCredentials(paths, {
            version: 1,
            users: {
                [uid]: { ...lxnsCredentials(expiredJwt, expired), divingFishImportToken: dfToken },
            },
        }).commit();

        const result = await gameSync(paths, [], {
            [update]: gameResult(),
            [lxnsToken]: () => {
                const store = openStore(paths);
                try {
                    expect(readRuns(store).items).toMatchObject([
                        { source: "ingame", mode: "fast", outcome: "running" },
                    ]);
                    const lock = store.db
                        .prepare("SELECT name FROM locks WHERE name = ?")
                        .get(`sync:${uid}`);
                    expect(lock).toBeDefined();
                } finally {
                    store.close();
                }
                return jsonResponse({
                    access_token: newJwt,
                    refresh_token: rotatedToken,
                    token_type: "Bearer",
                    expires_in: 3600,
                });
            },
            [lxnsPlayer]: jsonResponse({
                success: true,
                data: { name: "Fake LXNS", rating: 11100 },
            }),
            [lxnsScores]: jsonResponse({
                success: true,
                data: [
                    {
                        id: record.song_id,
                        song_name: record.title,
                        level: record.level,
                        level_index: record.level_index,
                        type: "standard",
                        achievements: 99.1,
                        fc: "ap",
                        fs: "sync",
                        dx_score: 1234,
                        dx_rating: 150,
                        rate: "ss",
                    },
                ],
            }),
        });

        expect(result.requests.map(r => r.url)).toEqual([
            update,
            lxnsToken,
            lxnsPlayer,
            lxnsScores,
        ]);
        expect(JSON.parse(result.requests[0].init?.body ?? "{}")).toEqual({
            userId: gameId,
            importToken: "",
        });
        for (const req of result.requests.slice(-2)) {
            expect(req.init?.headers?.Authorization).toBe(`Bearer ${newJwt}`);
        }
        expect(result.code).toBe(0);
        expectConforms(syncDataSchema, result.json.data);
        expect(result.json.data).toMatchObject({
            mode: "fast",
            source: "ingame",
            rating: { after: 15000 },
            uploads: [],
        });
        const state = persisted(paths);
        expect(state.users[0].data.b50?.sd[0]).toMatchObject({
            achievements: gameRecord.achievements,
            dxScore: gameRecord.dxScore,
            fc: "ap",
            fs: "sync",
        });
        expect(Object.values(state.users[0].data.detailed ?? {})).toMatchObject([
            { fc: "ap", fs: "sync" },
        ]);
        expect(state.runs).toMatchObject([{ mode: "fast", outcome: "ok" }]);
        expect(JSON.stringify(state.runs)).not.toContain(String(gameId));
        expect(result.stdout + result.stderr).not.toContain(String(gameId));
        expectPrivate(paths, result, [expiredJwt, newJwt, refreshToken, rotatedToken, dfToken]);
        expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
        expect(readCredentials(paths).users[uid].lxnsAuthorization).toMatchObject({
            accessToken: newJwt,
            refreshToken: rotatedToken,
        });
    });

    it.each([
        "df-only",
        "lxns-request-fails",
        "lxns-refresh-fails",
        "both-fail",
        "no-binding",
    ] as const)("uses the game data with the available supplement (%s)", async scenario => {
        const paths = makeHome();
        const player = fakePlayer();
        player.divingFish.name = "fake-public-name";
        player.lxns = { id: lxnsId, name: "Fake LXNS", auth: null };
        await seedScoreUsers(paths, [player]);
        const valid = NOW.getTime() + 3_600_000;
        const access = jwt(valid / 1000);
        const withLxns = scenario !== "df-only" && scenario !== "no-binding";
        const refreshFails = scenario === "lxns-refresh-fails";
        const withDf = scenario !== "no-binding";
        const dfSucceeds = withDf && scenario !== "both-fail";
        stageCredentials(paths, {
            version: 1,
            users: {
                [uid]: {
                    ...(withLxns && lxnsCredentials(access, refreshFails ? NOW.getTime() : valid)),
                    ...(withDf && { divingFishImportToken: dfToken }),
                },
            },
        }).commit();

        const result = await gameSync(paths, [], {
            [update]: gameResult(),
            [lxnsPlayer]: jsonResponse({ success: false, message: access }, 403),
            [lxnsToken]: jsonResponse(
                { error: "invalid_grant", error_description: refreshToken },
                400
            ),
            [dfRecords]: req => {
                expect(req.init?.headers?.["Import-Token"]).toBe(dfToken);
                return dfSucceeds
                    ? jsonResponse({ records: [{ ...record, achievements: 98, play_count: 42 }] })
                    : jsonResponse({ message: dfToken }, 403);
            },
        });
        expect(result.requests.map(r => r.url)).toEqual([
            update,
            ...(withLxns ? [refreshFails ? lxnsToken : lxnsPlayer] : []),
            ...(withDf ? [dfRecords] : []),
        ]);
        expect(result.code).toBe(0);
        expect(result.json.data).toMatchObject({
            source: "ingame",
            mode: "fast",
            counts: { charts: 1 },
        });
        const state = persisted(paths);
        expect(Object.values(state.users[0].data.detailed ?? {})).toMatchObject([
            { achievements: gameRecord.achievements, play_count: dfSucceeds ? 42 : 0 },
        ]);
        expect(state.runs).toMatchObject([{ mode: "fast", outcome: "ok" }]);
        expectPrivate(paths, result, [access, refreshToken, dfToken]);
    });

    it.each([
        [SaltAPIEndpoints.GetQRInfo, "network.timeoutMs"],
        [SaltAPIEndpoints.UpdateUser, "network.updateTimeoutMs"],
    ] as const)("sends %s once and names %s when it times out", async (endpoint, key) => {
        const fetch = mockFetch({ [`${backend}/${endpoint}`]: delayedRoute(gameResult(), 1000) });
        const seen: HttpRequestOptions[] = [];
        const ctx = qrContext(fetch, seen);
        const network = ctx.config.values.network;
        const error: unknown = await postQrGameApi(ctx, endpoint, {
            qrCode,
            userId: gameId,
        }).catch((error: unknown) => error);
        expect(seen).toEqual([
            {
                retry: false,
                timeoutMs:
                    key === "network.timeoutMs" ? network.timeoutMs : network.updateTimeoutMs,
                timeoutKey: key,
            },
        ]);
        expect(fetch.requests).toHaveLength(1);
        expect(fetch.requests[0].init).toMatchObject({ redirect: "manual" });
        expect(error).toMatchObject({
            code: "NETWORK",
            retryable: false,
            fix: expect.stringContaining(`saltnet config set ${key} `),
        });
    });

    it.each([
        [{ error: "QR_INVALID" }, 400],
        [{ error: "QR_INVALID" }, 200],
        [{ errorID: 3, error: `echo ${qrCode}` }, 200],
        [{ error: "QR code is expired" }, 400],
    ])("reads the backend answer %j with HTTP %i as an expired QR code", async (body, status) => {
        const fetch = mockFetch({ [update]: jsonResponse(body, status) });
        const error: unknown = await postQrGameApi(qrContext(fetch), SaltAPIEndpoints.UpdateUser, {
            qrCode,
            userId: gameId,
        }).catch((error: unknown) => error);
        expect(fetch.requests).toHaveLength(1);
        if (!(error instanceof CliError)) throw new Error("Expected a CliError");
        expect(error).toMatchObject({ code: "QR_INVALID", message: "二维码无效或已过期" });
        expect(error.cause).toBeUndefined();
        expect(error.stack).not.toContain(qrCode);
    });

    it.each([
        { errorID: 0, userID: 0 },
        { errorID: 0, userID: -1 },
        { errorID: 0, userID: 1.5 },
        { errorID: 0, userID: 2 ** 53 },
        { errorID: 0, userID: String(gameId) },
        { userID: gameId },
    ])("refuses the QR lookup answer %j before login", async answer => {
        const paths = makeHome();
        await seedScoreUsers(paths, [fakePlayer()]);
        const before = persisted(paths);
        const result = await gameSync(
            paths,
            ["--qr", "-"],
            { [getQr]: jsonResponse(answer), [update]: gameResult() },
            qrInput
        );
        expect(result.code).toBe(5);
        expect(result.json.error).toMatchObject({
            code: "UPSTREAM_ERROR",
            message: "舞萌服务返回的用户 ID 无效",
        });
        expect(result.requests.map(r => r.url)).toEqual([getQr]);
        expect(persisted(paths)).toEqual(before);
        expectPrivate(paths, result, [qrCode]);
    });

    it.each(["fast", "full"] as const)("refuses a %s update for another account", async mode => {
        const paths = makeHome();
        await seedScoreUsers(paths, [fakePlayer()]);
        const full = mode === "full";
        const result = await gameSync(
            paths,
            full ? ["--qr", "-"] : ["--source", "ingame"],
            {
                [getQr]: jsonResponse({ errorID: 0, userID: gameId }),
                [update]: gameResult(otherGameId),
            },
            full ? qrInput : undefined
        );
        expect(result.requests.map(r => r.url)).toEqual(full ? [getQr, update] : [update]);
        expect(result.code).toBe(5);
        expect(result.json.error).toMatchObject({
            code: "UPSTREAM_ERROR",
            message: "舞萌服务返回的账号与本次同步账号不符",
        });
        const state = persisted(paths);
        expect(state.scores).toEqual([]);
        expect(state.users[0].data.rating).toBe(14000);
        expect(state.runs).toMatchObject([
            { mode, outcome: "failed", errorCode: "UPSTREAM_ERROR" },
        ]);
        expect(result.stdout + result.stderr + JSON.stringify(state.runs)).not.toContain(
            String(otherGameId)
        );
        expectPrivate(paths, result, [qrCode]);
    });

    it("refuses an update that repeats an LXNS token refreshed during the sync", async () => {
        const paths = makeHome();
        const player = fakePlayer();
        player.lxns = { id: lxnsId, name: "Fake LXNS", auth: null };
        await seedScoreUsers(paths, [player]);
        const expired = NOW.getTime() - 10_000;
        const expiredJwt = jwt(expired / 1000);
        const newJwt = jwt(NOW.getTime() / 1000 + 3600);
        stageCredentials(paths, {
            version: 1,
            users: { [uid]: lxnsCredentials(expiredJwt, expired) },
        }).commit();
        const result = await gameSync(paths, [], {
            [update]: gameResult(gameId, { echo: newJwt }),
            [lxnsToken]: jsonResponse({
                access_token: newJwt,
                refresh_token: rotatedToken,
                token_type: "Bearer",
                expires_in: 3600,
            }),
            [lxnsPlayer]: jsonResponse({ success: true, data: { name: "Fake LXNS", rating: 1 } }),
            [lxnsScores]: jsonResponse({ success: true, data: [] }),
        });
        expect(result.requests.map(r => r.url)).toEqual([
            update,
            lxnsToken,
            lxnsPlayer,
            lxnsScores,
        ]);
        expect(result.code).toBe(5);
        expect(result.json.error).toMatchObject({
            code: "UPSTREAM_ERROR",
            message: "舞萌成绩响应包含凭据，无法保存",
        });
        const state = persisted(paths);
        expect(state.scores).toEqual([]);
        expect(state.runs).toMatchObject([
            { mode: "fast", outcome: "failed", errorCode: "UPSTREAM_ERROR" },
        ]);
        expectPrivate(paths, result, [expiredJwt, newJwt, refreshToken, rotatedToken]);
        // The refresh itself is kept: the old refresh token may already be spent.
        expect(readCredentials(paths).users[uid].lxnsAuthorization).toMatchObject({
            accessToken: newJwt,
            refreshToken: rotatedToken,
        });
    });

    it("waits for a fast update as long as the update timeout allows", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [fakePlayer()]);
        const result = await gameSync(
            paths,
            ["--source", "ingame"],
            { [update]: delayedRoute(gameResult(), 300) },
            undefined,
            { SALTNET_NETWORK_TIMEOUT_MS: "100", SALTNET_NETWORK_UPDATE_TIMEOUT_MS: "5000" }
        );
        expect(result.requests.map(r => r.url)).toEqual([update]);
        expect(result.code).toBe(0);
        expect(result.json.data).toMatchObject({ source: "ingame", mode: "fast" });
    });

    it.each([
        [
            "HTTP 503",
            () => jsonResponse({ error: `busy for ${gameId}` }, 503),
            { code: "UPSTREAM_ERROR", message: "舞萌服务返回了 HTTP 503", retryable: true },
        ],
        [
            "a transport failure",
            () => {
                throw new Error(`connection failed for ${gameId}`);
            },
            { code: "NETWORK", message: "连接舞萌服务失败", retryable: true },
        ],
    ] as const)(
        "reports a fast update that fails with %s at both addresses",
        async (_kind, route, error) => {
            const paths = makeHome();
            await seedScoreUsers(paths, [fakePlayer()]);
            const fallbackUpdate = `${fallback}/updateUser`;
            const result = await gameSync(paths, ["--source", "ingame"], {
                [update]: route,
                [fallbackUpdate]: route,
            });
            expect(result.requests.map(r => r.url)).toEqual([
                update,
                update,
                fallbackUpdate,
                fallbackUpdate,
            ]);
            expect(result.code).toBe(5);
            expect(result.json.error).toMatchObject(error);
            const state = persisted(paths);
            expect(state.scores).toEqual([]);
            expect(state.runs).toMatchObject([
                { mode: "fast", outcome: "failed", errorCode: error.code },
            ]);
            expect(result.stdout + result.stderr + JSON.stringify(state.runs)).not.toContain(
                String(gameId)
            );
        }
    );

    it("suggests the game when another bound source fails", async () => {
        const paths = makeHome();
        const player = fakePlayer();
        player.lxns = { id: lxnsId, name: "Fake LXNS", auth: null };
        await seedScoreUsers(paths, [player]);
        const valid = NOW.getTime() + 3_600_000;
        const access = jwt(valid / 1000);
        stageCredentials(paths, {
            version: 1,
            users: { [uid]: lxnsCredentials(access, valid) },
        }).commit();
        const result = await gameSync(paths, ["--source", "lxns"], {
            [lxnsPlayer]: jsonResponse({ success: false, message: access }, 401),
        });
        expect(result.requests.map(r => r.url)).toEqual([lxnsPlayer]);
        expect(result.code).toBe(4);
        expect(result.json.error).toMatchObject({
            code: "NOT_BOUND",
            fix: "saltnet user bind 0 lxns；或尝试其他已绑定来源：saltnet sync --source ingame",
        });
        expectPrivate(paths, result, [access, refreshToken]);
    });
});
