import type { UserCredentials } from "../../src/runtime/credentials";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { Route } from "../mockHttp";
import { Buffer } from "node:buffer";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ComboStatus, SyncStatus } from "@core/mai/types";
import { describe, expect, it } from "vitest";
import { syncDataSchema } from "../../src/commands/sync";
import { readCredentials, stageCredentials } from "../../src/runtime/credentials";
import { openStore } from "../../src/store/store";
import { readRuns } from "../../src/sync/journal";
import { readUsers } from "../../src/users/repository";
import { commandIn, LXNS_URL, NOW, routes } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { jsonResponse, textResponse } from "../mockHttp";
import { allFixtureRecords, recordOf, seedScoreUsers, user } from "../scoreUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const uid = "fake-upload-user";
const gameId = 99001001;
const lxnsId = 99001002;
const qrCode = `${"0".repeat(56)}FAKE0002`;
const qr = `SGWCMAID${qrCode}`;
const importToken = "FAKE-DF-IMPORT-P3-10";
const refreshToken = "FAKE-LXNS-REFRESH-P3-10";
const rotatedToken = "FAKE-LXNS-ROTATED-P3-10";
const env = {
    SALTNET_API_URL: "https://game.example.test",
    SALTNET_LXNS_CLIENT_ID: "FAKE-LXNS-CLIENT-P3-10",
    SALTNET_LXNS_REDIRECT_URI: "https://callback.example.test",
};
const updateUrl = `${env.SALTNET_API_URL}/updateUser`;
const qrUrl = `${env.SALTNET_API_URL}/getQRInfo`;
const tokenUrl = `${LXNS_URL}/api/v0/oauth/token`;
const playerUrl = `${LXNS_URL}/api/v0/user/maimai/player`;
const lxnsUploadUrl = `${playerUrl}/scores`;
const dfUploadUrl = "https://www.diving-fish.com/api/maimaidxprober/player/update_records";
const dfRecordsUrl = "https://www.diving-fish.com/api/maimaidxprober/player/records";

const { charts } = allFixtureRecords();
const sd = {
    ...recordOf(charts.find(chart => chart.music.info.type === "SD")!),
    fc: ComboStatus.None,
    fs: SyncStatus.None,
    play_count: 0,
};
const dxChart = charts.find(chart => chart.music.info.type === "DX" && chart.music.id < 100_000)!;
const dx = { ...recordOf(dxChart), song_id: dxChart.music.id };
const gameRecords = [sd, dx];
const supplement = {
    id: sd.song_id,
    song_name: sd.title,
    type: "standard",
    level: sd.level,
    level_index: sd.level_index,
    fc: "ap",
    fs: "sync",
    achievements: 99.1,
    dx_score: 1234,
    dx_rating: 150,
    rate: "ss",
};

const expiresAt = NOW.getTime() + 3_600_000;
const expiredAt = NOW.getTime() - 3_600_000;

function jwt(expires: number) {
    const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url");
    const payload = Buffer.from(
        JSON.stringify({ id: lxnsId, name: "Fake LXNS Upload", exp: expires / 1000 })
    ).toString("base64url");
    return `${header}.${payload}.FAKE_SIG`;
}

const accessToken = jwt(expiresAt);
const expiredToken = jwt(expiredAt);

function authorization(expiry = expiresAt): UserCredentials {
    return {
        lxnsAccountId: lxnsId,
        lxnsIssuedAt: expiredAt,
        lxnsAuthorization: {
            accessToken: jwt(expiry),
            tokenType: "Bearer",
            expiresAt: expiry,
            refreshToken,
        },
    };
}

async function seed(paths: RuntimePaths, credentials: UserCredentials) {
    const player = user(uid, "Fake Upload Player", { rating: 14000 });
    player.inGame = { id: gameId, enabled: true, useFastUpdate: true };
    player.divingFish = { name: "fake-public-name", importToken: null };
    player.lxns = { id: lxnsId, name: "Fake LXNS Upload", auth: null };
    await seedScoreUsers(paths, [user("fake-default-user", "Fake Default User"), player]);
    stageCredentials(paths, { version: 1, users: { [uid]: credentials } }).commit();
}

