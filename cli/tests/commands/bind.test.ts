import type { User } from "@core/user/type";
import type { Route } from "../mockHttp";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRegistry } from "../../src/commands";
import { readCredentials } from "../../src/runtime/credentials";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import {
    listUsers,
    readUser,
    readUsers,
    removeUser,
    replaceUsers,
} from "../../src/users/repository";
import { commandIn } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { jsonResponse, textResponse } from "../mockHttp";
import { useTempHome } from "../tempHome";
import { useTimeZone } from "../zone";

useTimeZone("Asia/Shanghai");

const makeHome = useTempHome();
const registry = createRegistry();

function schemaOf(name: string) {
    const command = registry.find(name);
    if (!command?.spec.dataSchema) throw new Error(`命令 ${name} 没有 dataSchema`);
    return command.spec.dataSchema;
}

const DF_BASE_URL = "https://www.diving-fish.com/api/maimaidxprober";
const SALTNET_API_URL = "https://saltnet.test";
const SALTNET_FALLBACK_URL = "https://fallback.test";

function makeUser(uid: string, overrides: Partial<User> = {}): User {
    return {
        uid,
        remark: overrides.remark ?? `Remark-${uid}`,
        divingFish: overrides.divingFish ?? { name: `df-${uid}`, importToken: null },
        lxns:
            overrides.lxns === undefined
                ? { auth: null, id: 1001, name: `lxns-${uid}` }
                : overrides.lxns,
        inGame: overrides.inGame ?? {
            id: 11112222,
            name: `player-${uid}`,
            enabled: true,
            useFastUpdate: true,
        },
        settings: overrides.settings ?? { manuallyUpdate: false },
        data: overrides.data ?? {
            updateTime: 1700000000000,
            name: `game-${uid}`,
            rating: 15000,
        },
    };
}

function readAllFiles(dir: string): { content: string; path: string }[] {
    const results: { content: string; path: string }[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...readAllFiles(fullPath));
        } else if (entry.isFile()) {
            results.push({ content: readFileSync(fullPath, "utf8"), path: fullPath });
        }
    }
    return results;
}

