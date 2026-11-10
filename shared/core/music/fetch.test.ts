import type { FetchLike } from "../http";
import type { SaltMetaMusicMetadataNextCompacted } from "./saltmeta";
import { describe, expect, it, vi } from "vitest";
import { fetchSaltMetaMusicList } from "./fetch";
import { SALTMETA_NEXT_COMPACTED_URL } from "./saltmeta";

function makeCompacted(version = 1): SaltMetaMusicMetadataNextCompacted {
    return {
        version,
        versions: [["CiRCLE", "CiRCLE", "2025-09-18", null]],
        musics: [
            [
                100,
                "Test Song",
                "Test Artist",
                120,
                4,
                false,
                [
                    [0, 3, [["cn", "12", 12.3, 0]], "Charter A", [100, 20, 10, 0, 5]],
                    [1, 3, [["cn", "12+", 12.7, 0]], "Charter B", [100, 20, 10, 12, 5]],
                ],
                ["别名"],
                null,
            ],
        ],
    };
}

function respondWith(body: unknown, init: { ok?: boolean; status?: number } = {}): FetchLike {
    return vi.fn(async () => ({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
    }));
}

describe("fetching SaltMeta metadata", () => {
    it("downloads, validates and converts the compacted document", async () => {
        const doFetch = respondWith(makeCompacted());

        const outcome = await fetchSaltMetaMusicList({
            fetch: doFetch,
            requestInit: { cache: "no-store" },
        });

        expect(doFetch).toHaveBeenCalledTimes(1);
        expect(doFetch).toHaveBeenCalledWith(SALTMETA_NEXT_COMPACTED_URL, { cache: "no-store" });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.compacted.musics).toHaveLength(1);
        expect(Object.keys(outcome.value.music.musicList).map(Number)).toEqual([100, 10100]);
        expect(outcome.value.music.musicList[100]?.info.title).toBe("Test Song");
        expect(outcome.value.music.chartList[1010003]?.info.charter).toBe("Charter B");
        expect(outcome.value.metadata.cnVersions).toEqual([
            { name: "舞萌DX 2026", word: "CiRCLE" },
        ]);
    });

    it("requests the configured address instead of the default", async () => {
        const doFetch = respondWith(makeCompacted());

        await fetchSaltMetaMusicList({
            fetch: doFetch,
            config: { saltMetaUrl: "https://example.test/meta.json" },
        });

        expect(doFetch).toHaveBeenCalledWith("https://example.test/meta.json", undefined);
    });

    it("reports HTTP failures with their status", async () => {
        const outcome = await fetchSaltMetaMusicList({
            fetch: respondWith(null, { ok: false, status: 503 }),
        });

        expect(outcome).toEqual({ ok: false, failure: { kind: "http", status: 503 } });
    });

    it("reports a document version the build does not understand", async () => {
        const outcome = await fetchSaltMetaMusicList({ fetch: respondWith(makeCompacted(2)) });

        expect(outcome).toEqual({
            ok: false,
            failure: { kind: "version", expected: 1, actual: 2 },
        });
    });

    it("reports network and malformed-document errors without throwing", async () => {
        const networkError = new Error("offline");
        const failed = await fetchSaltMetaMusicList({
            fetch: vi.fn(async () => {
                throw networkError;
            }),
        });
        expect(failed).toEqual({ ok: false, failure: { kind: "error", error: networkError } });

        const malformed = await fetchSaltMetaMusicList({
            fetch: respondWith({ version: 1, musics: [[1, "x"]] }),
        });
        expect(malformed.ok).toBe(false);
        if (malformed.ok) return;
        expect(malformed.failure.kind).toBe("error");
    });
});
