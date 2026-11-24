import type { User } from "@core/user/type";
import type { CommandContext } from "../../src/commands/registry";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { Route } from "../mockHttp";
import { Buffer } from "node:buffer";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stageCredentials } from "../../src/runtime/credentials";
import { openStore } from "../../src/store/store";
import { readRuns } from "../../src/sync/journal";
import { protectSyncSecrets } from "../../src/sync/secrets";
import { commandIn, LXNS_URL, NOW, routes } from "../commandRun";
import { jsonResponse, textResponse } from "../mockHttp";
import { allFixtureRecords, recordOf, seedScoreUsers, user } from "../scoreUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

const uid = "fake-secrecy-user";
const gameId = 99001001;
const lxnsId = 9001001;
const importToken = "FAKE-DF-IMPORT-0001";
const refreshToken = "FAKE-LXNS-REFRESH+/= 0001";
const formRefresh = new URLSearchParams({ refresh_token: refreshToken }).toString();
const qrPayload = `${"0".repeat(56)}FAKE0001`;
const qrCode = `SGWCMAID${qrPayload}`;

function makeFakeJwt(id: number, name: string): string {
    const header = Buffer.from(JSON.stringify({ alg: "FAKE" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ id, name })).toString("base64url");
    return `${header}.${payload}.FAKE-SIGNATURE`;
}
const accessToken = makeFakeJwt(lxnsId, "FAKE");

const SECRETS_TO_CHECK = Array.from(
    new Set([
        importToken,
        JSON.stringify(importToken).slice(1, -1),
        refreshToken,
        encodeURIComponent(refreshToken),
        formRefresh.slice("refresh_token=".length),
        JSON.stringify(refreshToken).slice(1, -1),
        accessToken,
        JSON.stringify(accessToken).slice(1, -1),
        qrCode,
        JSON.stringify(qrCode).slice(1, -1),
        qrPayload,
        JSON.stringify(qrPayload).slice(1, -1),
    ])
);

const API_URL = "https://game.example.test";
const qrUrl = `${API_URL}/getQRInfo`;
const updateUrl = `${API_URL}/updateUser`;
const dfUpdateUserUrl = `${API_URL}/updateUserFromDF`;
const dfRecordsUrl = "https://www.diving-fish.com/api/maimaidxprober/player/records";
const dfUploadUrl = "https://www.diving-fish.com/api/maimaidxprober/player/update_records";
const dfPublicUrl = "https://www.diving-fish.com/api/maimaidxprober/query/player";
const lxnsTokenUrl = `${LXNS_URL}/api/v0/oauth/token`;
const lxnsPlayerUrl = `${LXNS_URL}/api/v0/user/maimai/player`;
const lxnsScoresUrl = `${LXNS_URL}/api/v0/user/maimai/player/scores`;

const env = {
    SALTNET_API_URL: API_URL,
    SALTNET_API_FALLBACK_URL: API_URL,
    SALTNET_LXNS_CLIENT_ID: "FAKE-LXNS-CLIENT-ID",
    SALTNET_LXNS_REDIRECT_URI: "https://callback.example.test",
};

const { charts } = allFixtureRecords();
const chart = charts.find(c => c.music.info.type === "SD")!;
const rec = recordOf(chart, 0);
const gameResponse = {
    userId: gameId,
    userName: "Fake Game Player",
    rating: 15000,
    divingFishData: [rec],
    b50: { sd: [rec], dx: [] },
};
const lxnsScore = {
    id: rec.song_id,
    song_name: rec.title,
    type: "standard",
    level: rec.level,
    level_index: rec.level_index,
    achievements: 99.5,
    dx_score: 1000,
    dx_rating: 200,
    rate: "ss",
};

