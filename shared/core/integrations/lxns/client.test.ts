import type { FetchLike } from "../../http";
import type { DivingFishFullRecord } from "../diving-fish/type";
import type { LXNSScore } from "./type";
import { describe, expect, it } from "vitest";
import { ComboStatus, RankRate, SyncStatus } from "../../mai/types";
import {
    convertLXNSScore,
    convertToLXNSUploadScore,
    LXNSPlayerApiError,
    requestLXNSPlayerApi,
} from "./client";

describe("requestLXNSPlayerApi", () => {
    function jsonResponse(body: unknown, status = 200) {
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
            text: async () => JSON.stringify(body),
        };
    }

    it("requests default player endpoint with authorization header placed after caller headers", async () => {
        const calls: { url: string; init?: Parameters<FetchLike>[1] }[] = [];
        const mockFetch: FetchLike = async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({
                success: true,
                code: 200,
                data: { name: "player1", rating: 15000 },
            });
        };

        const auth = { accessToken: "tok-12345", tokenType: "Bearer" };
        const result = await requestLXNSPlayerApi<{ name: string; rating: number }>(
            auth,
            undefined,
            {
                method: "GET",
                headers: { "X-Custom": "custom-val", Accept: "application/json" },
            },
            { fetch: mockFetch }
        );

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://maimai.lxns.net/api/v0/user/maimai/player");
        expect(calls[0].init?.method).toBe("GET");

        // Verify header placement: Authorization is after caller headers
        const headerKeys = Object.keys(calls[0].init?.headers ?? {});
        expect(headerKeys).toEqual(["X-Custom", "Accept", "Authorization"]);
        expect(calls[0].init?.headers?.Authorization).toBe("Bearer tok-12345");
        expect(result).toEqual({ name: "player1", rating: 15000 });
    });

    it("appends sub-endpoint and uses custom base URL", async () => {
        const calls: { url: string; init?: Parameters<FetchLike>[1] }[] = [];
        const mockFetch: FetchLike = async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({
                success: true,
                code: 200,
                data: [{ id: 1 }],
            });
        };

        const auth = { accessToken: "tok-abc", tokenType: "Bearer" };
        const result = await requestLXNSPlayerApi<{ id: number }[]>(
            auth,
            "scores",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scores: [] }),
            },
            {
                config: { lxnsBaseUrl: "https://mirror.lxns.example.com///" },
                fetch: mockFetch,
            }
        );

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(
            "https://mirror.lxns.example.com/api/v0/user/maimai/player/scores"
        );
        expect(calls[0].init?.method).toBe("POST");
        expect(calls[0].init?.body).toBe(JSON.stringify({ scores: [] }));
        expect(result).toEqual([{ id: 1 }]);
    });

    it("throws LXNSPlayerApiError on HTTP error status", async () => {
        const calls: { url: string }[] = [];
        const mockFetch: FetchLike = async url => {
            calls.push({ url });
            return jsonResponse({ message: "Internal Error" }, 500);
        };

        const auth = { accessToken: "tok-err", tokenType: "Bearer" };
        const error = await requestLXNSPlayerApi(auth, "scores", undefined, {
            fetch: mockFetch,
        }).catch(err => err);

        expect(calls).toHaveLength(1);
        expect(error).toBeInstanceOf(LXNSPlayerApiError);
        expect((error as LXNSPlayerApiError).status).toBe(500);
        expect((error as LXNSPlayerApiError).message).toBe("LXNS API request failed (HTTP 500)");
        expect(String(error)).not.toContain("tok-err");
    });

    it("throws LXNSPlayerApiError when response has success: false", async () => {
        const calls: { url: string }[] = [];
        const mockFetch: FetchLike = async url => {
            calls.push({ url });
            return jsonResponse({ success: false, code: 400 }, 200);
        };

        const auth = { accessToken: "tok-fail", tokenType: "Bearer" };
        const error = await requestLXNSPlayerApi(auth, undefined, undefined, {
            fetch: mockFetch,
        }).catch(err => err);

        expect(calls).toHaveLength(1);
        expect(error).toBeInstanceOf(LXNSPlayerApiError);
        expect((error as LXNSPlayerApiError).status).toBe(200);
        expect((error as LXNSPlayerApiError).message).toBe("LXNS API request failed (HTTP 200)");
        expect(String(error)).not.toContain("tok-fail");
    });

    it("throws unless success is truthy, as the web app did", async () => {
        for (const body of [{ data: [] }, { success: 0, data: [] }, { success: null }, null]) {
            const error = await requestLXNSPlayerApi(
                { accessToken: "tok", tokenType: "Bearer" },
                undefined,
                undefined,
                { fetch: async () => jsonResponse(body, 200) }
            ).catch(err => err);

            expect(error).toBeInstanceOf(LXNSPlayerApiError);
        }
    });

    it("writes the endpoint as given, as the web app did", async () => {
        const urls: string[] = [];
        const result = await requestLXNSPlayerApi(
            { accessToken: "tok", tokenType: "Bearer" },
            "/scores",
            undefined,
            {
                fetch: async url => {
                    urls.push(url);
                    return jsonResponse({ success: 1, data: "kept" });
                },
            }
        );

        expect(urls).toEqual(["https://maimai.lxns.net/api/v0/user/maimai/player//scores"]);
        expect(result).toBe("kept");
    });

    it("throws SyntaxError when response body is not JSON", async () => {
        const calls: { url: string }[] = [];
        const mockFetch: FetchLike = async url => {
            calls.push({ url });
            return {
                ok: true,
                status: 200,
                json: async () => {
                    throw new SyntaxError("Unexpected token < in JSON at position 0");
                },
                text: async () => "<html>504 Gateway Timeout</html>",
            };
        };

        const auth = { accessToken: "tok-html", tokenType: "Bearer" };
        await expect(
            requestLXNSPlayerApi(auth, undefined, undefined, { fetch: mockFetch })
        ).rejects.toBeInstanceOf(SyntaxError);

        expect(calls).toHaveLength(1);
    });

    it("passes through network fetch rejection", async () => {
        const calls: { url: string }[] = [];
        const networkError = new Error("Connection refused");
        const mockFetch: FetchLike = async url => {
            calls.push({ url });
            throw networkError;
        };

        const auth = { accessToken: "tok-conn", tokenType: "Bearer" };
        await expect(
            requestLXNSPlayerApi(auth, undefined, undefined, { fetch: mockFetch })
        ).rejects.toBe(networkError);

        expect(calls).toHaveLength(1);
    });
});

