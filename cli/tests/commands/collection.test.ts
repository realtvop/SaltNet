import type {
    CollectionChartRow,
    CollectionDetail,
    CollectionRow,
    MissingCollectionSong,
} from "../../src/catalog/collectionView";
import type { PrintedOutput } from "../commandRun";
import { existsSync } from "node:fs";
import { partners } from "@core/collection/static";
import { describe, expect, it } from "vitest";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, LXNS_URL, META_URL, NOW } from "../commandRun";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

const lxnsList = (kind: string) => `${LXNS_URL}/api/v0/maimai/${kind}/list?required=true`;

const EXPECTED_LXNS_REQUESTS = [
    lxnsList("trophy"),
    lxnsList("icon"),
    lxnsList("plate"),
    lxnsList("frame"),
];

interface ListOutput extends Omit<PrintedOutput, "data"> {
    data: { items: CollectionRow[] };
}

interface ShowOutput extends Omit<PrintedOutput, "data"> {
    data: {
        collection: CollectionDetail;
        missing: MissingCollectionSong[];
        items: CollectionChartRow[];
    };
}

interface Printed<Output> {
    code: number;
    json: Output;
    stdout: string;
    requests: { url: string }[];
}

async function listIn(
    paths: ReturnType<typeof makeHome>,
    args: string[] = [],
    options?: Parameters<typeof commandIn>[3]
) {
    const res = await commandIn(paths, "collection", ["list", ...args], options);
    return res as unknown as Printed<ListOutput>;
}

async function showIn(
    paths: ReturnType<typeof makeHome>,
    args: string[],
    options?: Parameters<typeof commandIn>[3]
) {
    const res = await commandIn(paths, "collection", ["show", ...args], options);
    return res as unknown as Printed<ShowOutput>;
}

const EXPECTED_PLATE_1_ROW = {
    ref: "plate:1",
    kind: "plate",
    id: 1,
    name: "デフォルト",
    genre: "デフォルト",
    color: null,
    description: "はじめから所持",
    songCount: 0,
    owned: null,
    progress: null,
};

const EXPECTED_FRAME_109101_ROW = {
    ref: "frame:109101",
    kind: "frame",
    id: 109101,
    name: "PERFECT Jewel [Diamond]",
    genre: "実績",
    color: null,
    description: "舞萌DX 全曲/BASIC～MASTER/ALL PERFECT",
    songCount: 2,
    owned: null,
    progress: null,
};

const EXPECTED_PLATE_6148_DETAIL = {
    ref: "plate:6148",
    kind: "plate",
    id: 6148,
    name: "覇者",
    genre: "実績",
    color: null,
    description: "全曲/BASIC～Re:MASTER/CLEAR",
    songCount: 7,
    owned: null,
    progress: null,
    requirements: [
        {
            difficulties: ["BASIC", "ADVANCED", "EXPERT", "MASTER"],
            rank: "A",
            combo: null,
            sync: null,
            songCount: 5,
        },
        {
            difficulties: ["Re:MASTER"],
            rank: "A",
            combo: null,
            sync: null,
            songCount: 4,
        },
    ],
};

const EXPECTED_TITLE_5102_DETAIL = {
    ref: "title:5102",
    kind: "title",
    id: 5102,
    name: "39",
    genre: "niconicoボーカロイド",
    color: "Gold",
    description: "39[でらっくす]/全難易度/ALL PERFECT",
    songCount: 1,
    owned: null,
    progress: null,
    requirements: [
        {
            difficulties: ["BASIC", "ADVANCED", "EXPERT", "MASTER"],
            rank: null,
            combo: "AP",
            sync: null,
            songCount: 1,
        },
    ],
};

const EXPECTED_PLATE_6148_KEYS = [
    "70-4",
    "58-4",
    "256-4",
    "17-4",
    "58-3",
    "30-3",
    "8-3",
    "9-3",
    "17-3",
    "58-2",
    "30-2",
    "8-2",
    "9-2",
    "17-2",
    "58-1",
    "30-1",
    "8-1",
    "9-1",
    "17-1",
    "58-0",
    "30-0",
    "8-0",
    "9-0",
    "17-0",
];

