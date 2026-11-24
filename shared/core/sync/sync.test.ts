import type {
    DivingFishB50,
    DivingFishFullRecord,
    DivingFishRecordsResponse,
    DivingFishResponse,
} from "../integrations/diving-fish/type";
import type { LXNSAuth } from "../integrations/lxns/type";
import type { UserCharacter, UserInfo, UserItem } from "../user/inGame";
import type { DetailedData, User } from "../user/type";
import type { LXNSScoreData, SyncClients, SyncOptions, UpdateUserResponse } from "./type";
import { describe, expect, it } from "vitest";
import { CollectionKind } from "../collection/type";
import { SaltAPIEndpoints } from "../integrations/saltnet/client";
import { ComboStatus, RankRate, SyncStatus } from "../mai/types";
import { convertDetailed } from "../user/type";
import {
    chooseSyncSource,
    existingScoresForSync,
    syncFromDivingFishImportToken,
    syncFromDivingFishName,
    syncFromDivingFishPublic,
    syncFromInGame,
    syncFromLXNS,
} from "./sync";

class CustomError extends Error {
    constructor(message: string) {
        super(message);
    }

    override toString(): string {
        return `CustomError[${this.message}]`;
    }
}

function createRecord(overrides: Partial<DivingFishFullRecord> = {}): DivingFishFullRecord {
    return {
        achievements: 100.5,
        ds: 13.7,
        dxScore: 2500,
        fc: ComboStatus.FullCombo,
        fs: SyncStatus.FullSync,
        level: "13+",
        level_index: 3,
        level_label: "Master",
        play_count: 10,
        ra: 300,
        rate: RankRate.sssp,
        song_id: 1,
        title: "Test Song",
        type: "DX",
        ...overrides,
    };
}

function createUser(overrides: Partial<User> = {}): User {
    return {
        uid: "test-user-uid",
        divingFish: { name: "df-player", importToken: null },
        inGame: { id: 12345678, enabled: true, useFastUpdate: false, name: "ingame-player" },
        settings: { manuallyUpdate: false },
        data: {
            updateTime: 500_000,
            name: "test-player",
            rating: 15_000,
        },
        ...overrides,
    };
}

interface MockCall {
    method: string;
    args: unknown[];
}

function createMockClients(overrides: Partial<SyncClients> = {}) {
    const calls: MockCall[] = [];
    const clients: SyncClients = {
        fetchDivingFishPlayer: async (name: string) => {
            calls.push({ method: "fetchDivingFishPlayer", args: [name] });
            if (overrides.fetchDivingFishPlayer) return overrides.fetchDivingFishPlayer(name);
            return {
                username: name,
                nickname: "DF Nickname",
                plate: null,
                additional_rating: 10,
                rating: 15500,
                charts: { dx: [], sd: [] },
            };
        },
        fetchDivingFishRecords: async (token: string) => {
            calls.push({ method: "fetchDivingFishRecords", args: [token] });
            if (overrides.fetchDivingFishRecords) return overrides.fetchDivingFishRecords(token);
            return {
                additional_rating: 10,
                nickname: "DF Nickname",
                plate: null,
                rating: 15500,
                records: [],
                username: "user",
            };
        },
        calculateB50FromRecords: async (records: DivingFishFullRecord[]) => {
            calls.push({ method: "calculateB50FromRecords", args: [records] });
            if (overrides.calculateB50FromRecords)
                return overrides.calculateB50FromRecords(records);
            return { dx: [], sd: [] };
        },
        fetchLXNSScore: async (user: User) => {
            calls.push({ method: "fetchLXNSScore", args: [user] });
            if (overrides.fetchLXNSScore) return overrides.fetchLXNSScore(user);
            return {
                name: "LXNS User",
                rating: 15500,
                scores: {},
                b50: { dx: [], sd: [] },
                updateTime: 999_000,
            };
        },
        postGameAPIJSON: async <T>(endpoint: SaltAPIEndpoints, body: object): Promise<T> => {
            calls.push({ method: "postGameAPIJSON", args: [endpoint, body] });
            if (overrides.postGameAPIJSON) return overrides.postGameAPIJSON(endpoint, body);
            return null as unknown as T;
        },
    };
    return { clients, calls };
}

