import type { RuntimePaths } from "../../src/runtime/paths";
import type { Route } from "../mockHttp";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { describe, expect, it } from "vitest";
import { searchSongs } from "../../src/catalog/search";
import { createRegistry } from "../../src/commands";
import { formatLocalTime } from "../../src/util/time";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { createHarness, run } from "../harness";
import { jsonResponse, mockFetch } from "../mockHttp";
import { useTempHome } from "../tempHome";

const META_URL = "https://meta.test/saltmeta.json";
const LXNS_URL = "https://lxns.test";
const NOW = new Date("2026-11-11T01:00:00Z");

function routes(overrides: Record<string, Route> = {}): Record<string, Route> {
    const lists = getFixtureLXNSCollections();
    const list = (kind: string) => `${LXNS_URL}/api/v0/maimai/${kind}/list?required=true`;
    return {
        [META_URL]: jsonResponse(getFixtureSaltMetaCompacted()),
        [list("trophy")]: jsonResponse({ trophies: lists.trophies }),
        [list("icon")]: jsonResponse({ icons: lists.icons }),
        [list("plate")]: jsonResponse({ plates: lists.plates }),
        [list("frame")]: jsonResponse({ frames: lists.frames }),
        ...overrides,
    };
}

const makeHome = useTempHome();

interface SearchItem {
    musicId: number;
    title: string;
    artist: string;
    genre: string;
    type: string;
    matchedBy: string[];
    [key: string]: unknown;
}

interface PrintedOutput {
    v: number;
    ok: boolean;
    command: string;
    data: { items: SearchItem[] };
    meta: {
        dataAsOf: { catalog: string };
        page: { total: number; offset: number; limit: number; nextOffset: number | null };
    };
    warnings: { code: string; message: string; fix?: string }[];
    error: { code: string; message: string; fix?: string; retryable: boolean };
}

async function searchIn(
    paths: RuntimePaths,
    args: string[],
    options: { now?: Date; network?: Record<string, Route> } = {}
) {
    const fetch = mockFetch(options.network ?? routes());
    const harness = createHarness({
        env: {
            SALTNET_HOME: paths.home,
            SALTNET_SALTMETA_URL: META_URL,
            SALTNET_LXNS_BASE_URL: LXNS_URL,
        },
        fetch,
        now: options.now ?? NOW,
    });
    const code = await run(createRegistry(), harness, "search", ...args);
    const stdout = harness.stdout();
    let json: PrintedOutput | undefined;
    try {
        json = JSON.parse(stdout) as PrintedOutput;
    } catch {
        // Non-JSON output like --format tsv
    }
    return { code, json: json!, stdout, requests: fetch.requests };
}

