import type { CommandContext } from "../../src/commands/registry";
import type { UserCredentials } from "../../src/runtime/credentials";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { Route } from "../mockHttp";
import { Buffer } from "node:buffer";
import { readFileSync, statSync } from "node:fs";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { SaltAPIEndpoints } from "@core/integrations/saltnet/client";
import { ComboStatus, SyncStatus } from "@core/mai/types";
import { describe, expect, it, vi } from "vitest";
import { createRegistry } from "../../src/commands";
import { syncDataSchema } from "../../src/commands/sync";
import { CliError } from "../../src/errors";
import { resolveConfig } from "../../src/runtime/config";
import { readCredentials, stageCredentials } from "../../src/runtime/credentials";
import { createHttp } from "../../src/runtime/http";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { postQrGameApi } from "../../src/sync/ingame";
import { readRuns } from "../../src/sync/journal";
import * as syncLock from "../../src/sync/lock";
import { readScoreEvents, readUsers, saveUser } from "../../src/users/repository";
import { commandIn, LXNS_URL, META_URL, NOW, routes } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { createHarness, run } from "../harness";
import { delayedRoute, jsonResponse, mockFetch } from "../mockHttp";
import { parsePrintedCommand } from "../printedCommand";
import { allFixtureRecords, recordOf, scoreEvent, seedScoreUsers, user } from "../scoreUsers";
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
            gameIds: store.db.prepare("SELECT uid, in_game_id FROM users ORDER BY position").all(),
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
    const journal = JSON.stringify(persisted(paths).runs);
    for (const secret of secrets) {
        expect(result.stdout).not.toContain(secret);
        expect(result.stderr).not.toContain(secret);
        expect(saved).not.toContain(secret);
        expect(journal).not.toContain(secret);
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
            ["--source", "ingame", "--qr", "-", "--no-upload"],
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
        expect(result.json.warnings).toEqual([]);
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

        const alone = makeHome();
        await seedScoreUsers(alone, [fakePlayer(null)]);
        const own = await gameSync(alone, []);
        expect(own.json.error).toMatchObject({
            code: "QR_REQUIRED",
            fix: "saltnet sync --source ingame --qr -",
        });
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
                [getQr]: jsonResponse({ errorID: 0, userID: otherGameId }),
                [update]: jsonResponse({ error: `二维码已过期 ${qrCode}` }, 400),
            },
            qrInput
        );
        expect(expiredLogin.requests.map(r => r.url)).toEqual([getQr, update]);
        expect(expiredLogin.json.error.code).toBe("QR_INVALID");
        expect(expiredLogin.json.warnings).toBeUndefined();
        const state = persisted(paths);
        expect(state.users[0].inGame.id).toBe(gameId);
        expect(state.runs).toMatchObject([
            { mode: "full", outcome: "failed", errorCode: "QR_INVALID" },
        ]);
        expectPrivate(paths, expiredLookup, [qrCode]);
        expectPrivate(paths, expiredLogin, [qrCode]);
    });

    it("rewrites the game ID by default and appends score events under the same UID", async () => {
        const paths = makeHome();
        const player = fakePlayer();
        const recordKey = `${gameRecord.song_id}-${gameRecord.level_index}`;
        const previousScore = { ...gameRecord, achievements: 98 };
        player.data.detailed = { [recordKey]: previousScore };
        const previousEvent = scoreEvent("fake-existing-event", uid, recordKey, 1);
        previousEvent.state.achievements = previousScore.achievements;
        await seedScoreUsers(paths, [player], [previousEvent]);
        stageCredentials(paths, {
            version: 1,
            users: { [uid]: { divingFishImportToken: dfToken } },
        }).commit();

        const result = await gameSync(
            paths,
            ["--qr", "-", "--no-upload"],
            {
                [getQr]: jsonResponse({ errorID: 0, userID: otherGameId }),
                [update]: gameResult(otherGameId),
            },
            qrInput
        );
        expect(result.code).toBe(0);
        expect(result.requests.map(r => r.url)).toEqual([getQr, update]);
        expect(JSON.parse(result.requests[1].init!.body!)).toEqual({
            userId: otherGameId,
            importToken: "",
            qrCode,
        });
        expect(result.json.data).toMatchObject({
            user: { uid },
            mode: "full",
            changes: [{ before: { achievements: 98 }, score: { achievements: 100 } }],
            uploads: [],
        });
        expect(result.json.warnings).toEqual([
            {
                code: "GAME_ACCOUNT_CHANGED",
                message:
                    "二维码属于另一个舞萌账号，已将用户 Fake Local Player 的游戏 ID 改为该账号",
                fix: "saltnet config set sync.qrOtherAccount error",
            },
        ]);
        expect(parsePrintedCommand(result.json.warnings[0].fix)).toMatchObject({
            command: "config set",
            positionals: { key: "sync.qrOtherAccount", value: "error" },
        });
        expect(result.stdout + result.stderr).not.toContain(String(gameId));
        expect(result.stdout + result.stderr).not.toContain(String(otherGameId));

        const state = persisted(paths);
        expect(state.gameIds).toEqual([{ uid, in_game_id: otherGameId }]);
        expect(state.users).toMatchObject([
            { uid, inGame: { id: otherGameId }, data: { userId: otherGameId } },
        ]);
        expect(state.events).toMatchObject([
            previousEvent,
            {
                userUid: uid,
                generationId: previousEvent.generationId,
                chartKey: recordKey,
                kind: "change",
                state: { achievements: 100 },
            },
        ]);
        expect(state.runs).toMatchObject([{ userUid: uid, mode: "full", outcome: "ok" }]);
        const shown = await commandIn(paths, "user", ["show", uid], { network: {} });
        expect(shown.json.data).toMatchObject({ uid, inGame: { id: otherGameId } });
        expectPrivate(paths, result, [qrCode, dfToken]);
    });

    it.each(["0", "-fake QR player"])(
        "refuses another account in error mode before locking or writing for %s",
        async userRef => {
            const paths = makeHome();
            const player = { ...fakePlayer(), uid: userRef === "0" ? uid : userRef };
            const players = userRef === "0" ? [player] : [user(uid, "Fake Default Player"), player];
            await seedScoreUsers(paths, players);
            const accessToken = jwt(NOW.getTime() / 1000 + 3600);
            stageCredentials(paths, {
                version: 1,
                users: {
                    [player.uid]: {
                        ...lxnsCredentials(accessToken, NOW.getTime() + 3_600_000),
                        divingFishImportToken: dfToken,
                    },
                },
            }).commit();
            const before = readFileSync(paths.database);
            const credentialsBefore = readFileSync(paths.credentials);
            const lock = vi.spyOn(syncLock, "withSyncLock");
            const result = await gameSync(
                paths,
                [`--user=${userRef}`, "--qr", "-"],
                { [getQr]: jsonResponse({ errorID: 0, userID: otherGameId }) },
                qrInput,
                { SALTNET_SYNC_QR_OTHER_ACCOUNT: "error" }
            ).finally(() => {
                const lockCalls = lock.mock.calls.length;
                lock.mockRestore();
                expect(lockCalls).toBe(0);
            });
            expect(result.code).toBe(2);
            expect(result.json.error).toMatchObject({
                code: "USAGE",
                message: "二维码属于另一个舞萌账号",
            });
            expect(parsePrintedCommand(result.json.error.fix)).toMatchObject({
                command: "user bind",
                positionals: { user: userRef, source: "ingame" },
                options: { qr: "-" },
            });
            expect(result.requests.map(r => r.url)).toEqual([getQr]);
            expect(readFileSync(paths.database)).toEqual(before);
            expect(readFileSync(paths.credentials)).toEqual(credentialsBefore);
            expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
            expect(persisted(paths).runs).toEqual([]);
            expectPrivate(paths, result, [qrCode, dfToken, accessToken, refreshToken]);
        }
    );

    it.each([
        { policy: "rewrite", initialId: gameId, lockedId: otherGameId, warned: true },
        { policy: "rewrite", initialId: otherGameId, lockedId: gameId, warned: false },
        { policy: "error", initialId: gameId, lockedId: otherGameId, warned: false },
    ])("uses the locked ID in $policy mode after a binding change", async scenario => {
        const paths = makeHome();
        await seedScoreUsers(paths, [fakePlayer(scenario.initialId)]);
        const withSyncLock = syncLock.withSyncLock;
        const lock = vi.spyOn(syncLock, "withSyncLock").mockImplementationOnce((...args) => {
            const store = openStore(paths);
            try {
                store.transaction(() => saveUser(store, fakePlayer(scenario.lockedId)));
            } finally {
                store.close();
            }
            return withSyncLock(...args);
        });

        const result = await gameSync(
            paths,
            ["--qr", "-"],
            { [getQr]: jsonResponse({ errorID: 0, userID: gameId }), [update]: gameResult() },
            qrInput,
            { SALTNET_SYNC_QR_OTHER_ACCOUNT: scenario.policy }
        ).finally(() => lock.mockRestore());
        const state = persisted(paths);
        if (scenario.policy === "error") {
            expect(result.code).toBe(2);
            expect(result.json.error.code).toBe("USAGE");
            expect(parsePrintedCommand(result.json.error.fix)).toMatchObject({
                command: "user bind",
                positionals: { user: "0", source: "ingame" },
                options: { qr: "-" },
            });
            expect(result.requests.map(r => r.url)).toEqual([getQr]);
            expect(state.users[0].inGame.id).toBe(scenario.lockedId);
            expect(state.runs).toEqual([]);
        } else {
            expect(result.code).toBe(0);
            expect(result.requests.map(r => r.url)).toEqual([getQr, update]);
            expect(state.users[0].inGame.id).toBe(gameId);
            expect(result.json.warnings.some(w => w.code === "GAME_ACCOUNT_CHANGED")).toBe(
                scenario.warned
            );
        }
        expectPrivate(paths, result, [qrCode]);
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
        expect(result.requests.map(r => r.url)).toEqual([update, `${fallback}/updateUser`]);
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

        const result = await gameSync(paths, ["--no-upload"], {
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

        const result = await gameSync(paths, ["--no-upload"], {
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
        expect(error).toMatchObject({ code: "NETWORK", retryable: false });
        if (!(error instanceof CliError)) throw new Error("Expected a CliError");
        expect(parsePrintedCommand(error.fix)).toMatchObject({
            command: "config set",
            positionals: { key },
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
            message: expect.stringContaining("舞萌成绩响应包含凭据，无法保存"),
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

    it("does not log in after another owner takes the expired sync lock during metadata refresh", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [fakePlayer()]);
        const store = openStore(paths);
        const syncTime = new Date(NOW.getTime() + 2 * 86_400_000);
        let lockTime = syncTime.getTime();
        const now = () => lockTime;
        const original = syncLock.withSyncLock;
        const lock = vi
            .spyOn(syncLock, "withSyncLock")
            .mockImplementationOnce((db, user, work) => original(db, user, work, { now }));
        try {
            const result = await commandIn(paths, "sync", ["--qr", "-"], {
                now: syncTime,
                stdin: qrInput,
                env: { SALTNET_API_URL: backend, SALTNET_API_FALLBACK_URL: fallback },
                network: {
                    [getQr]: jsonResponse({ errorID: 0, userID: gameId }),
                    [META_URL]: () => {
                        lockTime += syncLock.DEFAULT_SYNC_LOCK_TTL_MS + 1;
                        const nextOwner = acquireLock(store, `sync:${uid}`, { ttlMs: 1000, now });
                        expect(nextOwner.acquired).toBe(true);
                        return jsonResponse(getFixtureSaltMetaCompacted());
                    },
                    [update]: gameResult(),
                },
            });
            expect(result.requests.map(request => request.url)).toEqual([getQr, META_URL]);
            expect(result.json.error).toMatchObject({
                code: "INTERNAL",
                message: expect.stringContaining("同步锁已失效"),
            });
            expect(persisted(paths).scores).toEqual([]);
        } finally {
            lock.mockRestore();
            store.close();
        }
    });

    it("retries a fast update once at the primary address when fallback is disabled", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [fakePlayer()]);
        const result = await gameSync(
            paths,
            ["--source", "ingame"],
            { [update]: jsonResponse({ error: "Busy" }, 503) },
            undefined,
            { SALTNET_API_FALLBACK_URL: "" }
        );
        expect(result.requests.map(request => request.url)).toEqual([update, update]);
        expect(result.json.error).toMatchObject({
            code: "UPSTREAM_ERROR",
            message: "舞萌服务返回了 HTTP 503",
        });
    });

    it.each(["fast", "full"] as const)(
        "rejects an incomplete %s game reply and journals the failure",
        async mode => {
            const paths = makeHome();
            await seedScoreUsers(paths, [fakePlayer()]);
            const before = persisted(paths);
            const full = mode === "full";
            const result = await gameSync(
                paths,
                full ? ["--qr", "-"] : [],
                {
                    [getQr]: jsonResponse({ errorID: 0, userID: gameId }),
                    [update]: jsonResponse({}),
                },
                full ? qrInput : undefined
            );
            expect(result.requests.map(request => request.url)).toEqual(
                full ? [getQr, update] : [update]
            );
            expect(result.json.error).toMatchObject({
                code: "UPSTREAM_ERROR",
                message: "舞萌服务返回的数据不完整",
            });
            const state = persisted(paths);
            expect(state.users).toEqual(before.users);
            expect(state.events).toEqual(before.events);
            expect(state.runs).toMatchObject([
                { mode, outcome: "failed", errorCode: "UPSTREAM_ERROR" },
            ]);
        }
    );

    it.each([false, true])(
        "requires a configured backend before game sync or planning (QR: %s)",
        async full => {
            const paths = makeHome();
            await seedScoreUsers(paths, [fakePlayer()]);
            const args = ["--source", "ingame", ...(full ? ["--qr", "-"] : [])];
            const env = { SALTNET_API_URL: "", SALTNET_API_FALLBACK_URL: "" };
            const harness = createHarness({
                env: { ...env, SALTNET_HOME: paths.home },
                stdin: qrInput,
            });
            const code = await run(createRegistry(), harness, "sync", ...args);
            expect(code).toBe(2);
            expect(harness.readStdin).not.toHaveBeenCalled();
            expect(harness.fetch).not.toHaveBeenCalled();
            const { error } = JSON.parse(harness.stdout());
            expect(error).toMatchObject({
                code: "USAGE",
                message: expect.stringContaining("api.url"),
            });
            expect(parsePrintedCommand(error.fix)).toMatchObject({
                command: "config set",
                positionals: { key: "api.url", value: "<地址>" },
            });
            const plan = await commandIn(paths, "sync", [...args, "--dry-run"], {
                env,
                network: {},
            });
            expect(plan.json.data.plans).toMatchObject([
                {
                    source: "ingame",
                    mode: null,
                    uploads: [],
                    error: { code: error.code, message: error.message, fix: error.fix },
                },
            ]);
            expect(plan.requests).toEqual([]);
        }
    );

    it.each(["", fallback])(
        "preserves the fast update timeout and its config command with fallback %j",
        async fallbackUrl => {
            const paths = makeHome();
            const player = fakePlayer();
            player.divingFish.name = "fake-fallback-name";
            await seedScoreUsers(paths, [player]);
            const fallbackUpdate = `${fallback}/updateUser`;
            const result = await gameSync(
                paths,
                ["--source", "ingame", "--no-upload"],
                {
                    [update]: delayedRoute(gameResult(), 3000),
                    [fallbackUpdate]: delayedRoute(gameResult(), 3000),
                },
                undefined,
                { SALTNET_NETWORK_UPDATE_TIMEOUT_MS: "1000", SALTNET_API_FALLBACK_URL: fallbackUrl }
            );
            expect(result.requests.map(request => request.url)).toEqual([
                update,
                fallbackUrl ? fallbackUpdate : update,
            ]);
            expect(result.json.error).toMatchObject({
                code: "NETWORK",
                message: expect.stringMatching(/超时.*1/),
                retryable: true,
            });
            expect(parsePrintedCommand(result.json.error.fix)).toMatchObject({
                command: "config set",
                positionals: { key: "network.updateTimeoutMs", value: "60000" },
            });
            expect(persisted(paths).runs).toMatchObject([
                { outcome: "failed", errorCode: "NETWORK" },
            ]);
        }
    );

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
        [
            "a response body failure",
            () => ({
                ...gameResult(),
                text: async () => {
                    throw new Error(`response interrupted for ${gameId}`);
                },
            }),
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
            expect(result.requests.map(r => r.url)).toEqual([update, fallbackUpdate]);
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

    it.each([
        {
            status: 401,
            requests: [lxnsPlayer],
            code: "NOT_BOUND",
            fix: { command: "user bind", positionals: { user: "0", source: "lxns" } },
        },
        {
            status: 503,
            requests: [lxnsPlayer, lxnsPlayer],
            code: "UPSTREAM_ERROR",
            fix: { command: "sync", options: { source: "ingame", upload: false } },
        },
    ])(
        "suggests the game after LXNS returns HTTP $status",
        async ({ status, requests, code, fix }) => {
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
            const result = await gameSync(paths, ["--source", "lxns", "--no-upload"], {
                [lxnsPlayer]: jsonResponse({ success: false, message: access }, status),
            });
            expect(result.requests.map(r => r.url)).toEqual(requests);
            expect(result.json.error).toMatchObject({
                code,
                message: expect.stringContaining("ingame"),
            });
            expect(parsePrintedCommand(result.json.error.fix)).toMatchObject(fix);
            expectPrivate(paths, result, [access, refreshToken]);
        }
    );
});