function createTestOptions(clients: SyncClients, overrides: Partial<SyncOptions> = {}) {
    const reports: [string, string | undefined][] = [];
    const uploadCalls: {
        uploadToDivingFish: [DivingFishFullRecord[], string][];
        uploadToLXNS: [DivingFishFullRecord[], User][];
    } = {
        uploadToDivingFish: [],
        uploadToLXNS: [],
    };
    const options: SyncOptions = {
        clients,
        report: (msg: string, err?: string) => {
            reports.push([msg, err]);
        },
        now: () => 1_000_000,
        uploadToDivingFish: (records, token) => {
            uploadCalls.uploadToDivingFish.push([records, token]);
        },
        uploadToLXNS: (records, user) => {
            uploadCalls.uploadToLXNS.push([records, user]);
        },
        ...overrides,
    };
    return { options, reports, uploadCalls };
}

describe("chooseSyncSource", () => {
    it("returns inGame when user.inGame.enabled is true", () => {
        const user = createUser({ inGame: { id: 12345678, enabled: true } });
        expect(chooseSyncSource(user)).toBe("inGame");
    });

    it("returns lxns when inGame is disabled and lxns access token is present", () => {
        const user = createUser({
            inGame: { id: null, enabled: false },
            lxns: {
                auth: { accessToken: "lxns-token" } as unknown as LXNSAuth,
                name: "lxns",
                id: 1,
            },
        });
        expect(chooseSyncSource(user)).toBe("lxns");
    });

    it("returns divingFishImportToken when inGame/lxns are absent and importToken is present", () => {
        const user = createUser({
            inGame: { id: null, enabled: false },
            lxns: undefined,
            divingFish: { name: "df", importToken: "df-token" },
        });
        expect(chooseSyncSource(user)).toBe("divingFishImportToken");
    });

    it("returns divingFishName when only divingFish.name is present", () => {
        const user = createUser({
            inGame: { id: null, enabled: false },
            lxns: undefined,
            divingFish: { name: "df-only", importToken: null },
        });
        expect(chooseSyncSource(user)).toBe("divingFishName");
    });

    it("returns null when no source is available", () => {
        const user = createUser({
            inGame: { id: null, enabled: false },
            lxns: undefined,
            divingFish: { name: null, importToken: null },
        });
        expect(chooseSyncSource(user)).toBeNull();
    });

    it("follows the exact priority order when multiple sources apply", () => {
        const fullUser = createUser({
            inGame: { id: 12345678, enabled: true },
            lxns: {
                auth: { accessToken: "lxns-token" } as unknown as LXNSAuth,
                name: "lxns",
                id: 1,
            },
            divingFish: { name: "df", importToken: "token" },
        });
        expect(chooseSyncSource(fullUser)).toBe("inGame");

        const noInGame = createUser({
            inGame: { id: 12345678, enabled: false },
            lxns: {
                auth: { accessToken: "lxns-token" } as unknown as LXNSAuth,
                name: "lxns",
                id: 1,
            },
            divingFish: { name: "df", importToken: "token" },
        });
        expect(chooseSyncSource(noInGame)).toBe("lxns");

        const noLxns = createUser({
            inGame: { id: 12345678, enabled: false },
            lxns: { auth: null, name: "lxns", id: 1 },
            divingFish: { name: "df", importToken: "token" },
        });
        expect(chooseSyncSource(noLxns)).toBe("divingFishImportToken");

        const noImportToken = createUser({
            inGame: { id: 12345678, enabled: false },
            lxns: undefined,
            divingFish: { name: "df", importToken: null },
        });
        expect(chooseSyncSource(noImportToken)).toBe("divingFishName");
    });
});

describe("existingScoresForSync", () => {
    it("returns user.data.detailed when detailed is present", () => {
        const rec = createRecord();
        const detailed: DetailedData = { "10001-3": rec };
        const user = createUser({ data: { name: "u", rating: 1000, updateTime: 1, detailed } });
        expect(existingScoresForSync(user)).toBe(detailed);
    });

    it("converts b50 when only b50 is present", () => {
        const recSd = createRecord({ song_id: 10, level_index: 2, type: "SD" });
        const recDx = createRecord({ song_id: 20, level_index: 3, type: "DX" });
        const b50: DivingFishB50 = { sd: [recSd], dx: [recDx] };
        const user = createUser({
            data: { name: "u", rating: 1000, updateTime: 1, detailed: undefined, b50 },
        });
        expect(existingScoresForSync(user)).toEqual(convertDetailed([recSd, recDx]));
    });

    it("returns undefined when neither detailed nor b50 is present", () => {
        const user = createUser({
            data: { name: "u", rating: 1000, updateTime: 1, detailed: undefined, b50: undefined },
        });
        expect(existingScoresForSync(user)).toBeUndefined();
    });
});

