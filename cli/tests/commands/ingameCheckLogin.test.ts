import type { User } from "@core/user/type";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { Route } from "../mockHttp";
import { existsSync, readFileSync } from "node:fs";
import { SaltAPIEndpoints } from "@core/integrations/saltnet/client";
import { describe, expect, it } from "vitest";
import { createRegistry } from "../../src/commands";
import { ingameCheckLogin } from "../../src/commands/ingame";
import { CliError } from "../../src/errors";
import { resolveConfig } from "../../src/runtime/config";
import { stageCredentials } from "../../src/runtime/credentials";
import { createHttp } from "../../src/runtime/http";
import { openStore } from "../../src/store/store";
import { postQrGameApi } from "../../src/sync/ingame";
import { readRuns } from "../../src/sync/journal";
import { replaceUsers } from "../../src/users/repository";
import { splitCommandLine } from "../../src/util/shell";
import { commandIn } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { createHarness, run } from "../harness";
import { delayedRoute, jsonResponse, mockFetch, textResponse } from "../mockHttp";
import { parsePrintedCommand } from "../printedCommand";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const backend = "https://fake-game.test";
const fallback = "https://fake-game-fallback.test";
const getQr = `${backend}/getQRInfo`;
const check = `${backend}/checkLogin`;
const gameId = 99000001; // Invented player ID.
const otherGameId = 99000002;
const qrInput = `SGWCMAID${"0".repeat(56)}FAKE0001`;
const qrCode = qrInput.slice(-64);
const qrLink = `https://fake-qr.test/?MAID${qrCode}`;
const env = { SALTNET_API_URL: backend, SALTNET_API_FALLBACK_URL: fallback };

function player(uid: string, id: number | null): User {
    return {
        uid,
        remark: `Fake player ${uid}`,
        divingFish: { name: null },
        inGame: { id, enabled: false, useFastUpdate: false },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: null },
    };
}

function seed(paths: RuntimePaths, users = [player("fake-player", gameId)]): void {
    const store = openStore(paths);
    try {
        replaceUsers(store, users, []);
    } finally {
        store.close();
    }
}

function gameRoutes(checkResponse: Route): Record<string, Route> {
    return {
        [getQr]: jsonResponse({ errorID: 0, userID: gameId }),
        [check]: checkResponse,
    };
}

async function checkLogin(
    paths: RuntimePaths,
    args: string[],
    network: Record<string, Route> = {},
    stdin = qrInput,
    extraEnv: Record<string, string> = {}
) {
    const database = existsSync(paths.database) ? readFileSync(paths.database) : undefined;
    const credentials = existsSync(paths.credentials) ? readFileSync(paths.credentials) : undefined;
    const result = await commandIn(paths, "ingame", ["check-login", "--verbose", ...args], {
        env: { ...env, ...extraEnv },
        network,
        stdin,
    });

    expect(result.stdout).not.toContain(qrCode);
    expect(result.stderr).toBe("");
    if (database) {
        const saved = readFileSync(paths.database);
        expect(saved.equals(database)).toBe(true);
        expect(saved.includes(qrCode)).toBe(false);
    } else {
        expect(existsSync(paths.database)).toBe(false);
    }
    if (credentials) expect(readFileSync(paths.credentials).equals(credentials)).toBe(true);
    else expect(existsSync(paths.credentials)).toBe(false);

    return result;
}