function successRoutes(): Record<string, Route> {
    return {
        ...routes(),
        [qrUrl]: jsonResponse({ errorID: 0, userID: gameId }),
        [updateUrl]: jsonResponse(gameResponse),
        [dfUploadUrl]: textResponse("ok"),
        [lxnsPlayerUrl]: jsonResponse({
            success: true,
            data: { name: "fake-lxns-player", rating: 15000 },
        }),
        [lxnsScoresUrl]: jsonResponse({ success: true, data: [lxnsScore] }),
        [dfRecordsUrl]: jsonResponse({
            message: "success",
            nickname: "fake-df-player",
            rating: 15000,
            records: [rec],
            username: "fake-df-player",
        }),
        [dfUpdateUserUrl]: jsonResponse(gameResponse),
        [dfPublicUrl]: jsonResponse({
            nickname: "fake-df-player",
            rating: 15000,
            charts: { sd: [rec], dx: [] },
        }),
    };
}

function error500Routes(): Record<string, Route> {
    return {
        ...routes(),
        [qrUrl]: jsonResponse({ errorID: 0, userID: gameId }),
        [updateUrl]: textResponse("Internal Error", 500),
        [lxnsPlayerUrl]: textResponse("Internal Error", 500),
        [lxnsScoresUrl]: textResponse("Internal Error", 500),
        [dfRecordsUrl]: textResponse("Internal Error", 500),
        [dfUpdateUserUrl]: textResponse("Internal Error", 500),
        [dfPublicUrl]: textResponse("Internal Error", 500),
    };
}

function networkErrorRoutes(): Record<string, Route> {
    const throwNet = () => {
        const err = new TypeError("fetch failed");
        (err as unknown as { cause: { code: string } }).cause = { code: "ECONNREFUSED" };
        throw err;
    };
    return {
        ...routes(),
        [qrUrl]: jsonResponse({ errorID: 0, userID: gameId }),
        [updateUrl]: throwNet,
        [lxnsPlayerUrl]: throwNet,
        [lxnsScoresUrl]: throwNet,
        [dfRecordsUrl]: throwNet,
        [dfUpdateUserUrl]: throwNet,
        [dfPublicUrl]: throwNet,
    };
}

/**
 * Upstream errors that quote back every secret the run was given, so only the CLI's own redaction
 * can hide them. A QR code is quoted only when the run read one: the CLI cannot know a code it was
 * never given.
 */
function echoRoutes(withQr: boolean): Record<string, Route> {
    const qr = withQr ? `${qrCode} ${qrPayload} ` : "";
    const echoText = `rejected ${qr}${importToken} ${accessToken} ${refreshToken}`;
    return {
        ...routes(),
        [qrUrl]: jsonResponse({ errorID: 0, userID: gameId }),
        [updateUrl]: jsonResponse({ error: echoText }, 400),
        [lxnsPlayerUrl]: jsonResponse({ success: false, code: 400, message: echoText }, 400),
        [lxnsScoresUrl]: jsonResponse({ success: false, code: 400, message: echoText }, 400),
        [dfRecordsUrl]: jsonResponse({ message: echoText }, 400),
        [dfUpdateUserUrl]: jsonResponse({ error: echoText }, 400),
        [dfPublicUrl]: jsonResponse({ message: echoText }, 400),
    };
}

async function setupFreshDirectory(paths: RuntimePaths, expired = false): Promise<void> {
    const player = user(uid, "Fake Secrecy User", {
        rating: 15000,
        updateTime: NOW.getTime(),
    });
    player.inGame = {
        id: gameId,
        name: "Fake Game Player",
        enabled: true,
        useFastUpdate: true,
    };
    player.divingFish = { name: "fake-df-player", importToken: null };
    player.lxns = { id: lxnsId, name: "fake-lxns-player", auth: null };

    await seedScoreUsers(paths, [player]);

    stageCredentials(paths, {
        version: 1,
        users: {
            [uid]: {
                divingFishImportToken: importToken,
                lxnsAccountId: lxnsId,
                lxnsIssuedAt: NOW.getTime(),
                lxnsAuthorization: {
                    accessToken,
                    refreshToken,
                    tokenType: "Bearer",
                    expiresAt: expired ? NOW.getTime() - 1 : NOW.getTime() + 3_600_000,
                },
            },
        },
    }).commit();
}