describe("syncFromInGame", () => {
    const code64 = "1234567890123456789012345678901234567890123456789012345678901234";

    function createInGameResponse(overrides: Partial<UpdateUserResponse> = {}): UpdateUserResponse {
        return {
            userId: 12345678,
            userName: "ＴＥＳＴ",
            iconId: 101,
            rating: 15200,
            userMusicList: [],
            divingFishData: [createRecord({ song_id: 1, level_index: 3 })],
            b50: { dx: [createRecord({ song_id: 1, level_index: 3 })], sd: [] },
            isLogin: false,
            items: [],
            characters: [],
            info: {
                trophyId: 1,
                plateId: 2,
                partnerId: 3,
                frameId: 4,
                characterId: 5,
            } as unknown as UserInfo,
            ...overrides,
        };
    }

    it("returns null when qrCodeInput is invalid", async () => {
        const { clients, calls } = createMockClients();
        const { options, reports, uploadCalls } = createTestOptions(clients);
        const user = createUser();

        const result = await syncFromInGame(user, "short", options);

        expect(result).toBeNull();
        expect(reports).toEqual([
            ["正在从 InGame 获取用户信息：test-player", undefined],
            ["从 InGame 获取 test-player 信息失败，二维码无效", undefined],
        ]);
        expect(calls).toEqual([]);
        expect(uploadCalls.uploadToDivingFish).toEqual([]);
        expect(uploadCalls.uploadToLXNS).toEqual([]);
    });

    it("returns null when no QR code and no inGame.id", async () => {
        const { clients, calls } = createMockClients();
        const { options, reports } = createTestOptions(clients);
        const user = createUser({ inGame: { id: null, enabled: true } });

        const result = await syncFromInGame(user, undefined, options);

        expect(result).toBeNull();
        expect(reports).toEqual([
            ["正在从 InGame 获取用户信息：test-player", undefined],
            ["从 InGame 获取 test-player 信息失败，二维码无效", undefined],
        ]);
        expect(calls).toEqual([]);
    });

    it("performs full update with a QR code (request includes qrCode, no supplement calls)", async () => {
        const apiResponse = createInGameResponse();
        const { clients, calls } = createMockClients({
            postGameAPIJSON: async <T>() => apiResponse as unknown as T,
        });
        const { options, reports, uploadCalls } = createTestOptions(clients);
        const user = createUser({
            divingFish: { name: "df", importToken: "df-token" },
            lxns: {
                auth: { accessToken: "lx-token" } as unknown as LXNSAuth,
                name: "lx",
                id: 1,
            },
        });

        const result = await syncFromInGame(user, code64, options);

        expect(calls).toEqual([
            {
                method: "postGameAPIJSON",
                args: [
                    SaltAPIEndpoints.UpdateUser,
                    { userId: 12345678, importToken: "", qrCode: code64 },
                ],
            },
        ]);
        expect(uploadCalls.uploadToDivingFish).toEqual([[apiResponse.divingFishData, "df-token"]]);
        expect(uploadCalls.uploadToLXNS).toEqual([[apiResponse.divingFishData, user]]);
        expect(reports).toEqual([
            ["正在从 InGame 获取用户信息：test-player", undefined],
            ["从 InGame 获取用户信息成功：test-player", undefined],
            ["正在上传 test-player 的数据到水鱼", undefined],
            ["正在同步 test-player 的数据到落雪", undefined],
        ]);
        expect(result).toEqual({
            userId: 12345678,
            rating: 15200,
            name: "TEST",
            b50: {
                dx: [createRecord({ song_id: 1, level_index: 3, lastChangedAt: 1_000_000 })],
                sd: [],
            },
            detailed: convertDetailed([
                createRecord({ song_id: 1, level_index: 3, lastChangedAt: 1_000_000 }),
            ]),
            updateTime: 1_000_000,
            items: [],
            characters: [],
            info: apiResponse.info,
            scoreHistorySource: "inGame",
        });
    });

    it("performs fast update without QR code (no qrCode key in body, supplements from LXNS first)", async () => {
        const apiResponse = createInGameResponse({
            divingFishData: [createRecord({ song_id: 1, level_index: 3, play_count: undefined })],
            b50: {
                dx: [createRecord({ song_id: 1, level_index: 3, play_count: undefined })],
                sd: [],
            },
        });
        const supRecord = createRecord({ song_id: 1, level_index: 3, play_count: 99 });
        const { clients, calls } = createMockClients({
            postGameAPIJSON: async <T>() => apiResponse as unknown as T,
            fetchLXNSScore: async () => ({
                name: "lxns",
                rating: 15000,
                scores: convertDetailed([supRecord]),
                b50: { dx: [], sd: [] },
                updateTime: 900_000,
            }),
        });
        const { options, reports } = createTestOptions(clients, {
            uploadToDivingFish: undefined,
            uploadToLXNS: undefined,
        });
        const user = createUser({
            divingFish: { name: "df", importToken: "df-token" },
            lxns: {
                auth: { accessToken: "lx-token" } as unknown as LXNSAuth,
                name: "lx",
                id: 1,
            },
        });

        const result = await syncFromInGame(user, undefined, options);

        expect(calls[0]).toEqual({
            method: "postGameAPIJSON",
            args: [SaltAPIEndpoints.UpdateUser, { userId: 12345678, importToken: "" }],
        });
        expect(calls[0].args[1]).not.toHaveProperty("qrCode");
        expect(Object.keys(calls[0].args[1] as object)).not.toContain("qrCode");
        expect((calls[0].args[1] as { qrCode?: string }).qrCode).toBeUndefined();
        expect(calls[1]).toEqual({ method: "fetchLXNSScore", args: [user] });
        // DF supplement was NOT called because LXNS succeeded with scores
        expect(calls.filter(c => c.method === "fetchDivingFishRecords")).toHaveLength(0);

        expect(reports).toEqual([
            ["正在从 InGame 获取用户信息：test-player", undefined],
            ["从 InGame 获取用户信息成功：test-player", undefined],
            ["正在从落雪补充 test-player 的数据", undefined],
            ["从落雪补充数据成功", undefined],
        ]);
        expect(result?.detailed?.["10001-3"].play_count).toBe(99);
        expect(result?.b50.dx[0].play_count).toBe(99);
    });

    it("does not report LXNS supplement success and keeps in-game data when LXNS provides no scores", async () => {
        const apiResponse = createInGameResponse({
            divingFishData: [createRecord({ song_id: 1, level_index: 3, play_count: undefined })],
            b50: {
                dx: [createRecord({ song_id: 1, level_index: 3, play_count: undefined })],
                sd: [],
            },
        });
        const { clients, calls } = createMockClients({
            postGameAPIJSON: async <T>() => apiResponse as unknown as T,
            fetchLXNSScore: async () => ({}) as unknown as LXNSScoreData,
        });
        const { options, reports } = createTestOptions(clients, {
            uploadToDivingFish: undefined,
            uploadToLXNS: undefined,
        });
        const user = createUser({
            divingFish: { name: "df", importToken: null },
            lxns: {
                auth: { accessToken: "lx-token" } as unknown as LXNSAuth,
                name: "lx",
                id: 1,
            },
        });

        const result = await syncFromInGame(user, undefined, options);

        expect(calls[0]).toEqual({
            method: "postGameAPIJSON",
            args: [SaltAPIEndpoints.UpdateUser, { userId: 12345678, importToken: "" }],
        });
        expect(calls[1]).toEqual({ method: "fetchLXNSScore", args: [user] });
        expect(reports.map(([msg]) => msg)).not.toContain("从落雪补充数据成功");
        expect(reports).toEqual([
            ["正在从 InGame 获取用户信息：test-player", undefined],
            ["从 InGame 获取用户信息成功：test-player", undefined],
            ["正在从落雪补充 test-player 的数据", undefined],
        ]);
        expect(result).toEqual({
            userId: 12345678,
            rating: 15200,
            name: "TEST",
            b50: {
                dx: [
                    createRecord({
                        song_id: 1,
                        level_index: 3,
                        play_count: undefined,
                        lastChangedAt: 1_000_000,
                    }),
                ],
                sd: [],
            },
            detailed: convertDetailed([
                createRecord({
                    song_id: 1,
                    level_index: 3,
                    play_count: undefined,
                    lastChangedAt: 1_000_000,
                }),
            ]),
            updateTime: 1_000_000,
            items: [],
            characters: [],
            info: apiResponse.info,
            scoreHistorySource: "inGame",
        });
    });

    it("falls back to Diving Fish supplement when LXNS supplement fails", async () => {
        const apiResponse = createInGameResponse({
            divingFishData: [createRecord({ song_id: 1, level_index: 3, fc: "" as ComboStatus })],
            b50: {
                dx: [createRecord({ song_id: 1, level_index: 3, fc: "" as ComboStatus })],
                sd: [],
            },
        });
        const supRecord = createRecord({ song_id: 1, level_index: 3, fc: ComboStatus.AllPerfect });
        const customErr = new CustomError("LXNS down");
        const { clients, calls } = createMockClients({
            postGameAPIJSON: async <T>() => apiResponse as unknown as T,
            fetchLXNSScore: async () => {
                throw customErr;
            },
            fetchDivingFishRecords: async () => ({
                additional_rating: 0,
                nickname: "df",
                plate: null,
                rating: 15000,
                records: [supRecord],
                username: "u",
            }),
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser({
            divingFish: { name: "df", importToken: "df-token" },
            lxns: {
                auth: { accessToken: "lx-token" } as unknown as LXNSAuth,
                name: "lx",
                id: 1,
            },
        });

        const result = await syncFromInGame(user, undefined, options);

        expect(calls.map(c => c.method)).toEqual([
            "postGameAPIJSON",
            "fetchLXNSScore",
            "fetchDivingFishRecords",
        ]);
        expect(reports).toContainEqual([
            "从落雪补充数据失败：CustomError[LXNS down]",
            "CustomError[LXNS down]",
        ]);
        expect(reports).toContainEqual(["从水鱼补充数据成功", undefined]);
        expect(result?.detailed?.["10001-3"].fc).toBe(ComboStatus.AllPerfect);
        expect(result?.b50.dx[0].fc).toBe(ComboStatus.AllPerfect);
    });

    it("reports failure when Diving Fish supplement also fails", async () => {
        const apiResponse = createInGameResponse();
        const customErr = new CustomError("DF down");
        const { clients } = createMockClients({
            postGameAPIJSON: async <T>() => apiResponse as unknown as T,
            fetchDivingFishRecords: async () => {
                throw customErr;
            },
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser({
            divingFish: { name: "df", importToken: "df-token" },
            lxns: undefined,
        });

        const result = await syncFromInGame(user, undefined, options);

        expect(reports).toContainEqual([
            "从水鱼补充数据失败：CustomError[DF down]",
            "CustomError[DF down]",
        ]);
        expect(result).not.toBeNull();
    });

    it("returns null when game request returns null data", async () => {
        const { clients } = createMockClients({
            postGameAPIJSON: async <T>() => null as unknown as T,
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser();

        const result = await syncFromInGame(user, code64, options);

        expect(result).toBeNull();
        expect(reports).toEqual([
            ["正在从 InGame 获取用户信息：test-player", undefined],
            ["从 InGame 获取 test-player 信息失败", undefined],
        ]);
    });

    it("rejects when game request rejects", async () => {
        const networkErr = new Error("Network timeout");
        const { clients } = createMockClients({
            postGameAPIJSON: async () => {
                throw networkErr;
            },
        });
        const { options } = createTestOptions(clients);
        const user = createUser();

        await expect(syncFromInGame(user, code64, options)).rejects.toThrow("Network timeout");
    });

    it("converts name to half-width, defaults items and characters to [], and falls back to user.inGame.id", async () => {
        const apiResponse = createInGameResponse({
            userId: 0,
            userName: "ＡＢＣ　１２３",
            items: undefined,
            characters: undefined,
        });
        const { clients } = createMockClients({
            postGameAPIJSON: async <T>() => apiResponse as unknown as T,
        });
        const { options } = createTestOptions(clients);
        const user = createUser({ inGame: { id: 87654321, enabled: true } });

        const result = await syncFromInGame(user, code64, options);

        expect(result?.userId).toBe(87654321);
        expect(result?.name).toBe("ABC 123");
        expect(result?.items).toEqual([]);
        expect(result?.characters).toEqual([]);
    });

    it("passes through items and characters from the game response", async () => {
        const madeUpItems: UserItem[][] = [
            [
                {
                    itemKind: CollectionKind.Plate,
                    itemId: 101,
                    stock: 1,
                    isValid: true,
                },
            ],
            [
                {
                    itemKind: CollectionKind.Title,
                    itemId: 202,
                    stock: 1,
                    isValid: true,
                },
            ],
        ];
        const madeUpCharacters: UserCharacter[] = [
            {
                characterId: 1,
                point: 100,
                useCount: 10,
                level: 5,
                nextAwake: 50,
                nextAwakePercent: 20,
                awakening: 1,
            },
        ];
        const apiResponse = createInGameResponse({
            items: madeUpItems,
            characters: madeUpCharacters,
        });
        const { clients } = createMockClients({
            postGameAPIJSON: async <T>() => apiResponse as unknown as T,
        });
        const { options } = createTestOptions(clients);
        const user = createUser();

        const result = await syncFromInGame(user, code64, options);

        expect(result?.items).toEqual(madeUpItems);
        expect(result?.characters).toEqual(madeUpCharacters);
    });

    it("does not call uploads when callbacks are not provided or user lacks tokens", async () => {
        const apiResponse = createInGameResponse();
        const { clients } = createMockClients({
            postGameAPIJSON: async <T>() => apiResponse as unknown as T,
        });
        // User without import token and without lxns token
        const userNoTokens = createUser({
            divingFish: { name: "df", importToken: null },
            lxns: undefined,
        });
        const { options, reports, uploadCalls } = createTestOptions(clients);

        await syncFromInGame(userNoTokens, code64, options);

        expect(uploadCalls.uploadToDivingFish).toEqual([]);
        expect(uploadCalls.uploadToLXNS).toEqual([]);
        expect(reports).toEqual([
            ["正在从 InGame 获取用户信息：test-player", undefined],
            ["从 InGame 获取用户信息成功：test-player", undefined],
        ]);
    });
});

describe("syncFromLXNS", () => {
    it("returns SyncUpdate on success", async () => {
        const lxnsData: LXNSScoreData = {
            name: "LXNS Name",
            rating: 15300,
            scores: convertDetailed([createRecord({ song_id: 2, level_index: 3 })]),
            b50: { dx: [createRecord({ song_id: 2, level_index: 3 })], sd: [] },
            updateTime: 888_000,
        };
        const { clients, calls } = createMockClients({
            fetchLXNSScore: async () => lxnsData,
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser({
            lxns: {
                auth: { accessToken: "tok" } as unknown as LXNSAuth,
                name: "lx",
                id: 1,
            },
        });

        const result = await syncFromLXNS(user, options);

        expect(calls).toEqual([{ method: "fetchLXNSScore", args: [user] }]);
        expect(reports).toEqual([
            ["正在从落雪获取用户信息：test-player", undefined],
            ["从落雪获取用户信息成功：test-player", undefined],
        ]);
        expect(result).toEqual({
            rating: 15300,
            name: "LXNS Name",
            b50: {
                dx: [createRecord({ song_id: 2, level_index: 3, lastChangedAt: 888_000 })],
                sd: [],
            },
            detailed: convertDetailed([
                createRecord({ song_id: 2, level_index: 3, lastChangedAt: 888_000 }),
            ]),
            updateTime: 888_000,
            lxns: user.lxns,
            scoreHistorySource: "lxns",
        });
    });

    it("returns null on failure with exact error report using toString", async () => {
        const err = new CustomError("LXNS Auth Failed");
        const { clients } = createMockClients({
            fetchLXNSScore: async () => {
                throw err;
            },
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser();

        const result = await syncFromLXNS(user, options);

        expect(result).toBeNull();
        expect(reports).toEqual([
            ["正在从落雪获取用户信息：test-player", undefined],
            [
                "从落雪获取 test-player 信息失败：CustomError[LXNS Auth Failed]",
                "CustomError[LXNS Auth Failed]",
            ],
        ]);
    });
});

describe("syncFromDivingFishImportToken", () => {
    it("returns SyncUpdate on success", async () => {
        const rec = createRecord({ song_id: 3, level_index: 2 });
        const recordsData: DivingFishRecordsResponse = {
            additional_rating: 12,
            nickname: "ＤＦ　ＮＩＣＫ",
            plate: null,
            rating: 15400,
            records: [rec],
            username: "dfuser",
        };
        const b50Data: DivingFishB50 = { dx: [rec], sd: [] };
        const { clients, calls } = createMockClients({
            fetchDivingFishRecords: async () => recordsData,
            calculateB50FromRecords: async () => b50Data,
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser({
            divingFish: { name: "df", importToken: "valid-import-token" },
        });

        const result = await syncFromDivingFishImportToken(user, options);

        expect(calls).toEqual([
            { method: "fetchDivingFishRecords", args: ["valid-import-token"] },
            { method: "calculateB50FromRecords", args: [[rec]] },
        ]);
        expect(reports).toEqual([
            ["正在从水鱼获取用户信息（Import-Token）：test-player", undefined],
            ["从水鱼获取用户信息成功：test-player", undefined],
        ]);
        expect(result).toEqual({
            rating: 15400,
            name: "DF NICK",
            b50: {
                dx: [createRecord({ song_id: 3, level_index: 2, lastChangedAt: 1_000_000 })],
                sd: [],
            },
            detailed: convertDetailed([
                createRecord({ song_id: 3, level_index: 2, lastChangedAt: 1_000_000 }),
            ]),
            updateTime: 1_000_000,
            scoreHistorySource: "divingFishImport",
        });
    });

    it("returns null on failure with exact error report using toString", async () => {
        const err = new CustomError("Invalid import token");
        const { clients } = createMockClients({
            fetchDivingFishRecords: async () => {
                throw err;
            },
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser({ divingFish: { name: "df", importToken: "bad-token" } });

        const result = await syncFromDivingFishImportToken(user, options);

        expect(result).toBeNull();
        expect(reports).toEqual([
            ["正在从水鱼获取用户信息（Import-Token）：test-player", undefined],
            [
                "从水鱼获取用户信息失败：CustomError[Invalid import token]",
                "CustomError[Invalid import token]",
            ],
        ]);
    });
});

describe("syncFromDivingFishName", () => {
    function createDFLikeInGameResponse(): UpdateUserResponse {
        return {
            userId: 0,
            userName: "ＤＦ　ＵＳＥＲ",
            iconId: 1,
            rating: 15100,
            userMusicList: [],
            divingFishData: [createRecord({ song_id: 5, level_index: 3 })],
            b50: { dx: [createRecord({ song_id: 5, level_index: 3 })], sd: [] },
            isLogin: false,
            items: [],
            characters: [],
            info: {} as unknown as UserInfo,
        };
    }

    it("returns SyncUpdate on game API success", async () => {
        const apiResponse = createDFLikeInGameResponse();
        const { clients, calls } = createMockClients({
            postGameAPIJSON: async <T>() => apiResponse as unknown as T,
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser({ divingFish: { name: "df-target", importToken: null } });

        const result = await syncFromDivingFishName(user, options);

        expect(calls).toEqual([
            {
                method: "postGameAPIJSON",
                args: [SaltAPIEndpoints.UpdateUserFromDivingFish, { userName: "df-target" }],
            },
        ]);
        expect(reports).toEqual([
            ["正在从水鱼获取用户详细信息：test-player", undefined],
            ["从水鱼获取用户详细信息成功：test-player", undefined],
        ]);
        expect(result).toEqual({
            rating: 15100,
            name: "DF USER",
            b50: {
                dx: [createRecord({ song_id: 5, level_index: 3, lastChangedAt: 1_000_000 })],
                sd: [],
            },
            detailed: convertDetailed([
                createRecord({ song_id: 5, level_index: 3, lastChangedAt: 1_000_000 }),
            ]),
            updateTime: 1_000_000,
            scoreHistorySource: "divingFishPublic",
        });
    });

    it("falls back to syncFromDivingFishPublic when game API fails with report", async () => {
        const err = new CustomError("DF InGame Proxy Error");
        const pubData: DivingFishResponse = {
            username: "df-target",
            nickname: "DF Public Nick",
            plate: null,
            additional_rating: 10,
            rating: 14900,
            charts: { dx: [createRecord({ song_id: 6, level_index: 3 })], sd: [] },
        };
        const { clients, calls } = createMockClients({
            postGameAPIJSON: async () => {
                throw err;
            },
            fetchDivingFishPlayer: async () => pubData,
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser({ divingFish: { name: "df-target", importToken: null } });

        const result = await syncFromDivingFishName(user, options);

        expect(calls).toEqual([
            {
                method: "postGameAPIJSON",
                args: [SaltAPIEndpoints.UpdateUserFromDivingFish, { userName: "df-target" }],
            },
            { method: "fetchDivingFishPlayer", args: ["df-target"] },
        ]);
        expect(reports).toEqual([
            ["正在从水鱼获取用户详细信息：test-player", undefined],
            [
                "获取 InGame 数据失败：CustomError[DF InGame Proxy Error]",
                "CustomError[DF InGame Proxy Error]",
            ],
            ["正在从水鱼获取用户信息：df-target", undefined],
            ["从水鱼获取用户信息成功：df-target", undefined],
        ]);
        expect(result).toEqual({
            rating: 14900,
            b50: {
                dx: [createRecord({ song_id: 6, level_index: 3, lastChangedAt: 1_000_000 })],
                sd: [],
            },
            updateTime: 1_000_000,
            name: "DF Public Nick",
            scoreHistorySource: "divingFishPublic",
        });
    });

    it("falls back to syncFromDivingFishPublic without failure report when game API returns null", async () => {
        const pubData: DivingFishResponse = {
            username: "df-target",
            nickname: "DF Public Nick",
            plate: null,
            additional_rating: 10,
            rating: 14900,
            charts: { dx: [], sd: [] },
        };
        const { clients, calls } = createMockClients({
            postGameAPIJSON: async <T>() => null as unknown as T,
            fetchDivingFishPlayer: async () => pubData,
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser({ divingFish: { name: "df-target", importToken: null } });

        const result = await syncFromDivingFishName(user, options);

        expect(calls).toEqual([
            {
                method: "postGameAPIJSON",
                args: [SaltAPIEndpoints.UpdateUserFromDivingFish, { userName: "df-target" }],
            },
            { method: "fetchDivingFishPlayer", args: ["df-target"] },
        ]);
        expect(reports).toEqual([
            ["正在从水鱼获取用户详细信息：test-player", undefined],
            ["正在从水鱼获取用户信息：df-target", undefined],
            ["从水鱼获取用户信息成功：df-target", undefined],
        ]);
        expect(result).toEqual({
            rating: 14900,
            b50: { dx: [], sd: [] },
            updateTime: 1_000_000,
            name: "DF Public Nick",
            scoreHistorySource: "divingFishPublic",
        });
    });
});

describe("syncFromDivingFishPublic", () => {
    it("returns SyncUpdate on success", async () => {
        const pubData: DivingFishResponse = {
            username: "df-target",
            nickname: "DF Public Nick",
            plate: null,
            additional_rating: 10,
            rating: 14950,
            charts: { dx: [createRecord({ song_id: 7, level_index: 3 })], sd: [] },
        };
        const { clients, calls } = createMockClients({
            fetchDivingFishPlayer: async () => pubData,
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser({ divingFish: { name: "df-target", importToken: null } });

        const result = await syncFromDivingFishPublic(user, options);

        expect(calls).toEqual([{ method: "fetchDivingFishPlayer", args: ["df-target"] }]);
        expect(reports).toEqual([
            ["正在从水鱼获取用户信息：df-target", undefined],
            ["从水鱼获取用户信息成功：df-target", undefined],
        ]);
        expect(result).toEqual({
            rating: 14950,
            b50: {
                dx: [createRecord({ song_id: 7, level_index: 3, lastChangedAt: 1_000_000 })],
                sd: [],
            },
            updateTime: 1_000_000,
            name: "DF Public Nick",
            scoreHistorySource: "divingFishPublic",
        });
    });

    it("resolves to undefined on failure with report using toString", async () => {
        const err = new CustomError("DF 404 User Not Found");
        const { clients } = createMockClients({
            fetchDivingFishPlayer: async () => {
                throw err;
            },
        });
        const { options, reports } = createTestOptions(clients);
        const user = createUser({ divingFish: { name: "df-unknown", importToken: null } });

        const result = await syncFromDivingFishPublic(user, options);

        expect(result).toBeUndefined();
        expect(reports).toEqual([
            ["正在从水鱼获取用户信息：df-unknown", undefined],
            [
                "从水鱼获取 df-unknown 信息失败：CustomError[DF 404 User Not Found]",
                "CustomError[DF 404 User Not Found]",
            ],
        ]);
    });
});
