import type { RuntimePaths } from "../../src/runtime/paths";
import { Buffer } from "node:buffer";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createRegistry } from "../../src/commands";
import { CliError } from "../../src/errors";
import { stageCredentials } from "../../src/runtime/credentials";
import { acquireLock } from "../../src/store/locks";
import { MIGRATIONS } from "../../src/store/migrations";
import { openStore } from "../../src/store/store";
import * as changes from "../../src/sync/changes";
import { readRuns } from "../../src/sync/journal";
import { readUsers, saveUser } from "../../src/users/repository";
import { commandIn, LXNS_URL, NOW, routes } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { createHarness, run } from "../harness";
import { jsonResponse } from "../mockHttp";
import { parsePrintedCommand, printedCommands, selectedUser } from "../printedCommand";
import { allFixtureRecords, recordOf, seedScoreUsers, user } from "../scoreUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const registry = createRegistry();
const syncSchema = registry.find("sync")!.spec.dataSchema!;
const gameId = 99001101;
const lxnsId = 99001102;
const expiresAt = NOW.getTime() + 3_600_000;
const importToken = "FAKE-DF-IMPORT-P3-11";
const refreshToken = "FAKE-LXNS-REFRESH-P3-11";
const qr = `SGWCMAID${"0".repeat(56)}FAKE0011`;
const accessToken = [
    Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify({ id: lxnsId, name: "Fake LXNS", exp: expiresAt / 1000 })).toString(
        "base64url"
    ),
    "FAKE_SIG",
].join(".");
const credentials = {
    divingFishImportToken: importToken,
    lxnsAccountId: lxnsId,
    lxnsAuthorization: { accessToken, tokenType: "Bearer", expiresAt, refreshToken },
};
const apiUrl = "https://game.example.test";
const gameUrl = `${apiUrl}/updateUser`;
const publicBackendUrl = `${apiUrl}/updateUserFromDF`;
const playerUrl = `${LXNS_URL}/api/v0/user/maimai/player`;
const scoresUrl = `${playerUrl}/scores`;
const dfBase = "https://www.diving-fish.com/api/maimaidxprober";
const dfRecordsUrl = `${dfBase}/player/records`;
const dfUploadUrl = `${dfBase}/player/update_records`;
const dfPublicUrl = `${dfBase}/query/player`;
const env = { SALTNET_API_URL: apiUrl, SALTNET_API_FALLBACK_URL: apiUrl };
const record = recordOf(allFixtureRecords().charts.find(chart => chart.music.info.type === "SD")!);
const lxnsScore = {
    id: record.song_id,
    song_name: record.title,
    type: "standard",
    level: record.level,
    level_index: record.level_index,
    achievements: 99,
    dx_score: 100,
    dx_rating: 200,
    rate: "ss",
};

function gameUser(uid = "fake-game", id: number | null = gameId) {
    const player = user(uid, id === null ? "Fake QR Needed" : "Fake Game");
    player.inGame = { id, enabled: true, useFastUpdate: false };
    player.lxns = { id: lxnsId, name: "Fake LXNS Binding", auth: null };
    return player;
}

function gameResponse() {
    return jsonResponse({
        userId: gameId,
        userName: "Fake Game Result",
        rating: 15000,
        divingFishData: [record],
        b50: { sd: [record], dx: [] },
    });
}

function filesIn(paths: RuntimePaths, includeCredentials = true) {
    return Object.fromEntries(
        readdirSync(paths.home, { withFileTypes: true, recursive: true })
            .map(entry => [entry, join(entry.parentPath, entry.name)] as const)
            .filter(
                ([entry, file]) =>
                    entry.isFile() && (includeCredentials || file !== paths.credentials)
            )
            .map(([, file]) => [file, readFileSync(file)])
    );
}

function expectPrivate(paths: RuntimePaths, stdout: string, stderr: string) {
    const content = [
        stdout,
        stderr,
        ...Object.values(filesIn(paths, false)).map(file => file.toString()),
    ].join("\n");
    for (const secret of [importToken, accessToken, refreshToken, qr]) {
        expect(content).not.toContain(secret);
    }
    expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
}

