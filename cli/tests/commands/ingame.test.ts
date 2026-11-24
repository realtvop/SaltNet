import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { User } from "@core/user/type";
import { Buffer } from "node:buffer";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import { buildGameBackup } from "@core/user/gameBackup";
import * as gameBackupModule from "@core/user/gameBackup";
import { describe, expect, it, vi } from "vitest";
import { createRegistry } from "../../src/commands";
import { openStore } from "../../src/store/store";
import { replaceUsers } from "../../src/users/repository";
import { splitCommandLine } from "../../src/util/shell";
import { commandIn } from "../commandRun";
import { expectConforms } from "../dataSchema";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const registry = createRegistry();
const schema = registry.find("ingame backup")!.spec.dataSchema!;

function makeUser(uid: string, overrides: Partial<User> = {}): User {
    const record: DivingFishFullRecord = {
        song_id: 10,
        type: "SD",
        title: "Test Song",
        level: "13",
        level_index: 3,
        level_label: "Master",
        ds: 13.2,
        achievements: 100.2,
        dxScore: 2800,
        fc: ComboStatus.FullCombo,
        fs: SyncStatus.FullSync,
        rate: RankRate.sss,
        ra: 300,
        play_count: 15,
    };

    return {
        uid,
        remark: overrides.remark ?? null,
        divingFish: { name: `fish-${uid}`, importToken: null, ...overrides.divingFish },
        lxns: { auth: null, name: null, id: null, ...overrides.lxns },
        inGame: {
            id: 10000001,
            name: `Player_${uid}`,
            enabled: true,
            useFastUpdate: false,
            ...overrides.inGame,
        },
        settings: { manuallyUpdate: false, ...overrides.settings },
        data: {
            updateTime: 1700000000000,
            name: null,
            rating: 15500,
            detailed: {
                "10-3": record,
            },
            items: [[], [{ itemKind: 1, itemId: 100, stock: 1, isValid: true }]],
            characters: [
                {
                    characterId: 101,
                    point: 200,
                    level: 20,
                    awakening: 3,
                    useCount: 50,
                    nextAwake: 100,
                    nextAwakePercent: 50,
                },
            ],
            ...overrides.data,
        },
    };
}

