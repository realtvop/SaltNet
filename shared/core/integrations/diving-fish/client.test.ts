import type { FetchInit, FetchLike, FetchResponse } from "../../http";
import type { SavedMusicList } from "../../music/type";
import type { DivingFishFullRecord } from "./type";
import { describe, expect, it, vi } from "vitest";
import {
    ChartType,
    ComboStatus,
    MusicGenre,
    MusicOrigin,
    RankRate,
    SyncStatus,
} from "../../mai/types";
import {
    buildDivingFishB50,
    DivingFishError,
    fetchDivingFishRecords,
    queryDivingFishPlayer,
    uploadDivingFishRecords,
} from "./client";

function makeFetch(
    responder: (url: string, init?: FetchInit) => Promise<FetchResponse> | FetchResponse
) {
    return vi.fn<FetchLike>(async (url, init) => responder(url, init));
}

function jsonResponse(body: unknown, status = 200, ok = true): FetchResponse {
    return {
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

function textResponse(text: string, status = 200, ok = true): FetchResponse {
    return {
        ok,
        status,
        json: async () => {
            throw new Error("not json");
        },
        text: async () => text,
    };
}

function makeRecord(
    partial: Partial<DivingFishFullRecord> & { song_id: number; ra: number }
): DivingFishFullRecord {
    const { song_id, ra, title, type, ...rest } = partial;
    return {
        achievements: 100,
        ds: 12,
        dxScore: 1000,
        fc: ComboStatus.FullCombo,
        fs: SyncStatus.FullSync,
        level: "12",
        level_index: 3,
        level_label: "Master",
        ra,
        rate: RankRate.sss,
        song_id,
        title: title ?? `Song ${song_id}`,
        type: type ?? "SD",
        ...rest,
    };
}

describe("divingFishError", () => {
    it("preserves message, status, and error name", () => {
        const error = new DivingFishError("user not exists", 404);
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(DivingFishError);
        expect(error.name).toBe("DivingFishError");
        expect(error.message).toBe("user not exists");
        expect(error.status).toBe(404);
    });
});

describe("queryDivingFishPlayer", () => {
    it("makes a POST request with default base, headers, and body", async () => {
        const calls: { url: string; init?: FetchInit }[] = [];
        const doFetch = makeFetch((url, init) => {
            calls.push({ url, init });
            return jsonResponse({
                username: "testuser",
                nickname: "tester",
                rating: 15000,
                charts: { dx: [], sd: [] },
            });
        });

        const result = await queryDivingFishPlayer("testuser", { fetch: doFetch });

        expect(doFetch).toHaveBeenCalledTimes(1);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://www.diving-fish.com/api/maimaidxprober/query/player");
        expect(calls[0].init?.method).toBe("POST");
        expect(calls[0].init?.headers).toEqual({ "Content-Type": "application/json" });
        expect(calls[0].init?.body).toBe(JSON.stringify({ username: "testuser", b50: "1" }));
        expect(result.username).toBe("testuser");
    });

    it("uses a custom divingFishBaseUrl and ignores trailing slashes", async () => {
        const calls: { url: string; init?: FetchInit }[] = [];
        const doFetch = makeFetch((url, init) => {
            calls.push({ url, init });
            return jsonResponse({ username: "testuser", charts: { dx: [], sd: [] } });
        });

        await queryDivingFishPlayer("testuser", {
            config: { divingFishBaseUrl: "https://custom.example.test/api/" },
            fetch: doFetch,
        });

        expect(doFetch).toHaveBeenCalledTimes(1);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://custom.example.test/api/query/player");
    });

    it("rejects with status 404 when user is not found", async () => {
        const doFetch = makeFetch(() => jsonResponse({ message: "not found" }, 404, false));

        const promise = queryDivingFishPlayer("missinguser", { fetch: doFetch });
        await expect(promise).rejects.toThrow("user not exists");
        await expect(promise).rejects.toMatchObject({ status: 404 });
    });

    it("rejects with response message for status 400", async () => {
        const doFetch = makeFetch(() => jsonResponse({ message: "user not found" }, 400, false));

        const promise = queryDivingFishPlayer("baduser", { fetch: doFetch });
        await expect(promise).rejects.toThrow("user not found");
        await expect(promise).rejects.toMatchObject({ status: 400 });
    });

    it("falls back to generic status message when error body is not JSON", async () => {
        const doFetch = makeFetch(() => textResponse("Forbidden", 403, false));

        const promise = queryDivingFishPlayer("forbiddenuser", { fetch: doFetch });
        await expect(promise).rejects.toThrow("Request failed with status code 403");
        await expect(promise).rejects.toMatchObject({ status: 403 });
    });

    it("falls back to generic status message when error body message is empty", async () => {
        const doFetch = makeFetch(() => jsonResponse({ message: "" }, 500, false));

        const promise = queryDivingFishPlayer("servererror", { fetch: doFetch });
        await expect(promise).rejects.toThrow("Request failed with status code 500");
        await expect(promise).rejects.toMatchObject({ status: 500 });
    });

    it("shows any truthy message as text, as the web app always did", async () => {
        const cases: [unknown, string][] = [
            [{ message: "  " }, "  "],
            [{ message: 123 }, "123"],
            [{ message: true }, "true"],
            [{ message: 0 }, "Request failed with status code 400"],
            [{ message: null }, "Request failed with status code 400"],
            [null, "Request failed with status code 400"],
            ["message", "Request failed with status code 400"],
            [["message"], "Request failed with status code 400"],
        ];
        for (const [body, expected] of cases) {
            const doFetch = makeFetch(() => jsonResponse(body, 400, false));
            const error = await queryDivingFishPlayer("any", { fetch: doFetch }).catch(
                (caught: unknown) => caught
            );
            expect(error).toBeInstanceOf(DivingFishError);
            expect((error as DivingFishError).message).toBe(expected);
        }
    });

    it("propagates a network error unchanged", async () => {
        const networkError = new TypeError("Failed to fetch");
        const doFetch = makeFetch(() => {
            throw networkError;
        });

        await expect(queryDivingFishPlayer("any", { fetch: doFetch })).rejects.toBe(networkError);
    });

    it("propagates a fetch rejection unchanged even if the error message contains a token", async () => {
        const token = "fake-import-token-0123456789";
        const networkError = new TypeError(`Network failure with token ${token}`);
        const doFetch = makeFetch(() => {
            throw networkError;
        });

        await expect(queryDivingFishPlayer("any", { fetch: doFetch })).rejects.toBe(networkError);
    });
});

describe("fetchDivingFishRecords", () => {
    it("makes a GET request with Import-Token header and no body", async () => {
        const calls: { url: string; init?: FetchInit }[] = [];
        const doFetch = makeFetch((url, init) => {
            calls.push({ url, init });
            return jsonResponse({
                additional_rating: 0,
                nickname: "tester",
                plate: null,
                rating: 15000,
                records: [],
                username: "testuser",
            });
        });

        const result = await fetchDivingFishRecords("fake-import-token", { fetch: doFetch });

        expect(doFetch).toHaveBeenCalledTimes(1);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://www.diving-fish.com/api/maimaidxprober/player/records");
        expect(calls[0].init?.method).toBe("GET");
        expect(calls[0].init?.headers).toEqual({ "Import-Token": "fake-import-token" });
        expect(calls[0].init?.body).toBeUndefined();
        expect(result.username).toBe("testuser");
    });

    it("uses custom divingFishBaseUrl", async () => {
        const calls: { url: string; init?: FetchInit }[] = [];
        const doFetch = makeFetch((url, init) => {
            calls.push({ url, init });
            return jsonResponse({ records: [] });
        });

        await fetchDivingFishRecords("fake-import-token", {
            config: { divingFishBaseUrl: "https://custom.example.test/api" },
            fetch: doFetch,
        });

        expect(doFetch).toHaveBeenCalledTimes(1);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://custom.example.test/api/player/records");
    });

    it("rejects with error message on failure", async () => {
        const doFetch = makeFetch(() => jsonResponse({ message: "invalid token" }, 401, false));

        const promise = fetchDivingFishRecords("fake-import-token", { fetch: doFetch });
        await expect(promise).rejects.toThrow("invalid token");
        await expect(promise).rejects.toMatchObject({ status: 401 });
    });

    it("rejects with status message when response message is missing", async () => {
        const doFetch = makeFetch(() => jsonResponse({}, 500, false));

        const promise = fetchDivingFishRecords("fake-import-token", { fetch: doFetch });
        await expect(promise).rejects.toThrow("Request failed with status code 500");
        await expect(promise).rejects.toMatchObject({ status: 500 });
    });

    it("does not leak the import token in any error message", async () => {
        const token = "fake-secret-import-token";
        const doFetchWithEcho = makeFetch(() =>
            jsonResponse({ message: `invalid token ${token}` }, 401, false)
        );
        const errorWithEcho = await fetchDivingFishRecords(token, {
            fetch: doFetchWithEcho,
        }).catch((err: unknown) => err);

        expect(errorWithEcho).toBeInstanceOf(DivingFishError);
        expect((errorWithEcho as DivingFishError).message).not.toContain(token);

        const doFetchGeneric = makeFetch(() => jsonResponse({}, 502, false));
        const errorGeneric = await fetchDivingFishRecords(token, {
            fetch: doFetchGeneric,
        }).catch((err: unknown) => err);
        expect((errorGeneric as DivingFishError).message).not.toContain(token);
    });

    it("replaces multiple occurrences of a long token and preserves the rest of the message", async () => {
        const token = "fake-secret-import-token-12345";
        const doFetch = makeFetch(() =>
            jsonResponse(
                { message: `token ${token} expired; please refresh ${token} immediately` },
                401,
                false
            )
        );

        await expect(fetchDivingFishRecords(token, { fetch: doFetch })).rejects.toThrow(
            "token [REDACTED] expired; please refresh [REDACTED] immediately"
        );
    });

    it("repeatedly redacts when replacement rebuilds the token", async () => {
        const token = "[REDACTED]Z";
        const doFetch = makeFetch(() => jsonResponse({ message: "[REDACTED]ZZ" }, 400, false));

        const promise = fetchDivingFishRecords(token, { fetch: doFetch });
        await expect(promise).rejects.toThrow("[REDACTED]");
        const error = (await promise.catch((err: unknown) => err)) as DivingFishError;
        expect(error.message).toBe("[REDACTED]");
        expect(error.message).not.toContain(token);
    });

    it("does not look for short tokens of 10 or fewer characters", async () => {
        const doFetchE = makeFetch(() =>
            jsonResponse({ message: "Server unavailable" }, 503, false)
        );
        await expect(fetchDivingFishRecords("e", { fetch: doFetchE })).rejects.toThrow(
            "Server unavailable"
        );

        const doFetch500 = makeFetch(() => jsonResponse({}, 500, false));
        await expect(fetchDivingFishRecords("500", { fetch: doFetch500 })).rejects.toThrow(
            "Request failed with status code 500"
        );

        const doFetchEmpty = makeFetch(() =>
            jsonResponse({ message: "Original error message" }, 400, false)
        );
        await expect(fetchDivingFishRecords("", { fetch: doFetchEmpty })).rejects.toThrow(
            "Original error message"
        );
    });

    it("redacts at the 11-character boundary but leaves 10-character tokens alone", async () => {
        const token10 = "0123456789";
        const doFetch10 = makeFetch(() =>
            jsonResponse({ message: `failed with token: ${token10}` }, 401, false)
        );
        await expect(fetchDivingFishRecords(token10, { fetch: doFetch10 })).rejects.toThrow(
            `failed with token: ${token10}`
        );

        const token11 = "0123456789A";
        const doFetch11 = makeFetch(() =>
            jsonResponse({ message: `failed with token: ${token11}` }, 401, false)
        );
        await expect(fetchDivingFishRecords(token11, { fetch: doFetch11 })).rejects.toThrow(
            "failed with token: [REDACTED]"
        );
    });

    it("leaves an unrelated message unchanged when a long token does not occur in it", async () => {
        const token = "fake-secret-import-token-12345";
        const doFetch = makeFetch(() =>
            jsonResponse({ message: "Internal server error occurred" }, 500, false)
        );
        await expect(fetchDivingFishRecords(token, { fetch: doFetch })).rejects.toThrow(
            "Internal server error occurred"
        );
    });

    it("propagates a fetch rejection unchanged even when its message contains the token", async () => {
        const token = "fake-import-token-0123456789";
        const networkError = new TypeError(`Failed to connect with token ${token}`);
        const doFetch = makeFetch(() => {
            throw networkError;
        });

        await expect(fetchDivingFishRecords(token, { fetch: doFetch })).rejects.toBe(networkError);
    });
});

describe("uploadDivingFishRecords", () => {
    it("makes a POST request with headers and serialized records", async () => {
        const calls: { url: string; init?: FetchInit }[] = [];
        const records = [makeRecord({ song_id: 101, ra: 250 })];
        const doFetch = makeFetch((url, init) => {
            calls.push({ url, init });
            return jsonResponse({ message: "success" });
        });

        const response = await uploadDivingFishRecords("fake-import-token", records, {
            fetch: doFetch,
        });

        expect(doFetch).toHaveBeenCalledTimes(1);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(
            "https://www.diving-fish.com/api/maimaidxprober/player/update_records"
        );
        expect(calls[0].init?.method).toBe("POST");
        expect(calls[0].init?.headers).toEqual({
            "Content-Type": "application/json",
            "Import-Token": "fake-import-token",
        });
        expect(calls[0].init?.body).toBe(JSON.stringify(records));
        expect(response.ok).toBe(true);
    });

    it("uses custom divingFishBaseUrl with trailing slash stripped", async () => {
        const calls: { url: string; init?: FetchInit }[] = [];
        const doFetch = makeFetch((url, init) => {
            calls.push({ url, init });
            return jsonResponse({});
        });

        await uploadDivingFishRecords("fake-import-token", [], {
            config: { divingFishBaseUrl: "https://custom.example.test/api/" },
            fetch: doFetch,
        });

        expect(doFetch).toHaveBeenCalledTimes(1);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://custom.example.test/api/player/update_records");
    });

    it("returns the response for both 200 and 500 without throwing", async () => {
        const doFetch200 = makeFetch(() => jsonResponse({ success: true }, 200, true));
        const res200 = await uploadDivingFishRecords("fake-token", [], { fetch: doFetch200 });
        expect(res200.status).toBe(200);

        const doFetch500 = makeFetch(() => jsonResponse({ message: "error" }, 500, false));
        const res500 = await uploadDivingFishRecords("fake-token", [], { fetch: doFetch500 });
        expect(res500.status).toBe(500);
        expect(res500.ok).toBe(false);
    });

    it("propagates network errors", async () => {
        const networkError = new TypeError("Network failed");
        const doFetch = makeFetch(() => {
            throw networkError;
        });

        await expect(uploadDivingFishRecords("fake-token", [], { fetch: doFetch })).rejects.toBe(
            networkError
        );
    });

    it("propagates a fetch rejection unchanged even when its message contains the token", async () => {
        const token = "fake-import-token-0123456789";
        const networkError = new TypeError(`Network disconnected while using ${token}`);
        const doFetch = makeFetch(() => {
            throw networkError;
        });

        await expect(uploadDivingFishRecords(token, [], { fetch: doFetch })).rejects.toBe(
            networkError
        );
    });
});

describe("buildDivingFishB50", () => {
    const mockMusicList: SavedMusicList["musicList"] = {
        10: {
            id: 10,
            info: {
                id: 10,
                title: "Old SD Song",
                artist: "Artist",
                genre: MusicGenre["流行&动漫"],
                bpm: 120,
                from: MusicOrigin.maimai,
                isNew: false,
                type: ChartType.Standard,
            },
            charts: [],
        },
        20: {
            id: 20,
            info: {
                id: 20,
                title: "New SD Song",
                artist: "Artist",
                genre: MusicGenre["流行&动漫"],
                bpm: 120,
                from: MusicOrigin.maimai,
                isNew: true,
                type: ChartType.Standard,
            },
            charts: [],
        },
        10030: {
            id: 10030,
            info: {
                id: 10030,
                title: "New DX Song",
                artist: "Artist",
                genre: MusicGenre["niconico & VOCALOID"],
                bpm: 150,
                from: MusicOrigin.maimai,
                isNew: true,
                type: ChartType.Deluxe,
            },
            charts: [],
        },
        10040: {
            id: 10040,
            info: {
                id: 10040,
                title: "Old DX Song",
                artist: "Artist",
                genre: MusicGenre["niconico & VOCALOID"],
                bpm: 150,
                from: MusicOrigin.maimai,
                isNew: false,
                type: ChartType.Deluxe,
            },
            charts: [],
        },
    };

    it("splits new and old by music isNew, resolving DX music ids via getSaltNetMusicIdForChartType", () => {
        const records = [
            makeRecord({ song_id: 30, type: "DX", ra: 280, title: "New DX" }),
            makeRecord({ song_id: 40, type: "DX", ra: 270, title: "Old DX" }),
            makeRecord({ song_id: 20, type: "SD", ra: 260, title: "New SD" }),
            makeRecord({ song_id: 10, type: "SD", ra: 250, title: "Old SD" }),
        ];

        const b50 = buildDivingFishB50(records, mockMusicList);

        expect(b50.dx.map(r => r.title)).toEqual(["New DX", "New SD"]);
        expect(b50.sd.map(r => r.title)).toEqual(["Old DX", "Old SD"]);
    });

    it("treats records with unknown music or undefined musicList as old", () => {
        const records = [
            makeRecord({ song_id: 999, type: "SD", ra: 300, title: "Unknown SD" }),
            makeRecord({ song_id: 888, type: "DX", ra: 290, title: "Unknown DX" }),
        ];

        const withUnknown = buildDivingFishB50(records, mockMusicList);
        expect(withUnknown.dx).toEqual([]);
        expect(withUnknown.sd.map(r => r.title)).toEqual(["Unknown SD", "Unknown DX"]);

        const withUndefined = buildDivingFishB50(records, undefined);
        expect(withUndefined.dx).toEqual([]);
        expect(withUndefined.sd.map(r => r.title)).toEqual(["Unknown SD", "Unknown DX"]);
    });

    it("sorts by ra descending and preserves order for records with equal ra", () => {
        const records = [
            makeRecord({ song_id: 10, ra: 200, title: "Old A" }),
            makeRecord({ song_id: 10, ra: 300, title: "Old B" }),
            makeRecord({ song_id: 10, ra: 250, title: "Old C" }),
            makeRecord({ song_id: 10, ra: 250, title: "Old D" }),
        ];

        const b50 = buildDivingFishB50(records, mockMusicList);
        expect(b50.sd.map(r => [r.title, r.ra])).toEqual([
            ["Old B", 300],
            ["Old C", 250],
            ["Old D", 250],
            ["Old A", 200],
        ]);
    });

    it("preserves input order for new songs with equal ra", () => {
        const records = [
            makeRecord({ song_id: 20, type: "SD", ra: 200, title: "New A" }),
            makeRecord({ song_id: 20, type: "SD", ra: 300, title: "New B" }),
            makeRecord({ song_id: 20, type: "SD", ra: 250, title: "New C" }),
            makeRecord({ song_id: 20, type: "SD", ra: 250, title: "New D" }),
        ];

        const b50 = buildDivingFishB50(records, mockMusicList);
        expect(b50.dx.map(r => [r.title, r.ra])).toEqual([
            ["New B", 300],
            ["New C", 250],
            ["New D", 250],
            ["New A", 200],
        ]);
    });

    it("limits dx to at most 15 and sd to at most 35 records, keeping exactly 15 and 35 when there are more", () => {
        const newRecords = Array.from({ length: 20 }, (_, i) =>
            makeRecord({ song_id: 20, type: "SD", ra: 100 + i, title: `New ${i}` })
        );
        const oldRecords = Array.from({ length: 45 }, (_, i) =>
            makeRecord({ song_id: 10, type: "SD", ra: 100 + i, title: `Old ${i}` })
        );

        const b50 = buildDivingFishB50([...newRecords, ...oldRecords], mockMusicList);

        expect(b50.dx).toHaveLength(15);
        expect(b50.sd).toHaveLength(35);
        // The highest 15 new records (119 down to 105)
        expect(b50.dx[0].ra).toBe(119);
        expect(b50.dx[14].ra).toBe(105);
        // The highest 35 old records (144 down to 110)
        expect(b50.sd[0].ra).toBe(144);
        expect(b50.sd[34].ra).toBe(110);
    });
});