describe("sync --all", () => {
    it("runs every automatic source in stored order and reports each outcome", async () => {
        const paths = makeHome();
        const manual = gameUser("fake-manual");
        manual.settings.manuallyUpdate = true;
        const missingQr = gameUser("-fake missing qr", null);
        const tokenUser = user("fake-df-token", "Fake DF Token");
        const publicUser = user("fake-df-name", "Fake DF Name");
        publicUser.divingFish.name = "fake-public-player";
        const lxnsUser = user("fake-lxns", "Fake LXNS Player");
        lxnsUser.lxns = { id: lxnsId, name: "Fake Binding", auth: null };
        await seedScoreUsers(paths, [
            manual,
            missingQr,
            tokenUser,
            publicUser,
            lxnsUser,
            gameUser(),
        ]);
        stageCredentials(paths, {
            version: 1,
            users: {
                "fake-df-token": { divingFishImportToken: importToken },
                "fake-lxns": credentials,
                "fake-game": credentials,
            },
        }).commit();

        const result = await commandIn(paths, "sync", ["--all", "--verbose"], {
            env,
            network: routes({
                [dfRecordsUrl]: jsonResponse({ message: `FAKE UPSTREAM ECHO ${importToken}` }, 503),
                [publicBackendUrl]: jsonResponse(null),
                [dfPublicUrl]: jsonResponse({
                    nickname: "Fake Public Result",
                    rating: 14222,
                    charts: { sd: [record], dx: [] },
                }),
                [playerUrl]: jsonResponse({
                    success: true,
                    data: { name: "Fake LXNS Result", rating: 14333 },
                }),
                [scoresUrl]: request =>
                    request.init?.method === "POST"
                        ? jsonResponse(
                              { message: `FAKE UPLOAD ECHO ${accessToken} ${refreshToken}` },
                              403
                          )
                        : jsonResponse({ success: true, data: [lxnsScore] }),
                [gameUrl]: gameResponse(),
                [dfUploadUrl]: jsonResponse({}),
            }),
        });
        expect(result.code).toBe(0);
        expect(result.json.ok).toBe(true);
        expectConforms(syncSchema, result.json.data);
        expect(result.json.data.skipped).toEqual([
            { user: { uid: "fake-manual", index: 0, name: "Fake Game" } },
        ]);
        const { results } = result.json.data;
        expect(results).toMatchObject([
            {
                user: { uid: missingQr.uid, index: 1 },
                ok: false,
                data: null,
                error: { code: "QR_REQUIRED" },
                warnings: [],
            },
            {
                user: { uid: tokenUser.uid, index: 2 },
                ok: false,
                data: null,
                error: { code: "UPSTREAM_ERROR" },
                warnings: [],
            },
            {
                user: { uid: publicUser.uid, index: 3 },
                ok: true,
                data: { source: "df-name", mode: "public-b50" },
                error: null,
                warnings: [{ code: "PUBLIC_B50_ONLY" }],
            },
            {
                user: { uid: lxnsUser.uid, index: 4 },
                ok: true,
                data: { source: "lxns", mode: "full" },
                error: null,
                warnings: [],
            },
            {
                user: { uid: "fake-game", index: 5 },
                ok: true,
                data: {
                    source: "ingame",
                    mode: "fast",
                    uploads: [
                        { target: "diving-fish", ok: true },
                        { target: "lxns", ok: false },
                    ],
                },
                error: null,
                warnings: [{ code: "UPLOAD_FAILED" }],
            },
        ]);
        expect(parsePrintedCommand(results[0].error.fix)).toMatchObject({
            command: "sync",
            options: { user: missingQr.uid, source: "ingame", qr: "-" },
        });
        expect(result.json.warnings).toMatchObject([{ code: "SOME_FAILED" }]);
        expect(result.json.warnings[0].message).toContain("2 位");
        expect(result.json.warnings[0].message).toContain("Fake QR Needed（-fake missing qr）");
        expect(result.json.warnings[0].message).toContain("Fake DF Token（fake-df-token）");
        expect(result.requests.map(request => request.url)).toEqual([
            dfRecordsUrl,
            dfRecordsUrl,
            publicBackendUrl,
            dfPublicUrl,
            playerUrl,
            scoresUrl,
            gameUrl,
            playerUrl,
            scoresUrl,
            dfUploadUrl,
            scoresUrl,
        ]);

        const store = openStore(paths);
        try {
            expect(
                readUsers(store).map(player => [
                    player.data.rating,
                    Object.keys(player.data.detailed ?? {}).length,
                    player.data.b50?.sd.length ?? 0,
                ])
            ).toEqual([
                [null, 0, 0],
                [null, 0, 0],
                [null, 0, 0],
                [14222, 0, 1],
                [14333, 1, 1],
                [15000, 1, 1],
            ]);
            const runs = [...readRuns(store).items].reverse();
            expect(
                runs.map(row => [row.userUid, row.kind, row.source, row.outcome, row.errorCode])
            ).toEqual([
                [missingQr.uid, "sync", "ingame", "failed", "QR_REQUIRED"],
                [tokenUser.uid, "sync", "df-token", "failed", "UPSTREAM_ERROR"],
                [publicUser.uid, "sync", "df-name", "ok", null],
                [lxnsUser.uid, "sync", "lxns", "ok", null],
                ["fake-game", "sync", "ingame", "ok", null],
                ["fake-game", "upload", "diving-fish", "ok", null],
                ["fake-game", "upload", "lxns", "failed", "LXNS_REAUTH_REQUIRED"],
            ]);
            expect(JSON.stringify(runs)).not.toContain(importToken);
        } finally {
            store.close();
        }
        expectPrivate(paths, result.stdout, result.stderr);
        const single = await commandIn(paths, "sync", [`--user=${missingQr.uid}`], { network: {} });
        expect(results[0].error).toEqual({
            code: single.json.error.code,
            message: single.json.error.message,
            fix: single.json.error.fix,
        });
    });

    it("redacts transport errors and refuses to save credential echoes", async () => {
        const paths = makeHome();
        const players = [
            user("fake-transport", "Fake Transport"),
            user("fake-echo", "Fake Echo"),
            gameUser(),
        ];
        await seedScoreUsers(paths, players);
        stageCredentials(paths, {
            version: 1,
            users: {
                "fake-transport": { divingFishImportToken: importToken },
                "fake-echo": { divingFishImportToken: refreshToken },
            },
        }).commit();
        const result = await commandIn(paths, "sync", ["--all", "--verbose"], {
            env,
            network: routes({
                [dfRecordsUrl]: request => {
                    if (request.init?.headers?.["Import-Token"] === importToken) {
                        throw new Error(`FAKE failure for ${importToken}`, {
                            cause: new Error(importToken),
                        });
                    }
                    return jsonResponse({
                        nickname: refreshToken,
                        rating: 15000,
                        records: [record],
                    });
                },
                [gameUrl]: gameResponse(),
            }),
        });
        expect(result.code).toBe(0);
        expect(result.json.data.results).toMatchObject([
            { ok: false, error: { code: "NETWORK" } },
            {
                ok: false,
                error: { code: "UPSTREAM_ERROR", message: "上游成绩响应包含凭据，无法保存" },
            },
            { ok: true, error: null },
        ]);
        expectConforms(syncSchema, result.json.data);
        expectPrivate(paths, result.stdout, result.stderr);
    });

    it("ends the command when the executor throws an unexpected exception", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [gameUser(), gameUser("fake-later")]);
        const compute = vi.spyOn(changes, "computeSyncChanges").mockImplementationOnce(() => {
            throw new Error("Fake unexpected exception");
        });
        try {
            const result = await commandIn(paths, "sync", ["--all"], {
                env,
                network: routes({ [gameUrl]: gameResponse() }),
            });
            expect(result.code).toBe(1);
            expect(result.json.error).toMatchObject({ code: "INTERNAL" });
            expect(result.requests.map(request => request.url)).toEqual([gameUrl]);
        } finally {
            compute.mockRestore();
        }
    });

    it("keeps a credential out of an unexpected exception, also with --verbose", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [gameUser()]);
        stageCredentials(paths, {
            version: 1,
            users: { "fake-game": { divingFishImportToken: importToken } },
        }).commit();
        const compute = vi.spyOn(changes, "computeSyncChanges").mockImplementationOnce(() => {
            throw new Error(`Fake unexpected exception ${importToken}`);
        });
        try {
            const result = await commandIn(paths, "sync", ["--verbose"], {
                env,
                network: routes({ [gameUrl]: gameResponse() }),
            });
            expect(result.code).toBe(1);
            expect(result.json.error.code).toBe("INTERNAL");
            expect(result.json.error.message).toContain("Fake unexpected exception");
            expect(result.stderr).toContain("Fake unexpected exception");
            expectPrivate(paths, result.stdout, result.stderr);
        } finally {
            compute.mockRestore();
        }
    });

    it("keeps the warnings of a user whose sync failed", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [gameUser(), gameUser("fake-later")]);
        const warning = { code: "STALE_METADATA", message: "Fake stale warning" } as const;
        const compute = vi.spyOn(changes, "computeSyncChanges").mockImplementationOnce(() => {
            throw new CliError("UPSTREAM_ERROR", "Fake failure", { warnings: [warning] });
        });
        try {
            const result = await commandIn(paths, "sync", ["--all"], {
                env,
                network: routes({ [gameUrl]: gameResponse() }),
            });
            expect(result.code).toBe(0);
            expect(result.json.data.results).toMatchObject([
                { ok: false, error: { code: "UPSTREAM_ERROR" }, warnings: [warning] },
                { ok: true, error: null },
            ]);
            expectConforms(syncSchema, result.json.data);
        } finally {
            compute.mockRestore();
        }
    });

    it("continues past a held lock and disables every upload with --no-upload", async () => {
        const paths = makeHome();
        await seedScoreUsers(paths, [gameUser("fake-locked"), gameUser()]);
        stageCredentials(paths, {
            version: 1,
            users: { "fake-game": { divingFishImportToken: importToken } },
        }).commit();
        const store = openStore(paths);
        try {
            const acquired = acquireLock(store, "sync:fake-locked", { ttlMs: 60_000 });
            expect(acquired.acquired).toBe(true);
            store.db
                .prepare("UPDATE locks SET pid = ? WHERE name = ?")
                .run(424242, "sync:fake-locked");
            const result = await commandIn(paths, "sync", ["--all", "--no-upload"], {
                env,
                network: routes({
                    [gameUrl]: gameResponse(),
                    [dfRecordsUrl]: jsonResponse({ records: [] }),
                }),
            });
            expect(result.code).toBe(0);
            expect(result.json.data.results).toMatchObject([
                { user: { uid: "fake-locked" }, ok: false, error: { code: "SYNC_IN_PROGRESS" } },
                { user: { uid: "fake-game" }, ok: true, data: { uploads: [] } },
            ]);
            expect(result.requests.map(request => request.url)).toEqual([gameUrl, dfRecordsUrl]);
            expect(readRuns(store).items).toMatchObject([{ kind: "sync", userUid: "fake-game" }]);
        } finally {
            store.close();
        }
    });

    it("returns success even when all selected users are unbound", async () => {
        const paths = makeHome();
        const missing = user("-fake unbound", "Fake Unbound");
        const manual = user("fake-manual", "Fake Manual");
        manual.settings.manuallyUpdate = true;
        await seedScoreUsers(paths, [manual, missing]);
        const result = await commandIn(paths, "sync", ["--all"], { network: {} });
        expect(result.code).toBe(0);
        expect(result.requests).toEqual([]);
        expect(result.json.data.results).toMatchObject([
            { ok: false, error: { code: "NOT_BOUND" } },
        ]);
        const fixes = printedCommands(result.json.data.results[0].error.fix);
        expect(fixes.map(selectedUser)).toEqual(fixes.map(() => missing.uid));
        expect(result.json.warnings).toMatchObject([{ code: "SOME_FAILED" }]);
    });

    it.each([
        ["--user", "0"],
        ["--source", "auto"],
        ["--qr", "-"],
    ])("rejects a conflicting option %s before opening the store", async (...conflict) => {
        const paths = makeHome();
        const result = await commandIn(paths, "sync", ["--all", ...conflict], { network: {} });
        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
        expect(result.requests).toEqual([]);
        expect(existsSync(paths.home)).toBe(false);
    });

    it.each([false, true])("reports NO_USER for an empty store (dry run %j)", async dryRun => {
        const paths = makeHome();
        const result = await commandIn(paths, "sync", dryRun ? ["--all", "--dry-run"] : ["--all"], {
            network: {},
        });
        expect(result.code).toBe(4);
        expect(result.json.error.code).toBe("NO_USER");
        expect(result.requests).toEqual([]);
        if (dryRun) expect(existsSync(paths.home)).toBe(false);
    });
});