function assertNoSecrets(paths: RuntimePaths, result: { stdout: string; stderr: string }): void {
    const contents: string[] = [result.stdout, result.stderr];

    if (existsSync(paths.database)) {
        contents.push(readFileSync(paths.database, "utf8"));
        contents.push(readFileSync(paths.database, "latin1"));
    }
    const wal = `${paths.database}-wal`;
    if (existsSync(wal)) {
        contents.push(readFileSync(wal, "utf8"));
        contents.push(readFileSync(wal, "latin1"));
    }

    if (existsSync(paths.database)) {
        const store = openStore(paths);
        try {
            contents.push(JSON.stringify(readRuns(store)));
        } finally {
            store.close();
        }
    }

    const combined = contents.join("\n");
    for (const secret of SECRETS_TO_CHECK) {
        expect(combined.includes(secret), "fixture credential leaked").toBe(false);
    }

    if (existsSync(paths.credentials)) {
        expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
    }
}

interface TestCase {
    name: string;
    command: string;
    args: string[];
    stdin?: string;
    outcome?: "success" | "500" | "network" | "echo" | "refresh-echo";
    expectedError?: string;
    expectedUserError?: string;
    requests: readonly string[];
    uploads?: readonly string[];
}

const TEST_CASES: TestCase[] = [
    // 1. sync --source ingame --qr - (success, 500, network)
    {
        name: "sync --source ingame --qr - [success]",
        command: "sync",
        args: ["--source", "ingame", "--qr", "-"],
        stdin: qrCode,
        outcome: "success",
        requests: [qrUrl, updateUrl, dfUploadUrl, lxnsScoresUrl],
        uploads: ["diving-fish", "lxns"],
    },
    {
        name: "sync --source ingame --qr - [500]",
        command: "sync",
        args: ["--source", "ingame", "--qr", "-"],
        stdin: qrCode,
        outcome: "500",
        requests: [qrUrl, updateUrl],
        expectedError: "UPSTREAM_ERROR",
    },
    {
        name: "sync --source ingame --qr - [network error]",
        command: "sync",
        args: ["--source", "ingame", "--qr", "-"],
        stdin: qrCode,
        outcome: "network",
        requests: [qrUrl, updateUrl],
        expectedError: "NETWORK",
    },

    // 2. sync --source lxns (success, 500, network)
    {
        name: "sync --source lxns [success]",
        command: "sync",
        args: ["--source", "lxns"],
        outcome: "success",
        requests: [lxnsPlayerUrl, lxnsScoresUrl],
    },
    {
        name: "sync --source lxns [500]",
        command: "sync",
        args: ["--source", "lxns"],
        outcome: "500",
        requests: [lxnsPlayerUrl, lxnsPlayerUrl],
        expectedError: "UPSTREAM_ERROR",
    },
    {
        name: "sync --source lxns [network error]",
        command: "sync",
        args: ["--source", "lxns"],
        outcome: "network",
        requests: [lxnsPlayerUrl, lxnsPlayerUrl],
        expectedError: "NETWORK",
    },

    // 3. sync --source df-token (success, 500, network)
    {
        name: "sync --source df-token [success]",
        command: "sync",
        args: ["--source", "df-token"],
        outcome: "success",
        requests: [dfRecordsUrl],
    },
    {
        name: "sync --source df-token [500]",
        command: "sync",
        args: ["--source", "df-token"],
        outcome: "500",
        requests: [dfRecordsUrl, dfRecordsUrl],
        expectedError: "UPSTREAM_ERROR",
    },
    {
        name: "sync --source df-token [network error]",
        command: "sync",
        args: ["--source", "df-token"],
        outcome: "network",
        requests: [dfRecordsUrl, dfRecordsUrl],
        expectedError: "NETWORK",
    },

    // 4. sync --source df-name (success, 500, network)
    {
        name: "sync --source df-name [success]",
        command: "sync",
        args: ["--source", "df-name"],
        outcome: "success",
        requests: [dfUpdateUserUrl],
    },
    {
        name: "sync --source df-name [500]",
        command: "sync",
        args: ["--source", "df-name"],
        outcome: "500",
        requests: [dfUpdateUserUrl, dfUpdateUserUrl, dfPublicUrl, dfPublicUrl],
        expectedError: "UPSTREAM_ERROR",
    },
    {
        name: "sync --source df-name [network error]",
        command: "sync",
        args: ["--source", "df-name"],
        outcome: "network",
        requests: [dfUpdateUserUrl, dfUpdateUserUrl, dfPublicUrl, dfPublicUrl],
        expectedError: "NETWORK",
    },

    // 5. every source again, with upstream errors that quote the secrets back
    {
        name: "sync --source ingame --qr - [echo]",
        command: "sync",
        args: ["--source", "ingame", "--qr", "-"],
        stdin: qrCode,
        outcome: "echo",
        requests: [qrUrl, updateUrl],
        expectedError: "UPSTREAM_ERROR",
    },
    {
        name: "sync --source lxns [echo]",
        command: "sync",
        args: ["--source", "lxns"],
        outcome: "echo",
        requests: [lxnsPlayerUrl],
        expectedError: "UPSTREAM_ERROR",
    },
    {
        name: "sync --source df-token [echo]",
        command: "sync",
        args: ["--source", "df-token"],
        outcome: "echo",
        requests: [dfRecordsUrl],
        expectedError: "NOT_BOUND",
    },
    {
        name: "sync --source df-name [echo]",
        command: "sync",
        args: ["--source", "df-name"],
        outcome: "echo",
        requests: [dfUpdateUserUrl, dfUpdateUserUrl, dfPublicUrl],
        expectedError: "UPSTREAM_ERROR",
    },
    {
        name: "sync [echo]",
        command: "sync",
        args: [],
        outcome: "echo",
        requests: [updateUrl, updateUrl],
        expectedError: "UPSTREAM_ERROR",
    },
    {
        name: "sync --all [echo]",
        command: "sync",
        args: ["--all"],
        outcome: "echo",
        requests: [updateUrl, updateUrl],
        expectedUserError: "UPSTREAM_ERROR",
    },

    // 6. sync --all, sync --all --dry-run, sync --dry-run --qr -
    {
        name: "sync --all",
        command: "sync",
        args: ["--all"],
        outcome: "success",
        requests: [updateUrl, lxnsPlayerUrl, lxnsScoresUrl, dfUploadUrl, lxnsScoresUrl],
        uploads: ["diving-fish", "lxns"],
    },
    {
        name: "sync --all --dry-run",
        command: "sync",
        args: ["--all", "--dry-run"],
        requests: [],
    },
    {
        name: "sync --dry-run --qr -",
        command: "sync",
        args: ["--dry-run", "--qr", "-"],
        requests: [],
        stdin: qrCode,
    },

    {
        name: "sync --source lxns [expired token, refresh form echoed]",
        command: "sync",
        args: ["--source", "lxns"],
        outcome: "refresh-echo",
        requests: [lxnsTokenUrl],
        expectedError: "UPSTREAM_ERROR",
    },

    // 7. user show, user list, status
    {
        name: "user show",
        requests: [],
        command: "user",
        args: ["show"],
    },
    {
        name: "user list",
        requests: [],
        command: "user",
        args: ["list"],
    },
    {
        name: "status",
        requests: [],
        command: "status",
        args: [],
    },

    // 8. user unbind <user> lxns and user unbind <user> df-token
    {
        name: `user unbind ${uid} lxns`,
        requests: [],
        command: "user",
        args: ["unbind", uid, "lxns"],
    },
    {
        name: `user unbind ${uid} df-token`,
        requests: [],
        command: "user",
        args: ["unbind", uid, "df-token"],
    },
];