describe("saltnet ingame backup", () => {
    it("writes game-format JSON equal to buildGameBackup, with 0600 mode, matching dataSchema", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const user = makeUser("user-1");
        const store = openStore(paths);
        replaceUsers(store, [user], []);
        store.close();

        const file = "my-backup.json";
        const { code, json } = await commandIn(paths, "ingame", ["backup", file], { cwd });

        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expectConforms(schema, json.data);

        const absolutePath = path.resolve(cwd, file);
        expect(json.data.path).toBe(absolutePath);
        expect(json.data.user).toEqual({
            index: 0,
            uid: "user-1",
            name: "Player_user-1",
        });
        expect(json.data.counts).toEqual({
            music: 1,
            items: 1,
            characters: 1,
        });

        const expectedContent = JSON.stringify(buildGameBackup(user), null, 2);
        const actualContent = readFileSync(absolutePath, "utf8");
        expect(actualContent).toBe(expectedContent);
        expect(json.data.byteSize).toBe(Buffer.byteLength(expectedContent));

        const stat = statSync(absolutePath);
        expect(stat.mode & 0o777).toBe(0o600);
    });

    it("picks the default user when --user is omitted, and picks the named user with --user", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const user1 = makeUser("user-one", {
            inGame: { id: 11111111, name: "FirstUser", enabled: true, useFastUpdate: false },
        });
        const user2 = makeUser("user-two", {
            inGame: { id: 22222222, name: "SecondUser", enabled: true, useFastUpdate: false },
        });
        const store = openStore(paths);
        replaceUsers(store, [user1, user2], []);
        store.close();

        // Default user
        const resDefault = await commandIn(paths, "ingame", ["backup", "default.json"], { cwd });
        expect(resDefault.code).toBe(0);
        expect(resDefault.json.data.user.uid).toBe("user-one");
        expect(resDefault.json.data.user.name).toBe("FirstUser");

        // Named user by uid
        const resNamed = await commandIn(
            paths,
            "ingame",
            ["backup", "named.json", "--user", "user-two"],
            { cwd }
        );
        expect(resNamed.code).toBe(0);
        expect(resNamed.json.data.user.uid).toBe("user-two");
        expect(resNamed.json.data.user.name).toBe("SecondUser");
    });

    it("fails with NO_USER when no users exist", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const { code, json } = await commandIn(paths, "ingame", ["backup", "backup.json"], { cwd });

        expect(code).toBe(4);
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe("NO_USER");
    });

    it("fails with NOT_BOUND when the user has no inGame.id, naming user and suggesting user bind", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const user = makeUser("user-unbound", {
            remark: "UnboundUser",
            inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
        });
        const store = openStore(paths);
        replaceUsers(store, [user], []);
        store.close();

        const { code, json } = await commandIn(paths, "ingame", ["backup", "backup.json"], { cwd });

        expect(code).toBe(4);
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe("NOT_BOUND");
        expect(json.error.message).toContain("UnboundUser");
        expect(json.error.fix).toBe("saltnet user bind user-unbound ingame --qr -");
    });

    it("writes a digit-only uid as uid:<uid> in the bind fix", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const unbound = { id: null, name: null, enabled: false, useFastUpdate: false };
        const store = openStore(paths);
        replaceUsers(
            store,
            [
                makeUser("first", { remark: "First", inGame: unbound }),
                makeUser("0", { remark: "Digits", inGame: unbound }),
            ],
            []
        );
        store.close();

        const { json } = await commandIn(
            paths,
            "ingame",
            ["backup", "backup.json", "--user", "Digits"],
            { cwd }
        );

        expect(json.error.code).toBe("NOT_BOUND");
        expect(json.error.fix).toBe("saltnet user bind uid:0 ingame --qr -");
    });

    it("quotes a uid that looks like an option in every fix", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const store = openStore(paths);
        replaceUsers(
            store,
            [
                makeUser("user-default"),
                makeUser("-dash user", {
                    inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
                }),
                makeUser("-no scores", {
                    data: { updateTime: null, name: null, rating: null, detailed: {} },
                }),
                makeUser("-no characters", {
                    data: { ...makeUser("x").data, characters: [] },
                }),
            ],
            []
        );
        store.close();
        const run = (uid: string) =>
            commandIn(paths, "ingame", ["backup", "dash.json", `--user=${uid}`], { cwd });

        const unbound = await run("-dash user");
        expect(unbound.json.error).toMatchObject({
            code: "NOT_BOUND",
            fix: "saltnet user bind --qr - -- '-dash user' ingame",
        });
        const [group, ...rest] = splitCommandLine(unbound.json.error.fix ?? "").slice(1);
        const bind = await commandIn(paths, group, rest, { cwd, stdin: "not a qr code" });
        expect(bind.json.error.code).toBe("QR_INVALID");
        const noScores = await run("-no scores");
        expect(noScores.json.error).toMatchObject({
            code: "NOT_FOUND",
            fix: "saltnet sync '--user=-no scores'",
        });
        const noCharacters = await run("-no characters");
        expect(noCharacters.code).toBe(0);
        expect(noCharacters.json.warnings).toMatchObject([
            { code: "PARTIAL_BACKUP", fix: "saltnet sync '--user=-no characters' --source ingame" },
        ]);
    });

    it("fails with NOT_FOUND when user data has not been updated or detailed scores are missing", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        // 1. No updateTime (default user -> syncFix is "saltnet sync")
        const userNoTime = makeUser("user-notime", {
            data: {
                updateTime: null,
                name: null,
                rating: null,
                detailed: { "1-0": {} as never },
            },
        });
        // 2. Empty detailed scores (non-default user -> syncFix is "saltnet sync --user <uid>")
        const userNoDetailed = makeUser("user-nodetailed", {
            data: {
                updateTime: 1700000000000,
                name: null,
                rating: 10000,
                detailed: {},
            },
        });

        const store = openStore(paths);
        replaceUsers(store, [userNoTime, userNoDetailed], []);
        store.close();

        // Check user 0 (default user)
        const res1 = await commandIn(paths, "ingame", ["backup", "backup.json"], { cwd });
        expect(res1.code).toBe(3);
        expect(res1.json.ok).toBe(false);
        expect(res1.json.error.code).toBe("NOT_FOUND");
        expect(res1.json.error.message).toContain("Player_user-notime");
        expect(res1.json.error.fix).toBe("saltnet sync");

        // Check user 1 (non-default user)
        const res2 = await commandIn(
            paths,
            "ingame",
            ["backup", "backup.json", "--user", "user-nodetailed"],
            { cwd }
        );
        expect(res2.code).toBe(3);
        expect(res2.json.ok).toBe(false);
        expect(res2.json.error.code).toBe("NOT_FOUND");
        expect(res2.json.error.message).toContain("Player_user-nodetailed");
        expect(res2.json.error.fix).toBe("saltnet sync --user user-nodetailed");
    });

    it("refuses to overwrite existing file without --overwrite and replaces it with --overwrite", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const user = makeUser("user-1");
        const store = openStore(paths);
        replaceUsers(store, [user], []);
        store.close();

        const filePath = path.resolve(cwd, "existing.json");
        writeFileSync(filePath, "original content");

        // Without --overwrite
        const resFail = await commandIn(paths, "ingame", ["backup", "existing.json"], { cwd });
        expect(resFail.code).toBe(2);
        expect(resFail.json.ok).toBe(false);
        expect(resFail.json.error.code).toBe("FILE_EXISTS");
        expect(resFail.json.error.fix).toBe("saltnet ingame backup existing.json --overwrite");
        expect(readFileSync(filePath, "utf8")).toBe("original content");

        // With --overwrite
        const resSuccess = await commandIn(
            paths,
            "ingame",
            ["backup", "existing.json", "--overwrite"],
            { cwd }
        );
        expect(resSuccess.code).toBe(0);
        expect(resSuccess.json.ok).toBe(true);
        expect(readFileSync(filePath, "utf8")).not.toBe("original content");
    });

    it("refuses to overwrite a file created after the early check without --overwrite", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const user = makeUser("user-race");
        const store = openStore(paths);
        replaceUsers(store, [user], []);
        store.close();

        const filePath = path.resolve(cwd, "late-created.json");
        const spy = vi.spyOn(gameBackupModule, "buildGameBackup").mockImplementationOnce(u => {
            writeFileSync(filePath, "created after early check");
            return gameBackupModule.buildGameBackup(u);
        });

        try {
            const resFail = await commandIn(paths, "ingame", ["backup", "late-created.json"], {
                cwd,
            });
            expect(resFail.code).toBe(2);
            expect(resFail.json.ok).toBe(false);
            expect(resFail.json.error.code).toBe("FILE_EXISTS");
            expect(resFail.json.error.fix).toBe(
                "saltnet ingame backup late-created.json --overwrite"
            );
            expect(readFileSync(filePath, "utf8")).toBe("created after early check");
            const tmpFiles = readdirSync(cwd).filter(f => f.endsWith(".tmp"));
            expect(tmpFiles).toEqual([]);
        } finally {
            spy.mockRestore();
        }

        const resSuccess = await commandIn(
            paths,
            "ingame",
            ["backup", "late-created.json", "--overwrite"],
            { cwd }
        );
        expect(resSuccess.code).toBe(0);
        expect(readFileSync(filePath, "utf8")).not.toBe("created after early check");
        expect(statSync(filePath).mode & 0o777).toBe(0o600);
    });

    it("fails with USAGE when directory does not exist and does not create the directory", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const user = makeUser("user-1");
        const store = openStore(paths);
        replaceUsers(store, [user], []);
        store.close();

        const target = path.join("nonexistent-dir", "backup.json");
        const { code, json } = await commandIn(paths, "ingame", ["backup", target], { cwd });

        expect(code).toBe(2);
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe("USAGE");
        expect(json.error.message).toContain("nonexistent-dir");
        expect(json.error.message).toContain("ingame backup 不会创建目录");
        expect(existsSync(path.resolve(cwd, "nonexistent-dir"))).toBe(false);
    });

    it("warns with PARTIAL_BACKUP when characters are missing/empty, and gives no warning when characters exist", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const userNoChars = makeUser("user-nochars", {
            data: {
                updateTime: 1700000000000,
                name: null,
                rating: 14000,
                detailed: {
                    "10-3": {
                        song_id: 10,
                        type: "SD",
                        title: "Test",
                        level: "13",
                        level_index: 3,
                        level_label: "Master",
                        ds: 13.0,
                        achievements: 100.0,
                        dxScore: 2000,
                        fc: ComboStatus.None,
                        fs: SyncStatus.None,
                        rate: RankRate.sss,
                        ra: 280,
                        play_count: 5,
                    },
                },
                characters: [],
            },
        });
        const userWithChars = makeUser("user-withchars");

        // 1. Default user has no characters -> PARTIAL_BACKUP warning
        const store1 = openStore(paths);
        replaceUsers(store1, [userNoChars, userWithChars], []);
        store1.close();

        const resPartial = await commandIn(paths, "ingame", ["backup", "partial.json"], { cwd });
        expect(resPartial.code).toBe(0);
        expect(resPartial.json.ok).toBe(true);
        expect(resPartial.json.warnings).toHaveLength(1);
        expect(resPartial.json.warnings[0].code).toBe("PARTIAL_BACKUP");
        expect(resPartial.json.warnings[0].message).toContain("Player_user-nochars");
        expect(resPartial.json.warnings[0].fix).toBe("saltnet sync --source ingame");
        // File is still written
        expect(existsSync(path.resolve(cwd, "partial.json"))).toBe(true);

        // 2. Non-default user has no characters -> PARTIAL_BACKUP warning with --user fix
        const store2 = openStore(paths);
        replaceUsers(store2, [userWithChars, userNoChars], []);
        store2.close();

        const resPartialUser2 = await commandIn(
            paths,
            "ingame",
            ["backup", "partial2.json", "--user", "user-nochars"],
            { cwd }
        );
        expect(resPartialUser2.code).toBe(0);
        expect(resPartialUser2.json.warnings[0].fix).toBe(
            "saltnet sync --user user-nochars --source ingame"
        );

        // 3. User with characters -> no PARTIAL_BACKUP warning
        const resComplete = await commandIn(
            paths,
            "ingame",
            ["backup", "complete.json", "--user", "user-withchars"],
            { cwd }
        );
        expect(resComplete.code).toBe(0);
        expect(resComplete.json.warnings).toEqual([]);
    });

    it("never reads or creates credentials.json and makes no network requests", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const user = makeUser("user-offline");
        const store = openStore(paths);
        replaceUsers(store, [user], []);
        store.close();

        const { code, json } = await commandIn(paths, "ingame", ["backup", "offline.json"], {
            cwd,
        });
        expect(code).toBe(0);
        expect(json.ok).toBe(true);

        // Check that credentials.json does not exist
        const credPath = path.join(paths.home, "credentials.json");
        expect(existsSync(credPath)).toBe(false);
    });

    it("fails with USAGE when a part of the path is a file", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const store = openStore(paths);
        replaceUsers(store, [makeUser("user-1")], []);
        store.close();
        writeFileSync(path.resolve(cwd, "taken.json"), "original content");

        const { code, json } = await commandIn(
            paths,
            "ingame",
            ["backup", path.join("taken.json", "backup.json")],
            { cwd }
        );

        expect(code).toBe(2);
        expect(json.error.code).toBe("USAGE");
        expect(json.error.message).toContain("ingame backup 不会创建目录");
        expect(readFileSync(path.resolve(cwd, "taken.json"), "utf8")).toBe("original content");
    });

    it("treats a user without a characters list as a partial backup", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const user = makeUser("user-1");
        const store = openStore(paths);
        replaceUsers(
            store,
            [makeUser("user-1", { data: { ...user.data, characters: undefined } })],
            []
        );
        store.close();

        const { code, json } = await commandIn(paths, "ingame", ["backup", "partial.json"], {
            cwd,
        });

        expect(code).toBe(0);
        expect(json.data.counts.characters).toBe(0);
        expect(json.warnings.map((warning: { code: string }) => warning.code)).toEqual([
            "PARTIAL_BACKUP",
        ]);
    });

    it("keeps the selected user in the overwrite fix, and the fix runs", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const second = makeUser("user-2");
        const dashed = makeUser("-dash user");
        const store = openStore(paths);
        replaceUsers(store, [makeUser("user-1"), second, dashed], []);
        store.close();
        writeFileSync(path.resolve(cwd, "existing.json"), "original content");
        writeFileSync(path.resolve(cwd, "-dash.json"), "original content");

        const named = await commandIn(
            paths,
            "ingame",
            ["backup", "existing.json", "--user", "user-2"],
            { cwd }
        );
        expect(named.json.error.code).toBe("FILE_EXISTS");
        expect(named.json.error.fix).toBe(
            "saltnet ingame backup existing.json --user user-2 --overwrite"
        );
        const [, group, ...rest] = splitCommandLine(named.json.error.fix ?? "");
        const rerun = await commandIn(paths, group, rest, { cwd });
        expect(rerun.code).toBe(0);
        expect(readFileSync(path.resolve(cwd, "existing.json"), "utf8")).toBe(
            JSON.stringify(buildGameBackup(second), null, 2)
        );

        const looksLikeOptions = await commandIn(
            paths,
            "ingame",
            ["backup", "--user=-dash user", "--", "-dash.json"],
            { cwd }
        );
        expect(looksLikeOptions.json.error.code).toBe("FILE_EXISTS");
        expect(looksLikeOptions.json.error.fix).toBe(
            "saltnet ingame backup ./-dash.json '--user=-dash user' --overwrite"
        );
        const [, dashGroup, ...dashRest] = splitCommandLine(looksLikeOptions.json.error.fix ?? "");
        const dashRerun = await commandIn(paths, dashGroup, dashRest, { cwd });
        expect(dashRerun.code).toBe(0);
        expect(readFileSync(path.resolve(cwd, "-dash.json"), "utf8")).toBe(
            JSON.stringify(buildGameBackup(dashed), null, 2)
        );
    });

    it("reports the size of the file in bytes", async () => {
        const paths = makeHome();
        const cwd = path.dirname(paths.home);
        const user = makeUser("user-1", { inGame: { id: 10000001, name: "测试玩家ＡＢＣ" } });
        const store = openStore(paths);
        replaceUsers(store, [user], []);
        store.close();

        const { code, json } = await commandIn(paths, "ingame", ["backup", "bytes.json"], { cwd });

        expect(code).toBe(0);
        const content = readFileSync(path.resolve(cwd, "bytes.json"), "utf8");
        expect(json.data.byteSize).toBe(statSync(path.resolve(cwd, "bytes.json")).size);
        expect(json.data.byteSize).toBeGreaterThan(content.length);
    });
});