describe("sync --dry-run", () => {
    it("plans all sources, QR mode, upload switches and binding failures without side effects", async () => {
        const paths = makeHome();
        const manual = gameUser("fake-manual");
        manual.settings.manuallyUpdate = true;
        const fullGame = gameUser("-fake game");
        const bareGame = gameUser("fake-no-uploads");
        const qrNeeded = gameUser("fake-qr-needed", null);
        const tokenUser = user("fake-df-token", "Fake DF Token");
        const nameUser = user("fake-df-name", "Fake DF Name");
        nameUser.divingFish.name = "fake-public-player";
        const lxnsUser = user("fake-lxns", "Fake LXNS");
        lxnsUser.lxns = { id: lxnsId, name: "Fake Binding", auth: null };
        const expired = { ...lxnsUser, uid: "-fake expired" };
        await seedScoreUsers(paths, [
            manual,
            fullGame,
            bareGame,
            qrNeeded,
            tokenUser,
            nameUser,
            lxnsUser,
            expired,
        ]);
        stageCredentials(paths, {
            version: 1,
            users: {
                "-fake game": credentials,
                "fake-no-uploads": {
                    lxnsAccountId: lxnsId + 1,
                    lxnsAuthorization: credentials.lxnsAuthorization,
                },
                "fake-qr-needed": { divingFishImportToken: importToken },
                "fake-df-token": { divingFishImportToken: importToken },
                "fake-lxns": credentials,
                "-fake expired": {
                    ...credentials,
                    lxnsAuthorization: {
                        ...credentials.lxnsAuthorization,
                        expiresAt: NOW.getTime(),
                        refreshToken: "",
                    },
                },
            },
        }).commit();
        const before = filesIn(paths);

        async function preview(...options: string[]) {
            const harness = createHarness({
                env: { SALTNET_HOME: paths.home },
                now: NOW,
                stdin: qr,
            });
            const code = await run(registry, harness, "sync", "--dry-run", "--verbose", ...options);
            expect(harness.fetch).not.toHaveBeenCalled();
            expect(harness.readStdin).not.toHaveBeenCalled();
            expectPrivate(paths, harness.stdout(), harness.stderr());
            const result = JSON.parse(harness.stdout()) as {
                ok: boolean;
                data: { plans: Record<string, unknown>[]; skipped: unknown[] };
                error: unknown;
            };
            if (code === 0) expectConforms(syncSchema, result.data);
            return { code, ...result };
        }

        const result = await preview("--all", "--offline");
        expect(result.code).toBe(0);
        expect(result.data.skipped).toMatchObject([{ user: { uid: manual.uid, index: 0 } }]);
        expect(result.data.plans).toMatchObject([
            {
                user: { uid: fullGame.uid },
                source: "ingame",
                mode: "fast",
                uploads: ["diving-fish", "lxns"],
                effect: "remote",
                error: null,
            },
            {
                user: { uid: bareGame.uid },
                source: "ingame",
                mode: "fast",
                uploads: [],
                effect: "local",
                error: null,
            },
            {
                user: { uid: qrNeeded.uid },
                source: "ingame",
                mode: null,
                uploads: [],
                effect: "local",
                error: { code: "QR_REQUIRED" },
            },
            {
                user: { uid: tokenUser.uid },
                source: "df-token",
                mode: "full",
                uploads: [],
                effect: "local",
                error: null,
            },
            {
                user: { uid: nameUser.uid },
                source: "df-name",
                mode: null,
                uploads: [],
                effect: "local",
                error: null,
            },
            {
                user: { uid: lxnsUser.uid },
                source: "lxns",
                mode: "full",
                uploads: [],
                effect: "local",
                error: null,
            },
            {
                user: { uid: expired.uid },
                source: "lxns",
                mode: null,
                uploads: [],
                effect: "local",
                error: { code: "LXNS_REAUTH_REQUIRED" },
            },
        ]);
        const expiredFix = (result.data.plans.at(-1)?.error as { fix: string }).fix;
        expect(printedCommands(expiredFix).map(selectedUser)).toEqual([expired.uid, expired.uid]);

        expect((await preview("--user=-fake game", "--qr", "-")).data.plans).toMatchObject([
            {
                source: "ingame",
                mode: "full",
                uploads: ["diving-fish", "lxns"],
                effect: "account",
                error: null,
            },
        ]);
        expect((await preview("--user=-fake game", "--no-upload")).data.plans).toMatchObject([
            { mode: "fast", uploads: [], effect: "local", error: null },
        ]);
        expect(
            (
                await preview(
                    "--user",
                    qrNeeded.uid!,
                    "--source",
                    "ingame",
                    "--qr",
                    "-",
                    "--no-upload"
                )
            ).data.plans
        ).toMatchObject([{ mode: "full", uploads: [], effect: "account", error: null }]);
        expect(
            (await preview("--user", bareGame.uid!, "--source", "lxns")).data.plans
        ).toMatchObject([
            {
                source: null,
                mode: null,
                uploads: [],
                effect: "local",
                error: { code: "NOT_BOUND" },
            },
        ]);
        for (const args of [
            ["--source", "df-token", "--qr", "-"],
            ["--all", "--user", "0"],
            ["--qr", qr],
        ]) {
            expect(await preview(...args)).toMatchObject({
                code: 2,
                ok: false,
                error: { code: "USAGE" },
            });
        }
        expect(filesIn(paths)).toEqual(before);
        const store = openStore(paths);
        try {
            expect(readRuns(store).items).toEqual([]);
            expect(store.db.prepare("SELECT name FROM locks").all()).toEqual([]);
        } finally {
            store.close();
        }
    });

    it("promises no uploads for a single game user who needs a QR code", async () => {
        const paths = makeHome();
        const player = gameUser("fake-needs-qr", null);
        await seedScoreUsers(paths, [player]);
        stageCredentials(paths, {
            version: 1,
            users: { [player.uid!]: { divingFishImportToken: importToken } },
        }).commit();
        const before = filesIn(paths);
        const result = await commandIn(paths, "sync", ["--dry-run"], { network: {} });
        expect(result.code).toBe(0);
        expect(result.requests).toEqual([]);
        expect(result.json.data.plans).toMatchObject([
            {
                source: "ingame",
                mode: null,
                uploads: [],
                effect: "local",
                error: { code: "QR_REQUIRED" },
            },
        ]);
        expect(filesIn(paths)).toEqual(before);
    });

    it("plans nothing from a layout before the user tables and leaves it unmigrated", async () => {
        const paths = makeHome();
        const store = openStore(paths, { migrations: MIGRATIONS.slice(0, 3) });
        try {
            const before = readFileSync(paths.database);
            for (const args of [["--dry-run"], ["--all", "--dry-run"]]) {
                const result = await commandIn(paths, "sync", args, { network: {} });
                expect(result.json.error?.code, args.join(" ")).toBe("NO_USER");
                expect(result.requests).toEqual([]);
            }
            expect(readFileSync(paths.database)).toEqual(before);
            expect(store.db.prepare("PRAGMA user_version").get()).toMatchObject({
                user_version: 3,
            });
        } finally {
            store.close();
        }
    });

    it("plans from a committed WAL and leaves an older layout unmigrated", async () => {
        const paths = makeHome();
        const store = openStore(paths, { migrations: MIGRATIONS.slice(0, 4) });
        try {
            saveUser(store, gameUser());
            const before = readFileSync(paths.database);
            const wal = `${paths.database}-wal`;
            const beforeWal = readFileSync(wal);
            const result = await commandIn(paths, "sync", ["--dry-run"], { network: {} });
            expect(result.code).toBe(0);
            expect(result.json.data.plans).toMatchObject([{ source: "ingame", mode: "fast" }]);
            expect(result.requests).toEqual([]);
            expect(readFileSync(paths.database)).toEqual(before);
            expect(readFileSync(wal)).toEqual(beforeWal);
            expect(store.db.prepare("PRAGMA user_version").get()).toMatchObject({
                user_version: 4,
            });
        } finally {
            store.close();
        }
    });
});