function sync(paths: RuntimePaths, args: string[], overrides: Record<string, Route> = {}) {
    return commandIn(paths, "sync", ["--user", uid, "--verbose", ...args], {
        env,
        stdin: qr,
        network: routes({
            [qrUrl]: jsonResponse({ errorID: 0, userID: gameId }),
            [updateUrl]: jsonResponse({
                userId: gameId,
                userName: "Fake Game Upload",
                rating: 15000,
                divingFishData: gameRecords,
                b50: { sd: [sd], dx: [dx] },
            }),
            ...overrides,
        }),
    });
}

function readState(paths: RuntimePaths) {
    const store = openStore(paths);
    try {
        return {
            player: readUsers(store).find(row => row.uid === uid),
            runs: readRuns(store).items,
            lock: store.db.prepare("SELECT name FROM locks WHERE name = ?").get(`sync:${uid}`),
        };
    } finally {
        store.close();
    }
}

function expectUploadStarted(paths: RuntimePaths, target: string) {
    const { runs, lock, player } = readState(paths);
    expect(lock).toBeDefined();
    expect(player?.data.rating).toBe(15000);
    expect(runs[0]).toMatchObject({ kind: "upload", source: target, outcome: "running" });
    expect(runs.at(-1)).toMatchObject({ kind: "sync", outcome: "ok" });
}

function expectPrivate(paths: RuntimePaths, result: { stdout: string; stderr: string }) {
    const { runs } = readState(paths);
    const contents = [result.stdout, result.stderr, JSON.stringify(runs)];
    for (const entry of readdirSync(paths.home, { recursive: true, withFileTypes: true })) {
        const file = join(entry.parentPath, entry.name);
        if (entry.isFile() && file !== paths.credentials) {
            contents.push(readFileSync(file, "utf8"));
        }
    }
    for (const secret of [
        qrCode,
        importToken,
        accessToken,
        expiredToken,
        refreshToken,
        rotatedToken,
    ]) {
        expect(contents.join("\n")).not.toContain(secret);
    }
    expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
}