describe("saltnet search command", () => {
    it("returns output matching the standard envelope and item structure.", async () => {
        const paths = makeHome();
        const { code, json } = await searchIn(paths, ["Link"]);

        expect(code).toBe(0);
        expect(json.v).toBe(1);
        expect(json.ok).toBe(true);
        expect(json.command).toBe("search");
        expect(json.warnings).toEqual([]);
        expect(json.meta.dataAsOf.catalog).toBe(formatLocalTime(NOW));
        expect(json.meta.page).toEqual({
            total: 2,
            offset: 0,
            limit: 10,
            nextOffset: null,
        });

        expect(json.data.items).toHaveLength(2);
        for (const item of json.data.items) {
            expect(Object.keys(item)).toEqual([
                "musicId",
                "title",
                "artist",
                "genre",
                "type",
                "matchedBy",
            ]);
        }
    });

    it("defaults to limit 10 and supports pagination.", async () => {
        const paths = makeHome();
        const totalHits = searchSongs(fixtureSongCatalog(), "o").length;
        expect(totalHits).toBeGreaterThan(10);

        const { code, json } = await searchIn(paths, ["o"]);
        expect(code).toBe(0);
        expect(json.data.items).toHaveLength(10);
        expect(json.meta.page).toEqual({
            total: totalHits,
            offset: 0,
            limit: 10,
            nextOffset: 10,
        });

        const { json: full } = await searchIn(paths, ["o", "--limit", "10000"]);
        expect(full.data.items).toHaveLength(totalHits);

        const { json: paged } = await searchIn(paths, ["o", "--limit", "3", "--offset", "3"]);
        expect(paged.data.items).toEqual(full.data.items.slice(3, 6));
        expect(paged.meta.page.offset).toBe(3);
        expect(paged.meta.page.limit).toBe(3);
        expect(paged.meta.page.nextOffset).toBe(6);

        const lastOffset = totalHits - 2;
        const { json: last } = await searchIn(paths, [
            "o",
            "--limit",
            "10",
            "--offset",
            String(lastOffset),
        ]);
        expect(last.meta.page.nextOffset).toBeNull();
    });

    it("joins multiple positional arguments with a single space.", async () => {
        const paths = makeHome();
        const resSeparate = await searchIn(paths, ["true", "love"]);
        const resQuoted = await searchIn(paths, ["true love"]);

        expect(resSeparate.json.data.items).toEqual(resQuoted.json.data.items);
        expect(resSeparate.json.data.items[0].musicId).toBe(8);
    });

    it("finds Link with expected metadata and matchedBy kinds.", async () => {
        const paths = makeHome();
        const { json } = await searchIn(paths, ["Link"]);

        expect(json.data.items).toHaveLength(2);
        expect(json.data.items[0]).toMatchObject({
            musicId: 131,
            title: "Link",
            artist: "Clean Tears feat. Youna",
            matchedBy: ["title", "alias"],
            type: "SD",
            genre: "舞萌",
        });
        expect(json.data.items[1]).toMatchObject({
            musicId: 383,
            matchedBy: ["title", "alias"],
            type: "SD",
        });
    });

    it("does not take words that are apart for a music id.", async () => {
        const paths = makeHome();

        const joined = await searchIn(paths, ["146"]);
        expect(joined.json.data.items[0]).toMatchObject({ musicId: 146 });
        expect(joined.json.data.items[0].matchedBy).toContain("id");

        const apart = await searchIn(paths, ["1", "46"]);
        const quoted = await searchIn(paths, ["1 46"]);
        expect(apart.code).toBe(0);
        expect(apart.json.data.items.some(item => item.matchedBy.includes("id"))).toBe(false);
        expect(apart.json.data.items).toEqual(quoted.json.data.items);
    });

    it("passes on the warning when it has to use stored data that is out of date.", async () => {
        const paths = makeHome();
        await searchIn(paths, ["Link"]);

        const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const stale = await searchIn(paths, ["Link"], { now: later, network: {} });
        expect(stale.code).toBe(0);
        expect(stale.json.ok).toBe(true);
        expect(stale.json.warnings.map(warning => warning.code)).toEqual(["STALE_METADATA"]);
        expect(stale.json.data.items.map(item => item.musicId)).toEqual([131, 383]);
    });

    it("filters item properties when --fields is specified.", async () => {
        const paths = makeHome();
        const { json } = await searchIn(paths, ["Link", "--fields", "musicId,matchedBy"]);

        expect(json.data.items).toEqual([
            { musicId: 131, matchedBy: ["title", "alias"] },
            { musicId: 383, matchedBy: ["title", "alias"] },
        ]);
    });

    it("returns zero items and exits with 0 when nothing matches.", async () => {
        const paths = makeHome();
        const { code, json } = await searchIn(paths, ["zzzzzzzz"]);

        expect(code).toBe(0);
        expect(json.ok).toBe(true);
        expect(json.data.items).toEqual([]);
        expect(json.meta.page.total).toBe(0);
    });

    it("rejects blank or empty text with a usage error.", async () => {
        const paths = makeHome();

        for (const blank of ["", "   "]) {
            const { code, json } = await searchIn(paths, [blank]);
            expect(code).toBe(2);
            expect(json.ok).toBe(false);
            expect(json.error.code).toBe("USAGE");
        }

        const noArgs = await searchIn(paths, []);
        expect(noArgs.code).toBe(2);
        expect(noArgs.json.ok).toBe(false);
        expect(noArgs.json.error.code).toBe("USAGE");
    });

    it("downloads metadata on first call and uses cached data on subsequent calls.", async () => {
        const paths = makeHome();

        const first = await searchIn(paths, ["Link"]);
        expect(first.code).toBe(0);
        expect(first.requests.map(r => r.url)).toEqual([META_URL]);

        const second = await searchIn(paths, ["Link"]);
        expect(second.code).toBe(0);
        expect(second.requests).toEqual([]);
    });

    it("fails with OFFLINE_NO_CACHE when offline without cache, and succeeds when cached.", async () => {
        const paths = makeHome();

        const failOffline = await searchIn(paths, ["Link", "--offline"]);
        expect(failOffline.code).toBe(5);
        expect(failOffline.json.ok).toBe(false);
        expect(failOffline.json.error.code).toBe("OFFLINE_NO_CACHE");

        await searchIn(paths, ["Link"]);

        const okOffline = await searchIn(paths, ["Link", "--offline"]);
        expect(okOffline.code).toBe(0);
        expect(okOffline.json.ok).toBe(true);
        expect(okOffline.requests).toEqual([]);
        expect(okOffline.json.data.items[0].musicId).toBe(131);
    });

    it("formats output as TSV with proper headers and JSON-encoded array cells.", async () => {
        const paths = makeHome();
        const { code, stdout } = await searchIn(paths, ["Link", "--format", "tsv"]);

        expect(code).toBe(0);
        const lines = stdout.trimEnd().split("\n");
        expect(lines[0]).toBe("musicId\ttitle\tartist\tgenre\ttype\tmatchedBy");
        expect(lines).toHaveLength(3);

        const firstRowCells = lines[1].split("\t");
        expect(firstRowCells[0]).toBe("131");
        expect(firstRowCells[1]).toBe("Link");
        expect(firstRowCells[5]).toBe('["title","alias"]');
    });
});