describe("collection list command", () => {
    it("runs on empty data directory, downloads collections only, and reuses cache on second run", async () => {
        const paths = makeHome();
        const first = await listIn(paths);

        expect(first.code).toBe(0);
        expect(first.json.ok).toBe(true);
        expect(first.json.command).toBe("collection list");
        expect(Object.keys(first.json.data)).toEqual(["items"]);
        expect(first.json.data.items).toHaveLength(50);
        expect(first.json.meta.page).toEqual({
            total: 966,
            offset: 0,
            limit: 50,
            nextOffset: 50,
        });
        expect(first.json.data.items[0]).toEqual(EXPECTED_PLATE_1_ROW);
        expect(first.json.data.items[26]).toEqual(EXPECTED_FRAME_109101_ROW);
        expect(Object.keys(first.json.data.items[0])).toEqual([
            "ref",
            "kind",
            "id",
            "name",
            "genre",
            "color",
            "description",
            "songCount",
            "owned",
            "progress",
        ]);
        expect(first.requests.map(r => r.url)).toEqual(EXPECTED_LXNS_REQUESTS);
        expect(first.json.meta.dataAsOf).toEqual({ collections: formatLocalTime(NOW) });
        expect(first.json.warnings).toEqual([]);

        const second = await listIn(paths);
        expect(second.code).toBe(0);
        expect(second.json.data.items).toEqual(first.json.data.items);
        expect(second.requests).toEqual([]);
    });

    it("filters by --kind and rejects invalid kinds", async () => {
        const paths = makeHome();

        const plates = await listIn(paths, ["--kind", "plate"]);
        expect(plates.code).toBe(0);
        expect(plates.json.data.items).toHaveLength(12);
        expect(plates.json.data.items.map(i => ({ id: i.id, songCount: i.songCount }))).toEqual([
            { id: 1, songCount: 0 },
            { id: 2, songCount: 0 },
            { id: 6101, songCount: 5 },
            { id: 6102, songCount: 5 },
            { id: 6103, songCount: 5 },
            { id: 6104, songCount: 4 },
            { id: 6105, songCount: 4 },
            { id: 6106, songCount: 4 },
            { id: 6107, songCount: 4 },
            { id: 6148, songCount: 7 },
            { id: 409506, songCount: 1 },
            { id: 101, songCount: 0 },
        ]);

        const titles = await listIn(paths, ["--kind", "title"]);
        expect(titles.code).toBe(0);
        expect(titles.json.data.items).toHaveLength(9);
        expect(titles.json.data.items.map(i => i.color)).toEqual([
            "Normal",
            "Normal",
            "Gold",
            "Gold",
            "Bronze",
            "Silver",
            "Gold",
            "Rainbow",
            "Rainbow",
        ]);

        const icons = await listIn(paths, ["--kind", "icon"]);
        expect(icons.code).toBe(0);
        expect(icons.json.data.items).toHaveLength(3);

        const frames = await listIn(paths, ["--kind", "frame"]);
        expect(frames.code).toBe(0);
        expect(frames.json.data.items).toHaveLength(3);

        const chars = await listIn(paths, ["--kind", "character", "--limit", "10000"]);
        expect(chars.code).toBe(0);
        expect(chars.json.data.items).toHaveLength(917);
        expect(chars.json.data.items[0].id).toBe(101);
        expect(chars.json.data.items[916].id).toBe(406325);

        const parts = await listIn(paths, ["--kind", "partner", "--limit", "50"]);
        expect(parts.code).toBe(0);
        expect(parts.json.data.items).toHaveLength(22);
        expect(parts.json.data.items.map(i => i.id)).toEqual(partners.map(p => p.id));
        expect(parts.json.data.items.map(i => i.name)).toEqual(partners.map(p => p.name));

        const titleIcon = await listIn(paths, ["--kind", "title,icon"]);
        expect(titleIcon.code).toBe(0);
        expect(titleIcon.json.data.items).toHaveLength(12);
        expect(titleIcon.json.data.items.slice(0, 9).every(i => i.kind === "title")).toBe(true);
        expect(titleIcon.json.data.items.slice(9).every(i => i.kind === "icon")).toBe(true);

        const framePlate = await listIn(paths, ["--kind", "frame,plate"]);
        expect(framePlate.code).toBe(0);
        expect(framePlate.json.meta.page.total).toBe(15);
        expect(framePlate.json.data.items.slice(0, 12).every(i => i.kind === "plate")).toBe(true);
        expect(framePlate.json.data.items.slice(12).every(i => i.kind === "frame")).toBe(true);

        const charPartner = await listIn(paths, ["--kind", "character,partner"]);
        expect(charPartner.code).toBe(0);
        expect(charPartner.json.meta.page.total).toBe(939);

        // Invalid kinds fail before requests
        const freshPaths1 = makeHome();
        const invalidKind = await listIn(freshPaths1, ["--kind", "foo"]);
        expect(invalidKind.code).toBe(2);
        expect(invalidKind.json.error.code).toBe("USAGE");
        expect(invalidKind.json.error.message).toBe(
            "选项 --kind 的值「foo」不在可选范围内；可选值：plate、title、icon、frame、character、partner"
        );
        expect(invalidKind.requests).toEqual([]);
        expect(existsSync(freshPaths1.home)).toBe(false);

        const freshPaths2 = makeHome();
        const invalidKindCombo = await listIn(freshPaths2, ["--kind", "plate,foo"]);
        expect(invalidKindCombo.code).toBe(2);
        expect(invalidKindCombo.json.error.code).toBe("USAGE");
        expect(invalidKindCombo.json.error.message).toBe(
            "选项 --kind 的值「foo」不在可选范围内；可选值：plate、title、icon、frame、character、partner"
        );
        expect(invalidKindCombo.requests).toEqual([]);
        expect(existsSync(freshPaths2.home)).toBe(false);
    });

    it("filters by --search case-insensitively and on name only", async () => {
        const paths = makeHome();

        const resJi = await listIn(paths, ["--search", "極"]);
        expect(resJi.code).toBe(0);
        expect(resJi.json.meta.page.total).toBe(2);
        expect(resJi.json.data.items.map(i => i.ref)).toEqual(["plate:6101", "plate:6104"]);

        const resDef = await listIn(paths, ["--search", "デフォルト"]);
        expect(resDef.code).toBe(0);
        expect(resDef.json.data.items.map(i => i.ref)).toEqual(["plate:1", "icon:1", "frame:1"]);

        const resRandom = await listIn(paths, ["--search", "从整体中随机选择"]);
        expect(resRandom.code).toBe(0);
        expect(resRandom.json.data.items.map(i => i.ref)).toEqual([
            "plate:2",
            "title:2",
            "icon:2",
            "frame:2",
        ]);

        const resZhen = await listIn(paths, ["--search", "真"]);
        expect(resZhen.code).toBe(0);
        expect(resZhen.json.data.items.map(i => i.ref)).toEqual([
            "plate:6101",
            "plate:6102",
            "plate:6103",
            "character:355611",
        ]);

        for (const needle of ["usm", "USM", "Usm", "ＵＳＭ"]) {
            const resUsm = await listIn(paths, ["--search", needle]);
            expect(resUsm.code).toBe(0);
            expect(resUsm.json.data.items.map(i => i.ref)).toEqual(["plate:409506"]);
        }

        const resTrim = await listIn(paths, ["--search", "  極  "]);
        expect(resTrim.code).toBe(0);
        expect(resTrim.json.data.items.map(i => i.ref)).toEqual(["plate:6101", "plate:6104"]);

        const resSakura = await listIn(paths, ["--search", "千本桜"]);
        expect(resSakura.code).toBe(0);
        expect(resSakura.json.data.items.map(i => i.ref)).toEqual(["title:5101"]);

        const resSenbon = await listIn(paths, ["--search", "千本"]);
        expect(resSenbon.code).toBe(0);
        expect(resSenbon.json.data.items.map(i => i.ref)).toEqual(["title:5101"]);

        const res39 = await listIn(paths, ["--search", "39"]);
        expect(res39.code).toBe(0);
        expect(res39.json.data.items.map(i => i.ref)).toEqual(["title:5102"]);

        // Genre and description are not searched
        const resGenre = await listIn(paths, ["--search", "実績"]);
        expect(resGenre.code).toBe(0);
        expect(resGenre.json.data.items).toEqual([]);
        expect(resGenre.json.meta.page.total).toBe(0);
        expect(resGenre.json.meta.page.nextOffset).toBeNull();

        const resDesc = await listIn(paths, ["--search", "はじめから所持"]);
        expect(resDesc.code).toBe(0);
        expect(resDesc.json.data.items).toEqual([]);

        const resZzz = await listIn(paths, ["--search", "zzzzzz"]);
        expect(resZzz.code).toBe(0);
        expect(resZzz.json.data.items).toEqual([]);

        // Combines with --kind
        const resKindTitle = await listIn(paths, ["--kind", "title", "--search", "千本"]);
        expect(resKindTitle.code).toBe(0);
        expect(resKindTitle.json.data.items.map(i => i.ref)).toEqual(["title:5101"]);

        const resKindPlate = await listIn(paths, ["--kind", "plate", "--search", "千本"]);
        expect(resKindPlate.code).toBe(0);
        expect(resKindPlate.json.data.items).toEqual([]);

        const resPaging = await listIn(paths, ["--search", "真", "--limit", "2"]);
        expect(resPaging.code).toBe(0);
        expect(resPaging.json.data.items.map(i => i.ref)).toEqual(["plate:6101", "plate:6102"]);
        expect(resPaging.json.meta.page).toEqual({
            total: 4,
            offset: 0,
            limit: 2,
            nextOffset: 2,
        });

        // Blank search errors
        const freshPaths1 = makeHome();
        const resSpaces = await listIn(freshPaths1, ["--search", "   "]);
        expect(resSpaces.code).toBe(2);
        expect(resSpaces.json.error.code).toBe("USAGE");
        expect(resSpaces.json.error.message).toBe("选项 --search 的值不能只有空白");
        expect(resSpaces.requests).toEqual([]);
        expect(existsSync(freshPaths1.home)).toBe(false);

        const freshPaths2 = makeHome();
        const resEmpty = await listIn(freshPaths2, ["--search", ""]);
        expect(resEmpty.code).toBe(2);
        expect(resEmpty.json.error.code).toBe("USAGE");
        expect(resEmpty.requests).toEqual([]);
    });

    it("supports paging with limit and offset", async () => {
        const paths = makeHome();

        const resSlice = await listIn(paths, ["--limit", "5", "--offset", "26"]);
        expect(resSlice.code).toBe(0);
        expect(resSlice.json.meta.page).toEqual({
            total: 966,
            offset: 26,
            limit: 5,
            nextOffset: 31,
        });
        expect(resSlice.json.data.items.map(i => i.ref)).toEqual([
            "frame:109101",
            "character:101",
            "character:102",
            "character:103",
            "character:104",
        ]);
        expect(resSlice.json.data.items[4].name).toBe("ぱんだっくま");

        const resEnd = await listIn(paths, ["--limit", "10", "--offset", "960"]);
        expect(resEnd.code).toBe(0);
        expect(resEnd.json.data.items).toHaveLength(6);
        expect(resEnd.json.data.items.map(i => i.ref)).toEqual([
            "partner:26",
            "partner:27",
            "partner:28",
            "partner:29",
            "partner:30",
            "partner:31",
        ]);
        expect(resEnd.json.meta.page.nextOffset).toBeNull();

        const resLimitZero = await listIn(paths, ["--limit", "0"]);
        expect(resLimitZero.code).toBe(2);
        expect(resLimitZero.json.error.code).toBe("USAGE");

        const resPastEnd = await listIn(paths, ["--offset", "5000"]);
        expect(resPastEnd.code).toBe(0);
        expect(resPastEnd.json.data.items).toEqual([]);
        expect(resPastEnd.json.meta.page.total).toBe(966);
        expect(resPastEnd.json.meta.page.nextOffset).toBeNull();
    });

    it("projects fields and formats as tsv and text", async () => {
        const paths = makeHome();

        const resFields = await listIn(paths, ["--fields", "ref,name", "--limit", "3"]);
        expect(resFields.code).toBe(0);
        for (const item of resFields.json.data.items) {
            expect(Object.keys(item)).toEqual(["ref", "name"]);
        }

        const resTsvParts = await listIn(paths, [
            "--kind",
            "partner",
            "--fields",
            "ref,name,genre",
            "--limit",
            "3",
            "--format",
            "tsv",
        ]);
        expect(resTsvParts.code).toBe(0);
        expect(resTsvParts.stdout).toBe(
            "ref\tname\tgenre\npartner:1\tでらっくま\t\npartner:11\t乙姫\t\npartner:12\tラズ\t\n"
        );

        const resTsvTitles = await listIn(paths, [
            "--kind",
            "title",
            "--limit",
            "3",
            "--format",
            "tsv",
        ]);
        expect(resTsvTitles.code).toBe(0);
        const lines = resTsvTitles.stdout.split("\n");
        expect(lines[0]).toBe(
            "ref\tkind\tid\tname\tgenre\tcolor\tdescription\tsongCount\towned\tprogress"
        );
        expect(lines[1]).toBe(
            "title:1\ttitle\t1\t新人出道\tデフォルト\tNormal\tはじめから所持\t0\t\t"
        );

        const resText = await listIn(paths, ["--kind", "icon", "--format", "text"]);
        expect(resText.code).toBe(0);
        expect(resText.stdout).toContain("icon:209502");
        expect(resText.stdout).toContain("UNiVERSE");
    });

    it("handles offline mode and stale metadata warning", async () => {
        const paths = makeHome();

        const offlineFail = await listIn(paths, ["--offline"]);
        expect(offlineFail.code).toBe(5);
        expect(offlineFail.json.error.code).toBe("OFFLINE_NO_CACHE");
        expect(offlineFail.requests).toEqual([]);

        const normalRun = await listIn(paths);
        expect(normalRun.code).toBe(0);

        const offlineOk = await listIn(paths, ["--offline"]);
        expect(offlineOk.code).toBe(0);
        expect(offlineOk.requests).toEqual([]);
        expect(offlineOk.json.meta.dataAsOf).toEqual(normalRun.json.meta.dataAsOf);

        const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const staleRun = await listIn(paths, [], { now: later, network: {} });
        expect(staleRun.code).toBe(0);
        expect(staleRun.json.warnings.map(w => w.code)).toEqual(["STALE_METADATA"]);
        expect(staleRun.json.warnings[0].message).toContain("收藏品（落雪）");
        expect(staleRun.json.warnings[0].message).not.toContain("曲库");
        expect(staleRun.json.warnings[0].fix).toBe("saltnet refresh");
        expect(staleRun.json.meta.dataAsOf.collections).toBe(formatLocalTime(NOW));
        expect(staleRun.json.data.items).toEqual(normalRun.json.data.items);
    });
});