describe("uploads after in-game sync", () => {
    it.each(["full", "fast"])(
        "uploads the raw game records to both targets after a %s sync",
        async mode => {
            const paths = makeHome();
            await seed(paths, { ...authorization(), divingFishImportToken: importToken });
            const full = mode === "full";
            const result = await sync(paths, full ? ["--qr", "-"] : [], {
                [dfUploadUrl]: () => {
                    expectUploadStarted(paths, "diving-fish");
                    return textResponse("ok");
                },
                [playerUrl]: jsonResponse({
                    success: true,
                    data: { name: "Fake LXNS", rating: 100 },
                }),
                [lxnsUploadUrl]: request => {
                    if (request.init?.method !== "POST")
                        return jsonResponse({ success: true, data: [supplement] });
                    expectUploadStarted(paths, "lxns");
                    return jsonResponse({ success: true });
                },
            });

            expect(result.requests.map(r => r.url)).toEqual(
                full
                    ? [qrUrl, updateUrl, dfUploadUrl, lxnsUploadUrl]
                    : [updateUrl, playerUrl, lxnsUploadUrl, dfUploadUrl, lxnsUploadUrl]
            );
            const [df, lxns] = result.requests.slice(-2);
            expect(df.init).toMatchObject({
                method: "POST",
                redirect: "manual",
                headers: { "Import-Token": importToken, "Content-Type": "application/json" },
            });
            expect(JSON.parse(df.init!.body!)).toEqual(gameRecords);
            expect(lxns.init).toMatchObject({
                method: "POST",
                redirect: "manual",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            });
            expect(JSON.parse(lxns.init!.body!)).toEqual({
                scores: [
                    {
                        id: sd.song_id,
                        type: "standard",
                        level_index: sd.level_index,
                        achievements: sd.achievements,
                        fc: null,
                        fs: null,
                        dx_score: sd.dxScore,
                    },
                    {
                        id: dx.song_id - 10_000,
                        type: "dx",
                        level_index: dx.level_index,
                        achievements: dx.achievements,
                        fc: dx.fc || null,
                        fs: dx.fs || null,
                        dx_score: dx.dxScore,
                    },
                ],
            });
            expect(result.code).toBe(0);
            expectConforms(syncDataSchema, result.json.data);
            expect(result.json.data).toMatchObject({ mode, source: "ingame" });
            expect(result.json.data.uploads).toEqual([
                { target: "diving-fish", ok: true, error: null },
                { target: "lxns", ok: true, error: null },
            ]);
            const { player, runs } = readState(paths);
            expect(player?.data.b50?.sd[0].fc).toBe(full ? sd.fc : "ap");
            expect(runs).toMatchObject([
                { kind: "upload", source: "lxns", outcome: "ok", summary: { records: 2 } },
                { kind: "upload", source: "diving-fish", outcome: "ok", summary: { records: 2 } },
                { kind: "sync", source: "ingame", mode, outcome: "ok" },
            ]);
            expectPrivate(paths, result);
        }
    );

    it.each([503, 307])("reports a Diving Fish HTTP %i once and still tries LXNS", async status => {
        const paths = makeHome();
        await seed(paths, { ...authorization(), divingFishImportToken: importToken });
        const result = await sync(paths, ["--qr", "-"], {
            [dfUploadUrl]: textResponse(`Echo: ${importToken}, ${qrCode}`, status),
            [lxnsUploadUrl]: jsonResponse({ success: true }),
        });
        expect(result.requests.map(r => r.url)).toEqual([
            qrUrl,
            updateUrl,
            dfUploadUrl,
            lxnsUploadUrl,
        ]);
        expect(result.requests[2].init).toMatchObject({ redirect: "manual" });
        expect(result.code).toBe(0);
        expectConforms(syncDataSchema, result.json.data);
        expect(result.json.data.uploads).toEqual([
            {
                target: "diving-fish",
                ok: false,
                error: { code: "UPSTREAM_ERROR", message: `上传到水鱼失败（HTTP ${status}）` },
            },
            { target: "lxns", ok: true, error: null },
        ]);
        expect(result.json.warnings).toEqual([
            { code: "UPLOAD_FAILED", message: `上传到水鱼失败（HTTP ${status}）` },
        ]);
        const { player, runs } = readState(paths);
        expect(player?.data.rating).toBe(15000);
        expect(runs).toMatchObject([
            { kind: "upload", source: "lxns", outcome: "ok" },
            {
                kind: "upload",
                source: "diving-fish",
                outcome: "failed",
                errorCode: "UPSTREAM_ERROR",
            },
            { kind: "sync", outcome: "ok" },
        ]);
        expectPrivate(paths, result);
    });

    it("uses a refreshed LXNS access token for an upload", async () => {
        const paths = makeHome();
        await seed(paths, authorization(expiredAt));
        const result = await sync(paths, ["--qr", "-"], {
            [tokenUrl]: request => {
                expectUploadStarted(paths, "lxns");
                expect(request.init).toMatchObject({ method: "POST", redirect: "manual" });
                expect(new URLSearchParams(request.init?.body).get("refresh_token")).toBe(
                    refreshToken
                );
                return jsonResponse({
                    access_token: accessToken,
                    refresh_token: rotatedToken,
                    token_type: "Bearer",
                    expires_in: 3600,
                });
            },
            [lxnsUploadUrl]: jsonResponse({ success: true }),
        });
        expect(result.requests.map(r => r.url)).toEqual([
            qrUrl,
            updateUrl,
            tokenUrl,
            lxnsUploadUrl,
        ]);
        expect(result.requests.at(-1)?.init?.headers?.Authorization).toBe(`Bearer ${accessToken}`);
        expect(result.code).toBe(0);
        expect(result.json.data.uploads).toEqual([{ target: "lxns", ok: true, error: null }]);
        expect(readCredentials(paths).users[uid].lxnsAuthorization).toMatchObject({
            accessToken,
            refreshToken: rotatedToken,
        });
        expectPrivate(paths, result);
    });

    it("reports an LXNS invalid_grant and keeps the committed game sync", async () => {
        const paths = makeHome();
        await seed(paths, { ...authorization(expiredAt), divingFishImportToken: importToken });
        const result = await sync(paths, ["--qr", "-"], {
            [dfUploadUrl]: textResponse("ok"),
            [tokenUrl]: jsonResponse(
                { error: "invalid_grant", error_description: refreshToken },
                400
            ),
        });
        expect(result.requests.map(r => r.url)).toEqual([qrUrl, updateUrl, dfUploadUrl, tokenUrl]);
        expect(result.code).toBe(0);
        expectConforms(syncDataSchema, result.json.data);
        expect(result.json.data.uploads).toMatchObject([
            { target: "diving-fish", ok: true, error: null },
            { target: "lxns", ok: false, error: { code: "LXNS_REAUTH_REQUIRED" } },
        ]);
        expect(result.json.warnings).toMatchObject([
            { code: "UPLOAD_FAILED", fix: `saltnet user bind ${uid} lxns` },
        ]);
        const { player, runs } = readState(paths);
        expect(player?.data.rating).toBe(15000);
        expect(player?.lxns?.id).toBe(lxnsId);
        expect(readCredentials(paths).users[uid]).toEqual({ divingFishImportToken: importToken });
        expect(runs).toMatchObject([
            {
                kind: "upload",
                source: "lxns",
                outcome: "failed",
                errorCode: "LXNS_REAUTH_REQUIRED",
            },
            { kind: "upload", source: "diving-fish", outcome: "ok" },
            { kind: "sync", outcome: "ok" },
        ]);
        expectPrivate(paths, result);
    });

    it("reports a transport error without publishing its text or cause", async () => {
        const paths = makeHome();
        await seed(paths, { ...authorization(), divingFishImportToken: importToken });
        const result = await sync(paths, ["--qr", "-"], {
            [dfUploadUrl]: () => {
                throw new Error(qrCode, { cause: new Error(refreshToken) });
            },
            [lxnsUploadUrl]: jsonResponse({ success: false, message: accessToken }),
        });
        expect(result.requests.map(r => r.url)).toEqual([
            qrUrl,
            updateUrl,
            dfUploadUrl,
            lxnsUploadUrl,
        ]);
        expect(result.code).toBe(0);
        expectConforms(syncDataSchema, result.json.data);
        expect(result.json.data.uploads).toMatchObject([
            {
                target: "diving-fish",
                ok: false,
                error: { code: "NETWORK", message: "上传到水鱼时连接失败或超时" },
            },
            { target: "lxns", ok: false, error: { code: "UPSTREAM_ERROR" } },
        ]);
        expect(result.json.warnings.map(w => w.code)).toEqual(["UPLOAD_FAILED", "UPLOAD_FAILED"]);
        expectPrivate(paths, result);
    });

    it.each(["disabled", "unbound", "non-game", "failed-game"])(
        "skips uploads when %s",
        async reason => {
            const paths = makeHome();
            const creds =
                reason === "unbound"
                    ? { ...authorization(), lxnsAccountId: lxnsId + 1 }
                    : { ...authorization(), divingFishImportToken: importToken };
            await seed(paths, creds);

            const args =
                reason === "non-game"
                    ? ["--source", "df-token"]
                    : ["--qr", "-", ...(reason === "disabled" ? ["--no-upload"] : [])];
            const result = await sync(paths, args, {
                [dfRecordsUrl]: jsonResponse({
                    nickname: "Fake DF",
                    rating: 15000,
                    records: gameRecords,
                }),
                ...(reason === "failed-game" && {
                    [updateUrl]: jsonResponse({ error: "QR_INVALID" }, 400),
                }),
            });
            expect(result.requests.map(r => r.url)).toEqual(
                reason === "non-game" ? [dfRecordsUrl] : [qrUrl, updateUrl]
            );
            expect(readState(paths).runs.map(run => run.kind)).toEqual(["sync"]);
            if (reason === "failed-game") {
                expect(result.json.error.code).toBe("QR_INVALID");
            } else {
                expect(result.code).toBe(0);
                expect(result.json.data.uploads).toEqual([]);
            }
        }
    );

    it.each([
        { status: 401, failing: "diving-fish" },
        { status: 403, failing: "diving-fish" },
        { status: 401, failing: "lxns" },
        { status: 403, failing: "lxns" },
    ])(
        "asks to bind again when $failing refuses an upload with $status",
        async ({ status, failing }) => {
            const paths = makeHome();
            await seed(paths, { ...authorization(), divingFishImportToken: importToken });
            const refused = jsonResponse({ message: accessToken }, status);
            const result = await sync(paths, ["--qr", "-"], {
                [dfUploadUrl]: failing === "diving-fish" ? refused : textResponse("ok"),
                [lxnsUploadUrl]: failing === "lxns" ? refused : jsonResponse({ success: true }),
            });

            expect(result.code).toBe(0);
            const diving = failing === "diving-fish";
            const expected = diving
                ? {
                      code: "NOT_BOUND",
                      message: "上传到水鱼失败，需要重新授权",
                      fix: `saltnet user bind ${uid} df-token -`,
                  }
                : {
                      code: "LXNS_REAUTH_REQUIRED",
                      message: "上传到落雪失败，需要重新授权",
                      fix: `saltnet user bind ${uid} lxns`,
                  };
            expect(result.json.data.uploads).toEqual([
                diving
                    ? {
                          target: "diving-fish",
                          ok: false,
                          error: { code: expected.code, message: expected.message },
                      }
                    : { target: "diving-fish", ok: true, error: null },
                diving
                    ? { target: "lxns", ok: true, error: null }
                    : {
                          target: "lxns",
                          ok: false,
                          error: { code: expected.code, message: expected.message },
                      },
            ]);
            expect(result.json.warnings).toEqual([
                { code: "UPLOAD_FAILED", message: expected.message, fix: expected.fix },
            ]);
            expectPrivate(paths, result);
        }
    );

    it("keeps the code of a local failure during an upload", async () => {
        const paths = makeHome();
        await seed(paths, { ...authorization(), divingFishImportToken: importToken });
        const result = await sync(paths, ["--qr", "-"], {
            [dfUploadUrl]: () => {
                writeFileSync(paths.credentials, "not json");
                return textResponse("ok");
            },
        });

        expect(result.requests.map(r => r.url)).toEqual([qrUrl, updateUrl, dfUploadUrl]);
        expect(result.code).toBe(0);
        expect(result.json.data.uploads).toEqual([
            { target: "diving-fish", ok: true, error: null },
            { target: "lxns", ok: false, error: { code: "INTERNAL", message: "上传到落雪失败" } },
        ]);
    });

    it("asks to bind LXNS again when the stored authorization has no token type", async () => {
        const paths = makeHome();
        const stored = authorization();
        const { tokenType: _dropped, ...withoutType } = stored.lxnsAuthorization as Record<
            string,
            unknown
        >;
        await seed(paths, { ...stored, lxnsAuthorization: withoutType });
        const result = await sync(paths, ["--qr", "-"]);

        expect(result.requests.map(r => r.url)).toEqual([qrUrl, updateUrl]);
        expect(result.code).toBe(0);
        expect(result.json.data.uploads).toEqual([
            {
                target: "lxns",
                ok: false,
                error: { code: "LXNS_REAUTH_REQUIRED", message: "上传到落雪失败，需要重新授权" },
            },
        ]);
        expect(result.json.warnings).toMatchObject([
            { code: "UPLOAD_FAILED", fix: `saltnet user bind ${uid} lxns` },
        ]);
    });

    it("stops uploading when the sync lock is lost, keeping the committed sync", async () => {
        const paths = makeHome();
        await seed(paths, { ...authorization(), divingFishImportToken: importToken });
        const result = await sync(paths, ["--qr", "-"], {
            [dfUploadUrl]: () => {
                const other = openStore(paths);
                try {
                    other.db.prepare("DELETE FROM locks WHERE name = ?").run(`sync:${uid}`);
                } finally {
                    other.close();
                }
                return textResponse("ok");
            },
        });

        expect(result.requests.map(r => r.url)).toEqual([qrUrl, updateUrl, dfUploadUrl]);
        expect(result.json.error).toEqual({
            code: "INTERNAL",
            message: expect.stringMatching(/^同步结果已写入本地，之后出错：.*同步锁已失效/),
            retryable: false,
        });
        const { player, runs } = readState(paths);
        expect(player?.data.rating).toBe(15000);
        expect(runs).toMatchObject([
            { kind: "upload", source: "diving-fish", outcome: "running" },
            { kind: "sync", outcome: "ok" },
        ]);
        expectPrivate(paths, result);
    });
});
