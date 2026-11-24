import type { FetchLike } from "../http";
import type { SaltMetaMusicMetadataNextCompacted } from "./saltmeta";
import { describe, expect, it, vi } from "vitest";
import { getFixtureSaltMetaCompacted } from "../fixtures/saltmeta";
import { buildSaltMetaMusicList, fetchSaltMetaCompacted, fetchSaltMetaMusicList } from "./fetch";
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

describe("downloading without converting", () => {
    it("returns the document as downloaded", async () => {
        const document = makeCompacted();
        const outcome = await fetchSaltMetaCompacted({ fetch: respondWith(document) });

        expect(outcome).toEqual({ ok: true, compacted: document });
    });

    it("reports the same failures as the full fetch", async () => {
        expect(
            await fetchSaltMetaCompacted({ fetch: respondWith(null, { ok: false, status: 404 }) })
        ).toEqual({
            ok: false,
            failure: { kind: "http", status: 404 },
        });
        expect(await fetchSaltMetaCompacted({ fetch: respondWith(makeCompacted(3)) })).toEqual({
            ok: false,
            failure: { kind: "version", expected: 1, actual: 3 },
        });
        const boom = new Error("boom");
        expect(
            await fetchSaltMetaCompacted({
                fetch: vi.fn(async () => {
                    throw boom;
                }),
            })
        ).toEqual({ ok: false, failure: { kind: "error", error: boom } });
    });

    it("does not look at the contents, so converting is a separate step that can throw", async () => {
        const outcome = await fetchSaltMetaCompacted({
            fetch: respondWith({ version: 1, musics: [[1, "x"]], versions: [] }),
        });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(() => buildSaltMetaMusicList(outcome.compacted)).toThrow();
    });
});

describe("building the music list from a document", () => {
    it("matches what the full fetch returns and merges nothing by default", async () => {
        const document = getFixtureSaltMetaCompacted();
        const built = buildSaltMetaMusicList(document);
        const fetched = await fetchSaltMetaMusicList({ fetch: respondWith(document) });

        expect(built.merged).toEqual([]);
        expect(fetched.ok).toBe(true);
        if (!fetched.ok) return;
        expect(built.music).toEqual(fetched.value.music);
        expect(built.metadata).toEqual(fetched.value.metadata);
        // The web app keeps both entries of an upstream duplicate, so their charts collide.
        expect(built.music.musicList[110851].charts).toHaveLength(2);
    });

    it("folds upstream duplicates when asked to", () => {
        const built = buildSaltMetaMusicList(getFixtureSaltMetaCompacted(), {
            mergeDuplicates: true,
        });

        expect(built.merged.map(entry => entry.id)).toEqual([100851, 100998]);
        expect(built.music.musicList[110851].charts).toHaveLength(1);
        expect(built.music.musicList[110998].charts).toHaveLength(1);
        expect(built.music.chartList[11085110].music).toBe(built.music.musicList[110851]);
    });
});