describe("user bind and unbind", () => {
    it("binds in-game account with --id and refuses changing identity", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user0 = makeUser("u0", {
            inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
        });
        replaceUsers(store, [user0], []);

        // Bind with valid 8-digit ID
        const res = await commandIn(paths, "user", ["bind", "u0", "ingame", "--id", "87654321"]);
        expect(res.code).toBe(0);
        expect(res.json.data.source).toBe("ingame");
        expect(res.json.data.changed).toBe(true);
        expect(res.json.data.inGame.id).toBe(87654321);
        expect(res.json.data.inGame.enabled).toBe(true);
        // 快速更新 stays as it was: it only decides whether the web app asks for a QR code.
        expect(res.json.data.inGame.fastUpdate).toBe(false);
        expectConforms(schemaOf("user bind"), res.json.data);

        // Verify stored user in database
        const stored = readUser(store, "u0")!;
        expect(stored.inGame).toEqual({
            id: 87654321,
            name: null,
            enabled: true,
            useFastUpdate: false,
        });

        // Re-binding the same id: changed is false, no write
        const dbMtimeBefore = statSync(paths.database).mtimeMs;
        const rebind = await commandIn(paths, "user", ["bind", "u0", "ingame", "--id", "87654321"]);
        expect(rebind.code).toBe(0);
        expect(rebind.json.data.changed).toBe(false);
        expect(statSync(paths.database).mtimeMs).toBe(dbMtimeBefore);
        expectConforms(schemaOf("user bind"), rebind.json.data);

        // Binding a different ID causes identity change -> USAGE error
        const idChange = await commandIn(paths, "user", [
            "bind",
            "u0",
            "ingame",
            "--id",
            "12345678",
        ]);
        expect(idChange.code).toBe(2);
        expect(idChange.json.error.code).toBe("USAGE");
        expect(idChange.json.error.message).toContain("绑定这个账号会改变玩家身份");
        // Stored user unchanged
        expect(readUser(store, "u0")!.inGame?.id).toBe(87654321);
    });

    it("validates --id format for ingame bind", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        replaceUsers(
            store,
            [
                makeUser("u0", {
                    inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
                }),
            ],
            []
        );

        // 7 digits
        const res7 = await commandIn(paths, "user", ["bind", "u0", "ingame", "--id", "1234567"]);
        expect(res7.code).toBe(2);
        expect(res7.json.error.code).toBe("USAGE");

        // 9 digits
        const res9 = await commandIn(paths, "user", ["bind", "u0", "ingame", "--id", "123456789"]);
        expect(res9.code).toBe(2);

        // Letters
        const resLetters = await commandIn(paths, "user", [
            "bind",
            "u0",
            "ingame",
            "--id",
            "1234abcd",
        ]);
        expect(resLetters.code).toBe(2);

        // Full-width digits
        const resFullWidth = await commandIn(paths, "user", [
            "bind",
            "u0",
            "ingame",
            "--id",
            "１２３４５６７８",
        ]);
        expect(resFullWidth.code).toBe(2);
    });

    it("binds in-game account with --qr - reading stdin and handles network outcomes", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u0", {
            inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
        });
        replaceUsers(store, [user], []);

        const validQr = `SGWCMAID${"A".repeat(76)}`;
        const secretText = "SECRET-QR-NOT-LEAKED";
        const fakeQrInput = `SGWCMAID${secretText}${"A".repeat(64)}`;

        // 1. Invalid QR text
        const invalidQrRes = await commandIn(paths, "user", ["bind", "u0", "ingame", "--qr", "-"], {
            stdin: "totally-invalid-qr-text",
        });
        expect(invalidQrRes.code).toBe(4);
        expect(invalidQrRes.json.error.code).toBe("QR_INVALID");

        // 2. Expired / invalid answer from backend
        const expiredRes = await commandIn(paths, "user", ["bind", "u0", "ingame", "--qr", "-"], {
            stdin: validQr,
            network: {
                [`${SALTNET_API_URL}/getQRInfo`]: jsonResponse({ errorID: 1 }),
            },
            env: {
                SALTNET_API_URL,
                SALTNET_API_FALLBACK_URL: SALTNET_FALLBACK_URL,
            },
        });
        expect(expiredRes.code).toBe(4);
        expect(expiredRes.json.error.code).toBe("QR_INVALID");

        // 3. Primary fails, fallback succeeds
        let primaryCalls = 0;
        let fallbackCalled = false;
        let capturedBody: unknown;

        const fallbackRoutes: Record<string, Route> = {
            [`${SALTNET_API_URL}/getQRInfo`]: () => {
                primaryCalls++;
                return textResponse("Service Unavailable", 503);
            },
            [`${SALTNET_FALLBACK_URL}/getQRInfo`]: req => {
                fallbackCalled = true;
                capturedBody = JSON.parse(req.init?.body as string);
                return jsonResponse({ errorID: 0, userID: 33334444 });
            },
        };

        const successRes = await commandIn(paths, "user", ["bind", "u0", "ingame", "--qr", "-"], {
            stdin: fakeQrInput,
            network: fallbackRoutes,
            env: {
                SALTNET_API_URL,
                SALTNET_API_FALLBACK_URL: SALTNET_FALLBACK_URL,
            },
        });
        expect(successRes.code).toBe(0);
        // The lookup is not retried: the primary is asked once, then the fallback.
        expect(primaryCalls).toBe(1);
        expect(fallbackCalled).toBe(true);
        expect(capturedBody).toEqual({ qrCode: fakeQrInput.slice(-64) });
        expect(successRes.json.data.inGame.id).toBe(33334444);
        expect(readUser(store, "u0")!.inGame?.id).toBe(33334444);
        expectConforms(schemaOf("user bind"), successRes.json.data);

        // 4. Verify QR text never appears in stdout, stderr, or any file on disk
        expect(successRes.stdout).not.toContain(secretText);
        expect(successRes.stderr).not.toContain(secretText);
        for (const file of readAllFiles(paths.home)) {
            expect(file.content).not.toContain(secretText);
        }

        // 5. Both primary and fallback failing -> NETWORK error
        const bothFailRes = await commandIn(paths, "user", ["bind", "u0", "ingame", "--qr", "-"], {
            stdin: validQr,
            network: {
                [`${SALTNET_API_URL}/getQRInfo`]: () => {
                    throw new Error("connection failed");
                },
                [`${SALTNET_FALLBACK_URL}/getQRInfo`]: () => {
                    throw new Error("fallback connection failed");
                },
            },
            env: {
                SALTNET_API_URL,
                SALTNET_API_FALLBACK_URL: SALTNET_FALLBACK_URL,
            },
        });
        expect(bothFailRes.code).toBe(5);
        expect(bothFailRes.json.error.code).toBe("NETWORK");
    });

    it("binds diving fish token with df-token -, stores in credentials.json with mode 0600, and does not leak token", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u0", { divingFish: { name: "fish-name", importToken: null } });
        replaceUsers(store, [user], []);

        const fakeToken = "FAKE-DF-TOKEN-0001";
        const recordsUrl = `${DF_BASE_URL}/player/records`;

        // Refused token
        const refusedRes = await commandIn(paths, "user", ["bind", "u0", "df-token", "-"], {
            stdin: "BAD-TOKEN",
            network: {
                [recordsUrl]: jsonResponse({ message: "invalid token" }, 401),
            },
        });
        expect(refusedRes.code).toBe(2);
        expect(refusedRes.json.error.code).toBe("USAGE");
        expect(refusedRes.json.error.message).toContain("水鱼数据拒绝了这个 Import-Token");
        expect(refusedRes.json.error.fix).toContain(
            "在水鱼查分器「用户设置」页面重新生成导入 Token 并重试"
        );
        // Token not leaked in error
        expect(refusedRes.stdout).not.toContain("BAD-TOKEN");
        expect(refusedRes.stderr).not.toContain("BAD-TOKEN");

        // HTTP 400 is a refusal too
        const badRequest = await commandIn(paths, "user", ["bind", "u0", "df-token", "-"], {
            stdin: "BAD-TOKEN",
            network: { [recordsUrl]: jsonResponse({ message: "导入token有误" }, 400) },
        });
        expect(badRequest.json.error.code).toBe("USAGE");

        // A server error is not a refusal: UPSTREAM_ERROR after one retry, nothing stored
        let serverErrors = 0;
        const serverError = await commandIn(paths, "user", ["bind", "u0", "df-token", "-"], {
            stdin: "SERVER-ERROR-TOKEN",
            network: {
                [recordsUrl]: () => {
                    serverErrors++;
                    return jsonResponse({ message: "boom" }, 500);
                },
            },
        });
        expect(serverError.code).toBe(5);
        expect(serverError.json.error.code).toBe("UPSTREAM_ERROR");
        expect(serverError.json.error.retryable).toBe(true);
        expect(serverErrors).toBe(2);
        expect(readCredentials(paths).users.u0).toBeUndefined();

        // Accepted token
        let requestHeaders: Record<string, string> | undefined;
        const acceptRes = await commandIn(paths, "user", ["bind", "u0", "df-token", "-"], {
            stdin: fakeToken,
            network: {
                [recordsUrl]: req => {
                    requestHeaders = (req.init?.headers as Record<string, string>) ?? {};
                    return jsonResponse({ records: [] });
                },
            },
        });
        expect(acceptRes.code).toBe(0);
        expect(acceptRes.json.data.changed).toBe(true);
        expect(requestHeaders?.["Import-Token"]).toBe(fakeToken);
        expectConforms(schemaOf("user bind"), acceptRes.json.data);

        // Check credentials.json
        const creds = readCredentials(paths);
        expect(creds.users.u0?.divingFishImportToken).toBe(fakeToken);
        const stat = statSync(paths.credentials);
        expect(stat.mode & 0o777).toBe(0o600);

        // Check database user: divingFish.name is null, importToken is null
        const stored = readUser(store, "u0")!;
        expect(stored.divingFish).toEqual({ name: null, importToken: null });

        // Token must not appear in stdout, stderr, or anywhere in data directory EXCEPT credentials.json
        expect(acceptRes.stdout).not.toContain(fakeToken);
        expect(acceptRes.stderr).not.toContain(fakeToken);
        for (const file of readAllFiles(paths.home)) {
            if (file.path === paths.credentials) continue;
            expect(file.content).not.toContain(fakeToken);
        }

        // Re-binding the same token: changed is false, no write
        const credsMtimeBefore = statSync(paths.credentials).mtimeMs;
        const rebindRes = await commandIn(paths, "user", ["bind", "u0", "df-token", "-"], {
            stdin: fakeToken,
            network: {
                [recordsUrl]: jsonResponse({ records: [] }),
            },
        });
        expect(rebindRes.code).toBe(0);
        expect(rebindRes.json.data.changed).toBe(false);
        expect(statSync(paths.credentials).mtimeMs).toBe(credsMtimeBefore);
    });

    it("binds diving fish username with df-name and prevents name bind if token is set", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u0", { divingFish: { name: null, importToken: null } });
        replaceUsers(store, [user], []);

        // Empty username -> USAGE
        const emptyRes = await commandIn(paths, "user", ["bind", "u0", "df-name", "   "]);
        expect(emptyRes.code).toBe(2);
        expect(emptyRes.json.error.code).toBe("USAGE");

        // Bind name
        const bindRes = await commandIn(paths, "user", ["bind", "u0", "df-name", "SaltFisher"]);
        expect(bindRes.code).toBe(0);
        expect(bindRes.json.data.changed).toBe(true);
        expect(bindRes.json.data.divingFish.name).toBe("SaltFisher");
        expect(readUser(store, "u0")!.divingFish?.name).toBe("SaltFisher");
        expectConforms(schemaOf("user bind"), bindRes.json.data);

        // Re-bind same name -> changed: false
        const rebindRes = await commandIn(paths, "user", ["bind", "u0", "df-name", "SaltFisher"]);
        expect(rebindRes.code).toBe(0);
        expect(rebindRes.json.data.changed).toBe(false);

        // Bind token first
        await commandIn(paths, "user", ["bind", "u0", "df-token", "-"], {
            stdin: "FAKE-TOKEN",
            network: { [`${DF_BASE_URL}/player/records`]: jsonResponse({ records: [] }) },
        });

        // Try to bind name while token is set -> USAGE
        const failNameRes = await commandIn(paths, "user", [
            "bind",
            "u0",
            "df-name",
            "AnotherName",
        ]);
        expect(failNameRes.code).toBe(2);
        expect(failNameRes.json.error.code).toBe("USAGE");
        expect(failNameRes.json.error.message).toContain("当前已绑定水鱼 Import-Token");
    });

    it("refuses lxns bind with USAGE", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        replaceUsers(store, [makeUser("u0")], []);

        const res = await commandIn(paths, "user", ["bind", "u0", "lxns"]);
        expect(res.code).toBe(2);
        expect(res.json.error.code).toBe("USAGE");
        expect(res.json.error.message).toContain("落雪账号绑定暂未开放");
    });

    it("unbinds each source cleanly and reports changed: false when not bound", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u0", {
            inGame: { id: 12345678, name: "my-game", enabled: true, useFastUpdate: true },
            divingFish: { name: "my-df", importToken: null },
            lxns: { auth: null, id: 999, name: "my-lxns" },
        });
        replaceUsers(store, [user], []);

        // Set credentials for u0
        await commandIn(paths, "user", ["bind", "u0", "df-token", "-"], {
            stdin: "TOKEN-TO-UNBIND",
            network: { [`${DF_BASE_URL}/player/records`]: jsonResponse({ records: [] }) },
        });

        // 1. Unbind df-token
        const unbindToken = await commandIn(paths, "user", ["unbind", "u0", "df-token"]);
        expect(unbindToken.code).toBe(0);
        expect(unbindToken.json.data.changed).toBe(true);
        expect(readCredentials(paths).users.u0?.divingFishImportToken).toBeUndefined();
        expectConforms(schemaOf("user unbind"), unbindToken.json.data);

        // Unbind df-token again -> changed: false
        const unbindTokenAgain = await commandIn(paths, "user", ["unbind", "u0", "df-token"]);
        expect(unbindTokenAgain.code).toBe(0);
        expect(unbindTokenAgain.json.data.changed).toBe(false);

        // 2. Unbind df-name: first set name then unbind
        await commandIn(paths, "user", ["bind", "u0", "df-name", "NameTest"]);
        const unbindName = await commandIn(paths, "user", ["unbind", "u0", "df-name"]);
        expect(unbindName.code).toBe(0);
        expect(unbindName.json.data.changed).toBe(true);
        expect(readUser(store, "u0")!.divingFish?.name).toBeNull();
        expectConforms(schemaOf("user unbind"), unbindName.json.data);

        // Unbind df-name again -> changed: false
        const unbindNameAgain = await commandIn(paths, "user", ["unbind", "u0", "df-name"]);
        expect(unbindNameAgain.code).toBe(0);
        expect(unbindNameAgain.json.data.changed).toBe(false);

        // 3. Unbind ingame
        const unbindIngame = await commandIn(paths, "user", ["unbind", "u0", "ingame"]);
        expect(unbindIngame.code).toBe(0);
        expect(unbindIngame.json.data.changed).toBe(true);
        // Unbinding keeps 快速更新 as it was.
        expect(readUser(store, "u0")!.inGame).toEqual({
            id: null,
            name: null,
            enabled: false,
            useFastUpdate: true,
        });
        expectConforms(schemaOf("user unbind"), unbindIngame.json.data);

        // Unbind ingame again -> changed: false
        const unbindIngameAgain = await commandIn(paths, "user", ["unbind", "u0", "ingame"]);
        expect(unbindIngameAgain.code).toBe(0);
        expect(unbindIngameAgain.json.data.changed).toBe(false);

        // 4. Unbind lxns
        // Write lxns creds
        writeFileSync(
            paths.credentials,
            JSON.stringify({
                version: 1,
                users: { u0: { lxnsAuthorization: { access_token: "fake" }, lxnsAccountId: 999 } },
            })
        );
        const unbindLxns = await commandIn(paths, "user", ["unbind", "u0", "lxns"]);
        expect(unbindLxns.code).toBe(0);
        expect(unbindLxns.json.data.changed).toBe(true);
        expect(readUser(store, "u0")!.lxns).toEqual({ auth: null, name: null, id: null });
        const credsAfter = readCredentials(paths);
        expect(credsAfter.users.u0?.lxnsAuthorization).toBeUndefined();
        expect(
            (credsAfter.users.u0 as Record<string, unknown> | undefined)?.lxnsAccountId
        ).toBeUndefined();
        expectConforms(schemaOf("user unbind"), unbindLxns.json.data);

        // Unbind lxns again -> changed: false
        const unbindLxnsAgain = await commandIn(paths, "user", ["unbind", "u0", "lxns"]);
        expect(unbindLxnsAgain.code).toBe(0);
        expect(unbindLxnsAgain.json.data.changed).toBe(false);
    });

    it("fails with NOT_FOUND if user is deleted after network and before write", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const u0 = makeUser("u0", { divingFish: { name: "u0-fish", importToken: null } });
        const u1 = makeUser("u1", { divingFish: { name: "u1-fish", importToken: null } });
        replaceUsers(store, [u0, u1], []);

        const store2 = openStore(paths);
        const recordsUrl = `${DF_BASE_URL}/player/records`;

        // When fetchDivingFishRecords runs, store2 removes u0 before write
        const res = await commandIn(paths, "user", ["bind", "u0", "df-token", "-"], {
            stdin: "TOKEN-DELETED-USER",
            network: {
                [recordsUrl]: () => {
                    removeUser(store2, "u0");
                    return jsonResponse({ records: [] });
                },
            },
        });
        expect(res.code).toBe(3);
        expect(res.json.error.code).toBe("NOT_FOUND");
        // No token stored in credentials
        const creds = readCredentials(paths);
        expect(creds.users.u0).toBeUndefined();
    });

    it("fails with DB_LOCKED when credentials lock is held by another process", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        replaceUsers(
            store,
            [
                makeUser("u0", {
                    inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
                }),
            ],
            []
        );

        // Hold credentials lock
        const acquisition = acquireLock(store, "credentials", { ttlMs: 10000 });
        expect(acquisition.acquired).toBe(true);

        const res = await commandIn(paths, "user", ["bind", "u0", "ingame", "--id", "12345678"]);
        expect(res.code).toBe(7);
        expect(res.json.error.code).toBe("DB_LOCKED");

        if (acquisition.acquired) {
            acquisition.lock.release();
        }
    });

    it("fails --offline on online binds before reading stdin and works offline on others", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        replaceUsers(
            store,
            [
                makeUser("u0", {
                    inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
                }),
            ],
            []
        );

        // ingame --qr - fails offline
        const qrOffline = await commandIn(
            paths,
            "user",
            ["bind", "u0", "ingame", "--qr", "-", "--offline"],
            {
                stdin: `SGWCMAID${"A".repeat(76)}`,
            }
        );
        expect(qrOffline.code).toBe(2);
        expect(qrOffline.json.error.code).toBe("USAGE");
        expect(qrOffline.json.error.message).toContain("离线模式");

        // df-token - fails offline
        const tokenOffline = await commandIn(
            paths,
            "user",
            ["bind", "u0", "df-token", "-", "--offline"],
            {
                stdin: "SOME-TOKEN",
            }
        );
        expect(tokenOffline.code).toBe(2);
        expect(tokenOffline.json.error.code).toBe("USAGE");
        expect(tokenOffline.json.error.message).toContain("离线模式");

        // ingame --id works offline
        const idOffline = await commandIn(paths, "user", [
            "bind",
            "u0",
            "ingame",
            "--id",
            "11223344",
            "--offline",
        ]);
        expect(idOffline.code).toBe(0);
        expect(idOffline.json.data.inGame.id).toBe(11223344);

        // df-name works offline
        const nameOffline = await commandIn(paths, "user", [
            "bind",
            "u0",
            "df-name",
            "OfflineUser",
            "--offline",
        ]);
        expect(nameOffline.code).toBe(0);
        expect(nameOffline.json.data.divingFish.name).toBe("OfflineUser");

        // unbind works offline
        const unbindOffline = await commandIn(paths, "user", [
            "unbind",
            "u0",
            "ingame",
            "--offline",
        ]);
        expect(unbindOffline.code).toBe(0);
    });

    it("leaves other users and user order unchanged", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const u0 = makeUser("u0", {
            inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
        });
        const u1 = makeUser("u1", {
            remark: "User 1 Remark",
            inGame: { id: 99998888, name: "p1", enabled: true, useFastUpdate: true },
        });
        replaceUsers(store, [u0, u1], []);

        const initialUsers = readUsers(store);
        expect(initialUsers.map(u => u.uid)).toEqual(["u0", "u1"]);

        // Bind u0
        await commandIn(paths, "user", ["bind", "u0", "ingame", "--id", "77889900"]);

        const usersAfter = readUsers(store);
        expect(usersAfter.map(u => u.uid)).toEqual(["u0", "u1"]);
        expect(usersAfter[1]).toEqual(initialUsers[1]);
        expect(listUsers(store).map(u => u.uid)).toEqual(["u0", "u1"]);
    });

    it("rejects invalid arguments and combinations", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        replaceUsers(
            store,
            [
                makeUser("u0", {
                    inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
                }),
            ],
            []
        );

        // ingame with neither --id nor --qr
        const noArgs = await commandIn(paths, "user", ["bind", "u0", "ingame"]);
        expect(noArgs.code).toBe(2);
        expect(noArgs.json.error.code).toBe("USAGE");
        expect(noArgs.json.error.message).toContain("必须且只能指定");

        // ingame with both --id and --qr
        const bothArgs = await commandIn(paths, "user", [
            "bind",
            "u0",
            "ingame",
            "--id",
            "12345678",
            "--qr",
            "-",
        ]);
        expect(bothArgs.code).toBe(2);
        expect(bothArgs.json.error.code).toBe("USAGE");
        expect(bothArgs.json.error.message).toContain("必须且只能指定");

        // ingame with unexpected positional argument
        const extraArg = await commandIn(paths, "user", [
            "bind",
            "u0",
            "ingame",
            "unexpected",
            "--id",
            "12345678",
        ]);
        expect(extraArg.code).toBe(2);
        expect(extraArg.json.error.code).toBe("USAGE");
        expect(extraArg.json.error.message).toContain("不需要值参数");

        // ingame --qr with value other than -
        const qrNonDash = await commandIn(paths, "user", [
            "bind",
            "u0",
            "ingame",
            "--qr",
            "some-file",
        ]);
        expect(qrNonDash.code).toBe(2);
        expect(qrNonDash.json.error.code).toBe("USAGE");
        expect(qrNonDash.json.error.message).toContain("只接受 -");

        // df-token without -
        const tokenMissingDash = await commandIn(paths, "user", ["bind", "u0", "df-token"]);
        expect(tokenMissingDash.code).toBe(2);
        expect(tokenMissingDash.json.error.code).toBe("USAGE");
        expect(tokenMissingDash.json.error.message).toContain("需要写 -");

        // df-token with empty stdin
        const tokenEmpty = await commandIn(paths, "user", ["bind", "u0", "df-token", "-"], {
            stdin: "   \n\t  ",
        });
        expect(tokenEmpty.code).toBe(2);
        expect(tokenEmpty.json.error.code).toBe("USAGE");
        expect(tokenEmpty.json.error.message).toContain("为空");

        // df-name missing name argument
        const nameMissing = await commandIn(paths, "user", ["bind", "u0", "df-name"]);
        expect(nameMissing.code).toBe(2);
        expect(nameMissing.json.error.code).toBe("USAGE");
        expect(nameMissing.json.error.message).toContain("需要提供水鱼用户名");

        // df-name with whitespace-only name
        const nameWhitespace = await commandIn(paths, "user", ["bind", "u0", "df-name", "   "]);
        expect(nameWhitespace.code).toBe(2);
        expect(nameWhitespace.json.error.code).toBe("USAGE");
        expect(nameWhitespace.json.error.message).toContain("水鱼用户名不能为空");

        // df-name with extra --id
        const nameWithId = await commandIn(paths, "user", [
            "bind",
            "u0",
            "df-name",
            "MyName",
            "--id",
            "12345678",
        ]);
        expect(nameWithId.code).toBe(2);
        expect(nameWithId.json.error.code).toBe("USAGE");
        expect(nameWithId.json.error.message).toContain("只能用于 ingame 来源");

        // unknown source for bind
        const unknownBind = await commandIn(paths, "user", ["bind", "u0", "unknown-source"]);
        expect(unknownBind.code).toBe(2);
        expect(unknownBind.json.error.code).toBe("USAGE");
        expect(unknownBind.json.error.message).toContain("未知的数据来源");

        // unknown source for unbind
        const unknownUnbind = await commandIn(paths, "user", ["unbind", "u0", "unknown-source"]);
        expect(unknownUnbind.code).toBe(2);
        expect(unknownUnbind.json.error.code).toBe("USAGE");
        expect(unknownUnbind.json.error.message).toContain("未知的数据来源");
    });

    it("refuses identity change when df-name changes and in-game/lxns are not set", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user = makeUser("u0", {
            inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
            lxns: { auth: null, id: null, name: null },
            divingFish: { name: "OriginalDFName", importToken: null },
        });
        replaceUsers(store, [user], []);

        const res = await commandIn(paths, "user", ["bind", "u0", "df-name", "ChangedDFName"]);
        expect(res.code).toBe(2);
        expect(res.json.error.code).toBe("USAGE");
        expect(res.json.error.message).toContain("绑定这个账号会改变玩家身份");

        // User df name remained unchanged
        expect(readUser(store, "u0")!.divingFish?.name).toBe("OriginalDFName");
    });

    it("resolves the user before reading the QR code and refuses an unusable player id", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        replaceUsers(
            store,
            [
                makeUser("u0", {
                    inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
                }),
            ],
            []
        );
        const validQr = `SGWCMAID${"A".repeat(76)}`;
        const env = { SALTNET_API_URL, SALTNET_API_FALLBACK_URL: SALTNET_FALLBACK_URL };

        // A wrong user reference fails before any request (the harness has no network).
        const wrongUser = await commandIn(
            paths,
            "user",
            ["bind", "nobody", "ingame", "--qr", "-"],
            {
                stdin: validQr,
                env,
            }
        );
        expect(wrongUser.json.error.code).toBe("NOT_FOUND");

        // userID 0 is not a player id.
        const zero = await commandIn(paths, "user", ["bind", "u0", "ingame", "--qr", "-"], {
            stdin: validQr,
            network: { [`${SALTNET_API_URL}/getQRInfo`]: jsonResponse({ errorID: 0, userID: 0 }) },
            env,
        });
        expect(zero.json.error.code).toBe("UPSTREAM_ERROR");
        expect(readUser(store, "u0")!.inGame?.id).toBeNull();
    });

    it("refuses a Diving Fish token written on the command line without sending it", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        replaceUsers(store, [makeUser("u0")], []);

        let requests = 0;
        const res = await commandIn(paths, "user", ["bind", "u0", "df-token", "TOKEN-ON-ARGV"], {
            // A usable token on stdin and an answering server: only the refusal stops the bind.
            stdin: "TOKEN-ON-STDIN",
            network: {
                [`${DF_BASE_URL}/player/records`]: () => {
                    requests++;
                    return jsonResponse({ records: [] });
                },
            },
        });
        expect(requests).toBe(0);
        expect(res.code).toBe(2);
        expect(res.json.error.code).toBe("USAGE");
        expect(res.stdout).not.toContain("TOKEN-ON-ARGV");
        expect(res.stderr).not.toContain("TOKEN-ON-ARGV");
        expect(readCredentials(paths).users.u0).toBeUndefined();
    });

    it("unbinds what is left when only part of a binding remains", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        replaceUsers(
            store,
            [
                makeUser("u0", {
                    inGame: { id: null, name: null, enabled: true, useFastUpdate: false },
                    lxns: { auth: null, id: null, name: null },
                }),
            ],
            []
        );

        // Nothing bound: no credentials file is written.
        const noToken = await commandIn(paths, "user", ["unbind", "u0", "df-token"]);
        expect(noToken.json.data.changed).toBe(false);
        expect(existsSync(paths.credentials)).toBe(false);

        // In-game updates enabled without an id still count as a binding.
        const ingame = await commandIn(paths, "user", ["unbind", "u0", "ingame"]);
        expect(ingame.json.data.changed).toBe(true);
        expect(readUser(store, "u0")!.inGame?.enabled).toBe(false);

        // An LXNS authorization left only in credentials.json is removed, including lxnsIssuedAt.
        writeFileSync(
            paths.credentials,
            JSON.stringify({
                version: 1,
                users: {
                    u0: {
                        lxnsAuthorization: { accessToken: "FAKE-LXNS" },
                        lxnsAccountId: null,
                        lxnsIssuedAt: 123456789,
                    },
                },
            })
        );
        const lxns = await commandIn(paths, "user", ["unbind", "u0", "lxns"]);
        expect(lxns.json.data.changed).toBe(true);
        expect(readCredentials(paths).users.u0?.lxnsAuthorization).toBeUndefined();
        expect(readCredentials(paths).users.u0?.lxnsAccountId).toBeUndefined();
        expect(readCredentials(paths).users.u0?.lxnsIssuedAt).toBeUndefined();
    });

    it("rejects bind and unbind with SYNC_IN_PROGRESS when target user's sync lock is held", async () => {
        const paths = makeHome();
        const store = openStore(paths);
        const user0 = makeUser("u0", {
            inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
            divingFish: { name: "df-u0", importToken: null },
        });
        const user1 = makeUser("u1", {
            inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
        });
        replaceUsers(store, [user0, user1], []);

        const initialCreds = {
            version: 1,
            users: {
                u0: { divingFishImportToken: "ORIGINAL-TOKEN" },
            },
        };
        writeFileSync(paths.credentials, `${JSON.stringify(initialCreds, null, 2)}\n`, "utf8");
        const credsBefore = readFileSync(paths.credentials, "utf8");

        // Hold sync lock for u0
        const lockU0 = acquireLock(store, "sync:u0", { ttlMs: 60_000 });
        expect(lockU0).not.toBeNull();

        // 1. user bind on u0 fails with SYNC_IN_PROGRESS
        const bindRes = await commandIn(paths, "user", [
            "bind",
            "u0",
            "ingame",
            "--id",
            "87654321",
        ]);
        expect(bindRes.code).toBe(7);
        expect(bindRes.json.error.code).toBe("SYNC_IN_PROGRESS");
        expect(readUser(store, "u0")!.inGame?.id).toBeNull();
        expect(readFileSync(paths.credentials, "utf8")).toBe(credsBefore);

        // 2. user unbind on u0 fails with SYNC_IN_PROGRESS
        const unbindRes = await commandIn(paths, "user", ["unbind", "u0", "df-token"]);
        expect(unbindRes.code).toBe(7);
        expect(unbindRes.json.error.code).toBe("SYNC_IN_PROGRESS");
        expect(readCredentials(paths).users.u0?.divingFishImportToken).toBe("ORIGINAL-TOKEN");
        expect(readFileSync(paths.credentials, "utf8")).toBe(credsBefore);

        // 3. user bind and unbind on u1 (another user) succeeds even though sync:u0 is held
        const bindU1 = await commandIn(paths, "user", ["bind", "u1", "ingame", "--id", "12345678"]);
        expect(bindU1.code).toBe(0);
        expect(bindU1.json.data.inGame.id).toBe(12345678);
        expect(readUser(store, "u1")!.inGame?.id).toBe(12345678);

        const unbindU1 = await commandIn(paths, "user", ["unbind", "u1", "ingame"]);
        expect(unbindU1.code).toBe(0);
        expect(readUser(store, "u1")!.inGame?.enabled).toBe(false);

        if (lockU0.acquired) {
            lockU0.lock.release();
        }
        store.close();
    });

    const LXNS_CREDENTIALS = {
        lxnsAccountId: 1001,
        lxnsIssuedAt: 1700000000000,
        lxnsAuthorization: {
            accessToken: "FAKE-LXNS-ACCESS",
            refreshToken: "FAKE-LXNS-REFRESH",
            tokenType: "Bearer",
            expiresAt: 1700003600000,
        },
    };

    it.each([
        {
            name: "bind df-token",
            args: ["bind", "u0", "df-token", "-"],
            stdin: "NEW-TOKEN",
            credentials: {},
        },
        { name: "bind df-name", args: ["bind", "u0", "df-name", "df-other"], credentials: {} },
        { name: "unbind ingame", args: ["unbind", "u0", "ingame"], credentials: {} },
        { name: "unbind df-name", args: ["unbind", "u0", "df-name"], credentials: {} },
        {
            name: "unbind lxns with credentials",
            args: ["unbind", "u0", "lxns"],
            credentials: { u0: LXNS_CREDENTIALS },
        },
        {
            name: "unbind lxns without credentials",
            args: ["unbind", "u0", "lxns"],
            credentials: {},
        },
    ])(
        "refuses $name with SYNC_IN_PROGRESS and changes nothing",
        async ({ args, stdin, credentials }) => {
            const paths = makeHome();
            const store = openStore(paths);
            replaceUsers(store, [makeUser("u0")], []);
            writeFileSync(
                paths.credentials,
                `${JSON.stringify({ version: 1, users: credentials }, null, 2)}\n`,
                "utf8"
            );
            const credsBefore = readFileSync(paths.credentials, "utf8");
            const userBefore = JSON.stringify(readUser(store, "u0"));

            const lock = acquireLock(store, "sync:u0", { ttlMs: 60_000 });
            expect(lock.acquired).toBe(true);

            const result = await commandIn(paths, "user", args, {
                stdin,
                network: { [`${DF_BASE_URL}/player/records`]: jsonResponse({ records: [] }) },
            });
            expect(result.code).toBe(7);
            expect(result.json.error.code).toBe("SYNC_IN_PROGRESS");
            expect(readFileSync(paths.credentials, "utf8")).toBe(credsBefore);
            expect(JSON.stringify(readUser(store, "u0"))).toBe(userBefore);

            if (lock.acquired) lock.lock.release();
            store.close();
        }
    );
});