describe("convertLXNSScore", () => {
    it("converts a standard score with full fields", () => {
        const lxScore: LXNSScore = {
            id: 850,
            song_name: "Garakuta Doll Play",
            level: "14",
            level_index: 3,
            type: "standard",
            achievements: 100.4567,
            dx_rating: 298.8,
            rate: RankRate.sssp,
            dx_score: 2450,
            dx_star: 3,
            fc: ComboStatus.FullCombo,
            fs: SyncStatus.FullSyncDX,
            upload_time: "2024-01-01 12:00:00",
        };

        const result = convertLXNSScore(lxScore);

        expect(result).toEqual({
            song_id: 850,
            level_index: 3,
            level: "14",
            level_label: "143",
            type: "SD",
            dxScore: 2450,
            ds: 0,
            fc: ComboStatus.FullCombo,
            fs: SyncStatus.FullSyncDX,
            achievements: 100.4567,
            ra: 298,
            rate: RankRate.sssp,
            title: "Garakuta Doll Play",
        });
    });

    it("converts a DX score and offsets the song_id by 10000", () => {
        const lxScore: LXNSScore = {
            id: 233,
            song_name: "Yurushite",
            level: "13+",
            level_index: 2,
            type: "dx",
            achievements: 99.5,
            dx_rating: 260.1,
            rate: RankRate.ss,
            dx_score: 1800,
            dx_star: 2,
            fc: null,
            fs: null,
            upload_time: "2024-01-02 12:00:00",
        };

        const result = convertLXNSScore(lxScore);

        expect(result.song_id).toBe(10233);
        expect(result.type).toBe("DX");
        expect(result.level_label).toBe("13+2");
        expect(result.ra).toBe(260);
        expect(result.fc).toBe(ComboStatus.None);
        expect(result.fs).toBe(SyncStatus.None);
    });

    it("falls back to ComboStatus.None and SyncStatus.None when fc/fs are null", () => {
        const lxScore: LXNSScore = {
            id: 1,
            song_name: "Track",
            level: "10",
            level_index: 0,
            type: "standard",
            achievements: 90,
            dx_rating: 100,
            rate: RankRate.a,
            dx_score: 1000,
            dx_star: 1,
            fc: null,
            fs: null,
            upload_time: "2024-01-03 12:00:00",
        };

        const result = convertLXNSScore(lxScore);
        expect(result.fc).toBe(ComboStatus.None);
        expect(result.fs).toBe(SyncStatus.None);
    });
});