describe("collection show command", () => {
    it("shows plate:6148 on an empty data directory and downloads collections then catalog", async () => {
        const paths = makeHome();
        const res = await showIn(paths, ["plate:6148"]);

        expect(res.code).toBe(0);
        expect(res.json.ok).toBe(true);
        expect(res.json.command).toBe("collection show");
        expect(Object.keys(res.json.data).sort()).toEqual(["collection", "items", "missing"]);
        expect(res.json.data.collection).toEqual(EXPECTED_PLATE_6148_DETAIL);
        expect(res.json.data.missing).toEqual([]);
        expect(res.json.data.items.map(i => i.chartKey)).toEqual(EXPECTED_PLATE_6148_KEYS);
        expect(res.json.meta.page).toEqual({
            total: 24,
            offset: 0,
            limit: 50,
            nextOffset: null,
        });
        expect(res.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(NOW),
            collections: formatLocalTime(NOW),
        });
        expect(res.json.warnings).toEqual([]);

        expect(res.requests).toHaveLength(5);
        expect(
            res.requests
                .slice(0, 4)
                .map(r => r.url)
                .sort()
        ).toEqual([...EXPECTED_LXNS_REQUESTS].sort());
        expect(res.requests[4].url).toBe(META_URL);

        expect(res.json.data.items[0]).toEqual({
            chartKey: "70-4",
            musicId: 70,
            title: "ジングルベル",
            type: "SD",
            difficulty: "Re:MASTER",
            level: "14",
            constant: 14.2,
            fitConstant: null,
            version: "maimai",
            score: null,
            b50: null,
            done: null,
        });
        expect(res.json.data.items[4]).toEqual({
            chartKey: "58-3",
            musicId: 58,
            title: "Endless World",
            type: "SD",
            difficulty: "MASTER",
            level: "13",
            constant: 13,
            fitConstant: null,
            version: "maimai PLUS",
            score: null,
            b50: null,
            done: null,
        });
        for (const item of res.json.data.items) {
            expect(Object.keys(item)).toEqual([
                "chartKey",
                "musicId",
                "title",
                "type",
                "difficulty",
                "level",
                "constant",
                "fitConstant",
                "version",
                "score",
                "b50",
                "done",
            ]);
        }
    });

    it("supports paging items without modifying collection or missing", async () => {
        const paths = makeHome();

        const resLimit3 = await showIn(paths, ["plate:6148", "--limit", "3"]);
        expect(resLimit3.code).toBe(0);
        expect(resLimit3.json.data.items.map(i => i.chartKey)).toEqual(["70-4", "58-4", "256-4"]);
        expect(resLimit3.json.meta.page).toEqual({
            total: 24,
            offset: 0,
            limit: 3,
            nextOffset: 3,
        });

        const resSlice = await showIn(paths, ["plate:6148", "--limit", "10", "--offset", "20"]);
        expect(resSlice.code).toBe(0);
        expect(resSlice.json.data.items.map(i => i.chartKey)).toEqual([
            "30-0",
            "8-0",
            "9-0",
            "17-0",
        ]);
        expect(resSlice.json.meta.page).toEqual({
            total: 24,
            offset: 20,
            limit: 10,
            nextOffset: null,
        });

        const resSingle = await showIn(paths, ["plate:6148", "--offset", "23", "--limit", "1"]);
        expect(resSingle.code).toBe(0);
        expect(resSingle.json.data.items.map(i => i.chartKey)).toEqual(["17-0"]);
        expect(resSingle.json.data.collection.requirements).toHaveLength(2);

        const resPast = await showIn(paths, ["plate:6148", "--offset", "100"]);
        expect(resPast.code).toBe(0);
        expect(resPast.json.data.items).toEqual([]);
        expect(resPast.json.meta.page.total).toBe(24);

        const resMissingPaged = await showIn(paths, ["title:158511", "--limit", "1"]);
        expect(resMissingPaged.code).toBe(0);
        expect(resMissingPaged.json.data.items).toEqual([]);
        expect(resMissingPaged.json.data.missing).toEqual([
            { musicId: 11248, title: "MEGATON BLAST" },
            { musicId: 11292, title: "MEGATON KICK" },
        ]);
    });

    it("shows title:5102 with all 4 charts and formats as tsv and text", async () => {
        const paths = makeHome();
        const res = await showIn(paths, ["title:5102"]);

        expect(res.code).toBe(0);
        expect(res.json.data.collection).toEqual(EXPECTED_TITLE_5102_DETAIL);
        expect(res.json.data.missing).toEqual([]);
        expect(res.json.data.items).toEqual([
            {
                chartKey: "10146-3",
                musicId: 10146,
                title: "39",
                type: "DX",
                difficulty: "MASTER",
                level: "12+",
                constant: 12.8,
                fitConstant: 12.784,
                version: "舞萌DX",
                score: null,
                b50: null,
                done: null,
            },
            {
                chartKey: "10146-2",
                musicId: 10146,
                title: "39",
                type: "DX",
                difficulty: "EXPERT",
                level: "9",
                constant: 9.3,
                fitConstant: 9.48,
                version: "舞萌DX",
                score: null,
                b50: null,
                done: null,
            },
            {
                chartKey: "10146-1",
                musicId: 10146,
                title: "39",
                type: "DX",
                difficulty: "ADVANCED",
                level: "7",
                constant: 7.2,
                fitConstant: 7.324,
                version: "舞萌DX",
                score: null,
                b50: null,
                done: null,
            },
            {
                chartKey: "10146-0",
                musicId: 10146,
                title: "39",
                type: "DX",
                difficulty: "BASIC",
                level: "3",
                constant: 3,
                fitConstant: 3.251,
                version: "舞萌DX",
                score: null,
                b50: null,
                done: null,
            },
        ]);

        const resTsv = await showIn(paths, ["title:5102", "--format", "tsv"]);
        expect(resTsv.code).toBe(0);
        const tsvLines = resTsv.stdout.split("\n");
        expect(tsvLines[0]).toBe(
            "chartKey\tmusicId\ttitle\ttype\tdifficulty\tlevel\tconstant\tfitConstant\tversion\tscore\tb50\tdone"
        );
        expect(tsvLines[1]).toBe("10146-3\t10146\t39\tDX\tMASTER\t12+\t12.8\t12.784\t舞萌DX\t\t\t");

        const resText = await showIn(paths, ["title:5102", "--format", "text"]);
        expect(resText.code).toBe(0);
        expect(resText.stdout.startsWith("chartKey")).toBe(true);
        expect(resText.stdout).toContain("ref: title:5102");
    });

    it("projects the chart rows with --fields and leaves collection and missing whole", async () => {
        const paths = makeHome();
        const whole = await showIn(paths, ["title:5102"]);

        const fields = await showIn(paths, ["title:5102", "--fields", "chartKey,done"]);
        expect(fields.code).toBe(0);
        expect(fields.json.data.items).toEqual([
            { chartKey: "10146-3", done: null },
            { chartKey: "10146-2", done: null },
            { chartKey: "10146-1", done: null },
            { chartKey: "10146-0", done: null },
        ]);
        expect(fields.json.data.collection).toEqual(whole.json.data.collection);
        expect(fields.json.data.missing).toEqual(whole.json.data.missing);

        const withMissing = await showIn(paths, ["plate:409506", "--fields", "chartKey"]);
        expect(withMissing.code).toBe(0);
        expect(withMissing.json.data.items).toEqual([]);
        expect(withMissing.json.data.missing).toEqual([
            { musicId: 11591, title: "ULTRA SYNERGY MATRIX" },
        ]);
        expect(withMissing.json.data.collection.ref).toBe("plate:409506");
        expect(withMissing.json.data.collection.requirements).toHaveLength(1);

        const tsv = await showIn(paths, [
            "title:5102",
            "--fields",
            "chartKey,done",
            "--format",
            "tsv",
        ]);
        expect(tsv.code).toBe(0);
        expect(tsv.stdout).toBe("chartKey\tdone\n10146-3\t\n10146-2\t\n10146-1\t\n10146-0\t\n");

        const unknown = await showIn(paths, ["title:5102", "--fields", "chartKey,nope"]);
        expect(unknown.code).toBe(2);
        expect(unknown.json.error.code).toBe("USAGE");
        expect(unknown.json.error.message).toBe("--fields 里有不存在的字段「nope」");
    });

    it("verifies chart counts and conditions of other chart collections", async () => {
        const paths = makeHome();

        const f109101 = await showIn(paths, ["frame:109101"]);
        expect(f109101.code).toBe(0);
        expect(f109101.json.data.items).toHaveLength(8);
        expect(f109101.json.data.items.map(i => i.chartKey)).toEqual([
            "10191-3",
            "10256-3",
            "10191-2",
            "10256-2",
            "10191-1",
            "10256-1",
            "10191-0",
            "10256-0",
        ]);

        const p6101 = await showIn(paths, ["plate:6101"]);
        expect(p6101.code).toBe(0);
        expect(p6101.json.data.items).toHaveLength(20);
        expect(p6101.json.data.collection.requirements[0].combo).toBe("FC");

        const p6102 = await showIn(paths, ["plate:6102"]);
        expect(p6102.code).toBe(0);
        expect(p6102.json.data.collection.requirements[0].combo).toBe("AP");

        const p6103 = await showIn(paths, ["plate:6103"]);
        expect(p6103.code).toBe(0);
        expect(p6103.json.data.collection.requirements[0].sync).toBe("FDX");

        const p6104 = await showIn(paths, ["plate:6104"]);
        expect(p6104.code).toBe(0);
        expect(p6104.json.data.items).toHaveLength(16);

        const p6105 = await showIn(paths, ["plate:6105"]);
        expect(p6105.code).toBe(0);
        expect(p6105.json.data.collection.requirements[0].rank).toBe("SSS");

        const p6107 = await showIn(paths, ["plate:6107"]);
        expect(p6107.code).toBe(0);
        expect(p6107.json.data.collection.requirements[0].sync).toBe("FDX");
    });

    it("handles collections without charts or with missing songs", async () => {
        const paths = makeHome();

        const t5101 = await showIn(paths, ["title:5101"]);
        expect(t5101.code).toBe(0);
        expect(t5101.json.data.items).toEqual([]);
        expect(t5101.json.meta.page).toEqual({
            total: 0,
            offset: 0,
            limit: 50,
            nextOffset: null,
        });
        expect(t5101.json.data.missing).toEqual([{ musicId: 10125, title: "千本桜" }]);
        expect(t5101.json.data.collection.songCount).toBe(1);

        const p409506 = await showIn(paths, ["plate:409506"]);
        expect(p409506.code).toBe(0);
        expect(p409506.json.data.collection.requirements[0].difficulties).toBeNull();
        expect(p409506.json.data.collection.requirements[0].sync).toBe("FS");
        expect(p409506.json.data.missing).toEqual([
            { musicId: 11591, title: "ULTRA SYNERGY MATRIX" },
        ]);

        const i209502 = await showIn(paths, ["icon:209502"]);
        expect(i209502.code).toBe(0);
        expect(i209502.json.data.missing).toEqual([
            { musicId: 11296, title: "とびだせ！TO THE COSMIC!!" },
            { musicId: 11375, title: "ミルキースター・シューティングスター" },
        ]);
        expect(i209502.json.data.collection.requirements[0]).toEqual({
            difficulties: null,
            rank: null,
            combo: null,
            sync: null,
            songCount: 2,
        });

        const t458582 = await showIn(paths, ["title:458582"]);
        expect(t458582.code).toBe(0);
        expect(t458582.json.data.collection.requirements).toHaveLength(2);
        expect(t458582.json.data.missing).toEqual([{ musicId: 11663, title: "系ぎて" }]);

        const t1 = await showIn(paths, ["title:1"]);
        expect(t1.code).toBe(0);
        expect(t1.json.data.collection.requirements).toEqual([]);
        expect(t1.json.data.collection.songCount).toBe(0);
        expect(t1.json.data.missing).toEqual([]);
        expect(t1.json.data.items).toEqual([]);

        const char101 = await showIn(paths, ["character:101"]);
        expect(char101.code).toBe(0);
        expect(char101.json.data.collection.kind).toBe("character");
        expect(char101.json.data.collection.requirements).toEqual([]);
        expect(char101.json.data.missing).toEqual([]);
        expect(char101.json.data.items).toEqual([]);

        const part1 = await showIn(paths, ["partner:1"]);
        expect(part1.code).toBe(0);
        expect(part1.json.data.collection.kind).toBe("partner");
        expect(part1.json.data.collection.genre).toBeNull();
        expect(part1.json.data.collection.requirements).toEqual([]);
        expect(part1.json.data.missing).toEqual([]);
        expect(part1.json.data.items).toEqual([]);
    });

    it("resolves references by name or ref and fails on ambiguous, not found, or missing arguments", async () => {
        const paths = makeHome();

        const byNameHasha = await showIn(paths, ["覇者"]);
        expect(byNameHasha.code).toBe(0);
        expect(byNameHasha.json.data.collection.ref).toBe("plate:6148");

        const byNameZhenji = await showIn(paths, ["真極"]);
        expect(byNameZhenji.code).toBe(0);
        expect(byNameZhenji.json.data.collection.ref).toBe("plate:6101");

        const byMixedCase1 = await showIn(paths, ["Plate:6148"]);
        expect(byMixedCase1.code).toBe(0);
        expect(byMixedCase1.json.data.collection.ref).toBe("plate:6148");

        const byMixedCase2 = await showIn(paths, ["PLATE:6148"]);
        expect(byMixedCase2.code).toBe(0);
        expect(byMixedCase2.json.data.collection.ref).toBe("plate:6148");

        // Partial name does not match
        const partialName = await showIn(paths, ["覇"]);
        expect(partialName.code).toBe(3);
        expect(partialName.json.error.code).toBe("NOT_FOUND");

        // Ambiguous names fail with candidates and cost no catalog download
        const pathsAmbiguous1 = makeHome();
        const ambiguousDef = await showIn(pathsAmbiguous1, ["デフォルト"]);
        expect(ambiguousDef.code).toBe(3);
        expect(ambiguousDef.json.error.code).toBe("AMBIGUOUS_REF");
        expect(ambiguousDef.json.error.candidates?.map(c => c.ref)).toEqual([
            "plate:1",
            "icon:1",
            "frame:1",
        ]);
        expect(ambiguousDef.requests.map(r => r.url).sort()).toEqual(
            [...EXPECTED_LXNS_REQUESTS].sort()
        );

        const pathsAmbiguous2 = makeHome();
        const ambiguousRandom = await showIn(pathsAmbiguous2, ["从整体中随机选择"]);
        expect(ambiguousRandom.code).toBe(3);
        expect(ambiguousRandom.json.error.code).toBe("AMBIGUOUS_REF");
        expect(ambiguousRandom.json.error.candidates).toHaveLength(4);
        expect(ambiguousRandom.requests.map(r => r.url).sort()).toEqual(
            [...EXPECTED_LXNS_REQUESTS].sort()
        );

        const pathsNotFound = makeHome();
        const notFoundNope = await showIn(pathsNotFound, ["nope"]);
        expect(notFoundNope.code).toBe(3);
        expect(notFoundNope.json.error.code).toBe("NOT_FOUND");
        expect(notFoundNope.requests.map(r => r.url).sort()).toEqual(
            [...EXPECTED_LXNS_REQUESTS].sort()
        );

        const notFoundPlate = await showIn(paths, ["plate:99999"]);
        expect(notFoundPlate.code).toBe(3);
        expect(notFoundPlate.json.error.code).toBe("NOT_FOUND");
        expect(notFoundPlate.json.error.message).toContain("plate:99999");

        const notFoundTitleName = await showIn(paths, ["title:5102x"]);
        expect(notFoundTitleName.code).toBe(3);
        expect(notFoundTitleName.json.error.code).toBe("NOT_FOUND");

        const noArg = await showIn(paths, []);
        expect(noArg.code).toBe(2);
        expect(noArg.json.error.code).toBe("USAGE");
        expect(noArg.json.error.message).toBe("缺少参数 <收藏品>");
        expect(noArg.requests).toEqual([]);

        const limitZero = await showIn(paths, ["plate:6148", "--limit", "0"]);
        expect(limitZero.code).toBe(2);
        expect(limitZero.json.error.code).toBe("USAGE");
    });

    it("shares cache between list and show, and handles offline mode", async () => {
        const paths = makeHome();

        const listRes = await listIn(paths, ["--limit", "1"]);
        expect(listRes.code).toBe(0);
        expect(listRes.requests.map(r => r.url).sort()).toEqual([...EXPECTED_LXNS_REQUESTS].sort());

        // Collections already cached: only catalog is downloaded
        const showRes = await showIn(paths, ["plate:6148"]);
        expect(showRes.code).toBe(0);
        expect(showRes.requests.map(r => r.url)).toEqual([META_URL]);
        expect(showRes.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(NOW),
            collections: formatLocalTime(NOW),
        });

        // Third run offline succeeds with no requests
        const offlineRes = await showIn(paths, ["plate:6148", "--offline"]);
        expect(offlineRes.code).toBe(0);
        expect(offlineRes.requests).toEqual([]);

        // Offline on empty data directory fails
        const freshPaths1 = makeHome();
        const offlineEmpty = await showIn(freshPaths1, ["plate:6148", "--offline"]);
        expect(offlineEmpty.code).toBe(5);
        expect(offlineEmpty.json.error.code).toBe("OFFLINE_NO_CACHE");

        // Offline after only list fails with message mentioning 曲库（SaltMeta）
        const freshPaths2 = makeHome();
        await listIn(freshPaths2, ["--limit", "1"]);
        const offlineNoCatalog = await showIn(freshPaths2, ["plate:6148", "--offline"]);
        expect(offlineNoCatalog.code).toBe(5);
        expect(offlineNoCatalog.json.error.code).toBe("OFFLINE_NO_CACHE");
        expect(offlineNoCatalog.json.error.message).toContain("曲库（SaltMeta）");
    });

    it("handles stale metadata warnings for both sources and collections only", async () => {
        // Both stale
        const paths1 = makeHome();
        const first = await showIn(paths1, ["plate:6148"]);
        expect(first.code).toBe(0);

        const later30Days = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
        const bothStale = await showIn(paths1, ["plate:6148"], { now: later30Days, network: {} });
        expect(bothStale.code).toBe(0);
        expect(bothStale.json.warnings.map(w => w.code)).toEqual([
            "STALE_METADATA",
            "STALE_METADATA",
        ]);
        expect(bothStale.json.warnings[0].message).toContain("曲库（SaltMeta）");
        expect(bothStale.json.warnings[1].message).toContain("收藏品（落雪）");
        expect(bothStale.json.data.items).toEqual(first.json.data.items);
        expect(bothStale.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(NOW),
            collections: formatLocalTime(NOW),
        });

        // Only collections stale
        const paths2 = makeHome();
        await listIn(paths2, ["--limit", "1"]);

        const time20h = new Date(NOW.getTime() + 20 * 60 * 60 * 1000);
        const show20h = await showIn(paths2, ["plate:6148"], { now: time20h });
        expect(show20h.code).toBe(0);
        expect(show20h.json.warnings).toEqual([]);
        expect(show20h.json.meta.dataAsOf).toEqual({
            catalog: formatLocalTime(time20h),
            collections: formatLocalTime(NOW),
        });

        const time30h = new Date(NOW.getTime() + 30 * 60 * 60 * 1000);
        const staleCollectionsOnly = await showIn(paths2, ["plate:6148"], {
            now: time30h,
            network: {},
        });
        expect(staleCollectionsOnly.code).toBe(0);
        expect(staleCollectionsOnly.json.warnings).toHaveLength(1);
        expect(staleCollectionsOnly.json.warnings[0].code).toBe("STALE_METADATA");
        expect(staleCollectionsOnly.json.warnings[0].message).toContain("收藏品（落雪）");
    });
});