describe("secrecy sweep across commands and outcomes", () => {
    it.each(TEST_CASES)("$name leaves no secrets in output or store", async testCase => {
        const paths = makeHome();
        await setupFreshDirectory(paths, testCase.outcome === "refresh-echo");

        let network: Record<string, Route> | undefined;
        if (testCase.outcome === "success") {
            network = successRoutes();
        } else if (testCase.outcome === "500") {
            network = error500Routes();
        } else if (testCase.outcome === "network") {
            network = networkErrorRoutes();
        } else if (testCase.outcome === "echo") {
            network = echoRoutes(testCase.stdin !== undefined);
        } else if (testCase.outcome === "refresh-echo") {
            network = {
                [lxnsTokenUrl]: request => {
                    expect(new URLSearchParams(request.init?.body).get("refresh_token")).toBe(
                        refreshToken
                    );
                    return jsonResponse(
                        {
                            error: "temporarily_unavailable",
                            error_description: `FAKE rejected form: ${request.init?.body}; ${encodeURIComponent(refreshToken)}; ${refreshToken}`,
                        },
                        400
                    );
                },
            };
        }

        const result = await commandIn(paths, testCase.command, [...testCase.args, "--verbose"], {
            env,
            stdin: testCase.stdin,
            network,
        });

        expect(result.requests.map(request => request.url)).toEqual(testCase.requests);
        if (testCase.expectedError) {
            expect(result.json.ok).toBe(false);
            expect(result.json.error.code).toBe(testCase.expectedError);
        } else {
            expect(result.code).toBe(0);
            expect(result.json.ok).toBe(true);
        }
        if (testCase.expectedUserError) {
            expect(result.json.data.results).toMatchObject([
                { ok: false, error: { code: testCase.expectedUserError } },
            ]);
        }
        if (testCase.uploads) {
            const sync = testCase.args.includes("--all")
                ? result.json.data.results[0].data
                : result.json.data;
            expect(sync.uploads).toEqual(
                testCase.uploads.map(target => ({ target, ok: true, error: null }))
            );
        }
        if (testCase.outcome === "refresh-echo") {
            const store = openStore(paths);
            try {
                expect(readRuns(store).items).toMatchObject([
                    {
                        outcome: "failed",
                        errorCode: "UPSTREAM_ERROR",
                        errorMessage: expect.stringContaining("FAKE rejected form"),
                    },
                ]);
            } finally {
                store.close();
            }
        }
        assertNoSecrets(paths, result);
    });
});

describe("protectSyncSecrets", () => {
    const ctx = { log: () => {} } as unknown as CommandContext;
    const secretUser = {
        divingFish: { importToken },
        lxns: { auth: { accessToken, refreshToken } },
    } as unknown as User;

    it("replaces an internal error by one without its cause and with every secret hidden", () => {
        const cause = new Error(`inner ${importToken}`);
        const error = new Error(`outer ${refreshToken} ${accessToken} ${qrCode}`, { cause });
        const safe = protectSyncSecrets(ctx, secretUser, qrCode).withoutCause(error) as Error;
        expect(safe).not.toBe(error);
        expect(safe.cause).toBeUndefined();
        expect(safe.message).toBe("outer <已隐藏> <已隐藏> <已隐藏>");
    });

    it("hides a secret added later, such as a refreshed token", () => {
        const secrets = protectSyncSecrets(ctx, secretUser);
        secrets.add("FAKE-LXNS-REFRESHED-0002");
        expect(secrets.redact("got FAKE-LXNS-REFRESHED-0002")).toBe("got <已隐藏>");
    });
});