describe("convertToLXNSUploadScore", () => {
    it("converts a standard record with level_index and preserved fc/fs", () => {
        const record: DivingFishFullRecord = {
            song_id: 500,
            level: "12",
            level_index: 3,
            level_label: "123",
            type: "SD",
            achievements: 100.1,
            dxScore: 1950,
            ds: 12.4,
            fc: ComboStatus.AllPerfect,
            fs: SyncStatus.Sync,
            ra: 220,
            rate: RankRate.sss,
            title: "Standard Song",
        };

        const result = convertToLXNSUploadScore(record);

        expect(result).toEqual({
            id: 500,
            type: "standard",
            level_index: 3,
            achievements: 100.1,
            fc: ComboStatus.AllPerfect,
            fs: SyncStatus.Sync,
            dx_score: 1950,
        });
    });

    it("converts a DX record (song_id between 10001 and 99999) and restores raw id", () => {
        const record: DivingFishFullRecord = {
            song_id: 10450,
            level: "13",
            level_index: 2,
            level_label: "132",
            type: "DX",
            achievements: 98.5,
            dxScore: 1600,
            ds: 13.0,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            ra: 240,
            rate: RankRate.s,
            title: "DX Song",
        };

        const result = convertToLXNSUploadScore(record);

        expect(result).toEqual({
            id: 450,
            type: "dx",
            level_index: 2,
            achievements: 98.5,
            fc: null,
            fs: null,
            dx_score: 1600,
        });
    });

    it("converts an utage record (song_id > 100000) with type utage and level_index 0", () => {
        const record: DivingFishFullRecord = {
            song_id: 100500,
            level: "14?",
            level_index: 4,
            level_label: "14?4",
            type: "SD",
            achievements: 95.0,
            dxScore: 3000,
            ds: 0,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            ra: 0,
            rate: RankRate.aaa,
            title: "Utage Song",
        };

        const result = convertToLXNSUploadScore(record);

        expect(result).toEqual({
            id: 100500,
            type: "utage",
            level_index: 0,
            achievements: 95.0,
            fc: null,
            fs: null,
            dx_score: 3000,
        });
    });

    it("maps null, empty string and undefined fc/fs to null", () => {
        const record: DivingFishFullRecord = {
            song_id: 100,
            level: "10",
            level_index: 1,
            level_label: "101",
            type: "SD",
            achievements: 80.0,
            dxScore: 800,
            ds: 10.0,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            ra: 100,
            rate: RankRate.b,
            title: "Song",
        };

        const result = convertToLXNSUploadScore(record);
        expect(result.fc).toBeNull();
        expect(result.fs).toBeNull();
    });
});