describe("saltnet ingame check-login", () => {
    it("requires a configured backend before reading the check-login QR code", async () => {
        const paths = makeHome();
        seed(paths);
        const harness = createHarness({
            env: { SALTNET_HOME: paths.home, SALTNET_API_URL: "", SALTNET_API_FALLBACK_URL: "" },
            stdin: qrInput,
        });
        const code = await run(createRegistry(), harness, "ingame", "check-login", "--qr", "-");
        expect(code).toBe(2);
        expect(harness.readStdin).not.toHaveBeenCalled();
        expect(harness.fetch).not.toHaveBeenCalled();
        const { error } = JSON.parse(harness.stdout());
        expect(error).toMatchObject({ code: "USAGE", message: expect.stringContaining("api.url") });
        expect(parsePrintedCommand(error.fix)).toMatchObject({
            command: "config set",
            positionals: { key: "api.url", value: "<地址>" },
        });
    });

    it.each([
        { isLogin: true, stdin: qrInput, userArgs: [], index: 0, uid: "fake-player" },
        {
            isLogin: false,
            stdin: qrLink,
            userArgs: ["--user", "fake-second"],
            index: 1,
            uid: "fake-second",
        },
    ])("returns isLogin=$isLogin for the selected user without writing", async scenario => {
        const paths = makeHome();
        seed(paths, [
            player("fake-player", scenario.index === 0 ? gameId : otherGameId),
            player("fake-second", scenario.index === 1 ? gameId : otherGameId),
        ]);
        stageCredentials(paths, {
            version: 1,
            users: { "fake-player": { divingFishImportToken: "FAKE-UNUSED-IMPORT-TOKEN" } },
        }).commit();

        const result = await checkLogin(
            paths,
            ["--qr", "-", ...scenario.userArgs],
            gameRoutes(jsonResponse({ isLogin: scenario.isLogin, echo: qrCode })),
            scenario.stdin
        );
        expect(result.requests.map(request => request.url)).toEqual([getQr, check]);
        for (const { init } of result.requests) {
            expect(init).toMatchObject({
                method: "POST",
                redirect: "manual",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ qrCode }),
            });
        }
        expect(result.code).toBe(0);
        expect(ingameCheckLogin.spec.effect).toBe("none");
        expectConforms(ingameCheckLogin.spec.dataSchema!, result.json.data);
        expect(result.json.data).toEqual({
            user: { index: scenario.index, uid: scenario.uid, name: `Fake player ${scenario.uid}` },
            isLogin: scenario.isLogin,
        });

        const store = openStore(paths);
        try {
            expect(readRuns(store).items).toEqual([]);
        } finally {
            store.close();
        }
    });

    it("publishes a working bind fix for the selected unbound user with a dash-prefixed UID", async () => {
        const paths = makeHome();
        seed(paths, [player("fake-player", gameId), player("-fake unbound", null)]);

        const result = await checkLogin(paths, ["--qr", "-", "--user=-fake unbound"]);
        expect(result.code).toBe(4);
        expect(result.requests).toEqual([]);
        expect(result.json.error).toMatchObject({
            code: "NOT_BOUND",
            fix: "saltnet user bind --qr - -- '-fake unbound' ingame",
        });

        expect(parsePrintedCommand(result.json.error.fix)).toMatchObject({
            command: "user bind",
            positionals: { user: "-fake unbound", source: "ingame" },
            options: { qr: "-" },
        });
        const [, group, ...args] = splitCommandLine(result.json.error.fix!);
        const bind = await commandIn(paths, group, args, { network: {}, stdin: "not a QR code" });
        expect(bind.json.error.code).toBe("QR_INVALID");
        expect(bind.requests).toEqual([]);
    });

    it.each([
        ["missing --qr", []],
        ["a QR pasted after --qr", ["--qr", qrInput]],
        ["a QR pasted with --qr=", [`--qr=${qrInput}`]],
        ["a bare QR positional", [qrInput]],
        ["--offline", ["--qr", "-", "--offline"]],
    ] as const)("refuses %s without a request", async (_scenario, args) => {
        const paths = makeHome();
        const result = await checkLogin(paths, [...args]);
        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
        expect(result.requests).toEqual([]);
    });

    it.each(["not a QR code", "https://fake-qr.test/?MAIDshort"])(
        "refuses malformed QR input %s without a request",
        async stdin => {
            const paths = makeHome();
            seed(paths);
            const result = await checkLogin(paths, ["--qr", "-"], {}, stdin);
            expect(result.code).toBe(4);
            expect(result.json.error.code).toBe("QR_INVALID");
            expect(result.requests).toEqual([]);
        }
    );

    it.each(["rewrite", "error"])(
        "rejects another account's QR before CheckLogin with sync policy %s",
        async policy => {
            const paths = makeHome();
            seed(paths);
            const result = await checkLogin(
                paths,
                ["--qr", "-"],
                { [getQr]: jsonResponse({ errorID: 0, userID: otherGameId }) },
                qrInput,
                { SALTNET_SYNC_QR_OTHER_ACCOUNT: policy }
            );
            expect(result.code).toBe(2);
            expect(result.json.error).toMatchObject({
                code: "USAGE",
                message: "二维码属于另一个舞萌账号",
            });
            expect(result.requests.map(request => request.url)).toEqual([getQr]);
        }
    );

    it.each([
        { endpoint: getQr, urls: [getQr] },
        { endpoint: check, urls: [getQr, check] },
    ])("reports an echoed expired QR from $endpoint safely", async ({ endpoint, urls }) => {
        const paths = makeHome();
        seed(paths);
        const result = await checkLogin(paths, ["--qr", "-"], {
            ...gameRoutes(jsonResponse({ isLogin: true })),
            [endpoint]: jsonResponse({ error: `QR code is expired: ${qrCode}` }, 400),
        });
        expect(result.code).toBe(4);
        expect(result.json.error.code).toBe("QR_INVALID");
        expect(result.requests.map(request => request.url)).toEqual(urls);
    });

    it.each([
        ["HTTP 503", jsonResponse({ error: qrCode }, 503), "UPSTREAM_ERROR"],
        ["HTTP 307", textResponse(qrCode, 307), "UPSTREAM_ERROR"],
        ["an invalid status", jsonResponse({ isLogin: qrCode }), "UPSTREAM_ERROR"],
        ["a malformed response", textResponse(qrCode), "UPSTREAM_ERROR"],
        [
            "a transport failure",
            () => {
                throw new Error(`request echoed ${qrCode}`, { cause: new Error(qrCode) });
            },
            "NETWORK",
        ],
    ] as const)(
        "sends CheckLogin only once after %s and keeps errors private",
        async (_case, response, code) => {
            const paths = makeHome();
            seed(paths);
            const result = await checkLogin(paths, ["--qr", "-"], gameRoutes(response));
            expect(result.code).toBe(5);
            expect(result.json.error).toMatchObject({ code, retryable: false });
            expect(result.requests.map(request => request.url)).toEqual([getQr, check]);
        }
    );

    it.each([
        jsonResponse({ error: `QR code is expired: ${qrCode}` }, 400),
        () => {
            throw new Error(qrCode, { cause: new Error(qrCode) });
        },
    ])("drops the upstream detail and cause from CheckLogin errors", async response => {
        const fetch = mockFetch({ [check]: response });
        const ctx = {
            config: resolveConfig({ env }),
            http: () =>
                createHttp({
                    fetch,
                    timeoutKey: "network.timeoutMs",
                    timeoutMs: 1000,
                    userAgent: "saltnet/fake",
                }),
        };
        const error: unknown = await postQrGameApi(ctx, SaltAPIEndpoints.CheckLogin, {
            qrCode,
        }).catch((error: unknown) => error);
        expect(fetch.requests).toHaveLength(1);
        if (!(error instanceof CliError)) throw new TypeError("Expected a CliError");
        expect(error.cause).toBeUndefined();
        expect(error.stack).not.toContain(qrCode);
    });

    it("pins the user in the timeout fix, including a default UID that starts with a dash", async () => {
        const paths = makeHome();
        seed(paths, [player("-fake default", gameId)]);
        const answer = jsonResponse({ isLogin: true });
        const result = await checkLogin(
            paths,
            ["--qr", "-"],
            gameRoutes(delayedRoute(answer, 1000)),
            qrInput,
            {
                SALTNET_NETWORK_TIMEOUT_MS: "100",
            }
        );
        expect(result.requests.map(request => request.url)).toEqual([getQr, check]);
        expect(result.json.error).toMatchObject({
            code: "NETWORK",
            message: expect.stringContaining("saltnet config set network.timeoutMs 60000"),
            // A request carrying the QR code is never sent twice.
            retryable: false,
            fix: "saltnet ingame check-login '--user=-fake default' --qr -",
        });
        expect(parsePrintedCommand(result.json.error.fix)).toMatchObject({
            command: "ingame check-login",
            options: { user: "-fake default", qr: "-" },
        });
        const [, group, ...args] = splitCommandLine(result.json.error.fix!);
        const retry = await commandIn(paths, group, args, {
            env,
            network: gameRoutes(answer),
            stdin: qrInput,
        });
        expect(retry.code).toBe(0);
        expect(retry.json.data.user.uid).toBe("-fake default");
    });

    it("does not create a data directory when there are no stored users", async () => {
        const paths = makeHome();
        const result = await checkLogin(paths, ["--qr", "-"]);
        expect(result.json.error.code).toBe("NO_USER");
        expect(result.requests).toEqual([]);
        expect(existsSync(paths.home)).toBe(false);
    });
});
