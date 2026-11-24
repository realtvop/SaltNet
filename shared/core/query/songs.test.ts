import type { VersionPlate, VersionPlateCategory } from "../collection/type";
import type { Course } from "../course";
import type { Chart, ChartScore } from "../music/type";
import type { SongsFavoriteList, SongsGroupBy, SongsVersionGroupBy } from "./songs";
import { describe, expect, it } from "vitest";
import { formatScoreChangedAt } from "../chart/recent";
import { CollectionKind } from "../collection/type";
import { createFixtureMusicList } from "../fixtures/saltmeta";
import { ComboStatus, getRankRateByAchievement, SyncStatus } from "../mai/types";
import MusicSort from "../music/sort.json";
import {
    addChartPositionIndexes,
    addQueriedPositionIndexes,
    countChartStats,
    createGameOrderComparator,
    createPlayedFirstComparator,
    filterChartsForCategory,
    groupCharts,
    searchCharts,
    SongsCategory,
} from "./songs";

/*
 * Snapshot tests for the songs-page query helpers. They chain the helpers the way the songs page
 * does (filter, position indexes, search, queried indexes, grouping and statistics) on fixed data:
 * the trimmed SaltMeta fixture plus synthetic scores from a seeded generator. The snapshots record
 * what the page showed when the helpers were extracted from it. They were not changed when the
 * helpers moved to shared/core; search snapshots now also record intentional relevance ordering.
 */

// MARK: fixed data

/**
 * mulberry32, a tiny seeded generator, so the synthetic scores are identical on every machine.
 * The increment is its usual 0x6D2B79F5, written in decimal because Prettier and the ESLint
 * number-literal-case rule disagree about the case of hexadecimal digits.
 */
function createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 1831565813) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

const ACHIEVEMENTS = [
    101, 100.5, 100.5, 100, 100, 99.9876, 99.5, 99, 98.2, 97, 96.1, 94, 93.25, 90, 85.5, 80, 75,
    60.1, 50, 12.5, 0,
];
const COMBOS = [
    ComboStatus.None,
    ComboStatus.None,
    ComboStatus.None,
    ComboStatus.FullCombo,
    ComboStatus.FullComboPlus,
    ComboStatus.AllPerfect,
    ComboStatus.AllPerfectPlus,
];
const SYNCS = [
    SyncStatus.None,
    SyncStatus.None,
    SyncStatus.Sync,
    SyncStatus.FullSync,
    SyncStatus.FullSyncPlus,
    SyncStatus.FullSyncDX,
    SyncStatus.FullSyncDXPlus,
];
const CHANGE_TIMES = [
    0, 1_700_000_000_000, 1_700_000_000_000, 1_700_086_400_000, 1_700_172_800_000,
    1_690_000_000_000,
];

let nextCollectionId = 1;
function makePlate(
    category: VersionPlateCategory,
    name: string,
    required: VersionPlate["required"]
): VersionPlate {
    return {
        type: CollectionKind.Plate,
        id: nextCollectionId++,
        name,
        description: `${name} plate`,
        genre: "",
        category,
        required,
    };
}

function buildFixture() {
    const random = createRandom(20261110);
    function pick<T>(items: readonly T[]): T {
        return items[Math.floor(random() * items.length)] as T;
    }

    const { chartList, musicList } = createFixtureMusicList();
    const sourceCharts = Object.values(chartList);

    // What the user's detailed data holds per chart. A record can exist without producing a score
    // on the chart (no achievement, or combo/sync/rank fields missing), and the played-first sort
    // reads the records, not the scores.
    const records = new Map<number, { achievements: number | null }>();
    const unsorted: Chart[] = [];
    for (const chart of sourceCharts) {
        if (random() < 0.5) {
            unsorted.push({ ...chart, score: undefined });
            continue;
        }

        const achievements = pick(ACHIEVEMENTS);
        const score: ChartScore = {
            achievements,
            comboStatus: pick(COMBOS),
            syncStatus: pick(SYNCS),
            rankRate: getRankRateByAchievement(achievements),
            deluxeRating: Math.floor(random() * 300),
            deluxeScore: Math.floor(random() * 2000),
            playCount: Math.floor(random() * 90),
            lastChangedAt: pick(CHANGE_TIMES),
        };
        const roll = random();
        if (roll < 0.04) {
            records.set(chart.id, { achievements: null });
            unsorted.push({ ...chart, score: undefined });
        } else if (roll < 0.08) {
            records.set(chart.id, { achievements });
            unsorted.push({ ...chart, score: undefined });
        } else {
            records.set(chart.id, { achievements });
            unsorted.push({ ...chart, score });
        }
    }
    // null is bad data the comparator must tolerate, so the lookup is typed loosely on purpose
    const findScore = (chart: Chart) =>
        records.get(chart.id) as { achievements: number } | undefined;

    // #region page-sort
    // The page sorts its chart list in place: game order first, then played charts to the front.
    const sorted = [...unsorted];
    sorted.sort(createGameOrderComparator(MusicSort));
    const gameOrdered = [...sorted];
    sorted.sort(createPlayedFirstComparator(findScore));
    // #endregion page-sort

    const nonUtageMusics = Object.values(musicList).filter(music => music.id < 100000);
    function songs(from: number, to: number) {
        return nonUtageMusics.slice(from, to).map(music => ({
            id: music.id >= 10000 ? music.id - 10000 : music.id,
            title: music.info.title,
            type: music.id >= 10000 ? ("dx" as const) : ("standard" as const),
        }));
    }
    const versionPlates: Record<VersionPlateCategory, VersionPlate[]> = {
        極: [
            makePlate("極", "極A", [
                { difficulties: [3, 4], fc: ComboStatus.FullCombo, songs: songs(0, 14) },
            ]),
            makePlate("極", "極B", [
                { difficulties: [3, 4], fc: ComboStatus.FullCombo, songs: songs(0, 14) },
            ]),
            makePlate("極", "極C", [
                { difficulties: [3], fc: ComboStatus.FullCombo, songs: songs(5, 20) },
                { difficulties: [4], fc: ComboStatus.AllPerfect, songs: songs(10, 16) },
            ]),
            makePlate("極", "極D", [{ fc: ComboStatus.FullCombo, songs: songs(0, 30) }]),
            makePlate("極", "極E", []),
            makePlate("極", "極F", undefined),
        ],
        将: [
            makePlate("将", "将A", [
                {
                    difficulties: [0, 1, 2, 3],
                    rate: getRankRateByAchievement(100),
                    songs: songs(0, 20),
                },
            ]),
            makePlate("将", "将B", [
                { difficulties: [3], rate: getRankRateByAchievement(100.5), songs: songs(8, 30) },
            ]),
            makePlate("将", "将C", [{ songs: songs(0, 12) }]),
        ],
        神: [
            makePlate("神", "神A", [
                { difficulties: [0, 1, 2, 3, 4], fc: ComboStatus.AllPerfect, songs: songs(0, 25) },
            ]),
            makePlate("神", "神B", [
                { difficulties: [3, 4], fc: ComboStatus.AllPerfectPlus, songs: songs(3, 18) },
            ]),
        ],
        舞舞: [
            makePlate("舞舞", "舞A", [
                { difficulties: [0, 1, 2, 3, 4], fs: SyncStatus.FullSyncDX, songs: songs(0, 25) },
            ]),
            makePlate("舞舞", "舞B", [
                { difficulties: [2, 3], fs: SyncStatus.FullSync, songs: songs(2, 22) },
            ]),
        ],
    };

    const nonUtageCharts = sourceCharts.filter(chart => chart.music.id < 100000);
    function track(index: number) {
        const chart = nonUtageCharts[index] as Chart;
        return {
            musicId: chart.music.id,
            title: chart.music.info.title,
            difficulty: chart.info.grade,
        };
    }
    const life = { initial: 100, recovery: 2, damage: { perfect: 0, great: 2, good: 3, miss: 5 } };
    function makeCourse(id: number, name: string, tracks: Course["tracks"]): Course {
        return {
            id,
            name,
            mode: { id: 0, name: "fixture" },
            baseDaniId: 0,
            isLocked: false,
            unlockCourseId: 0,
            tracks,
            life,
        };
    }
    const courses = [
        makeCourse(1, "课程A", [track(3), track(40), track(77), track(120)]),
        // the second track names a song that does not exist, which the course skips
        makeCourse(2, "课程B", [
            track(9),
            { musicId: 999999, title: "ghost", difficulty: 3 },
            track(60),
        ]),
        makeCourse(3, "课程空", []),
    ];

    const favoriteMusicIds = nonUtageMusics.slice(0, 18).map(music => music.id);
    const favorites: SongsFavoriteList[] = [
        { name: "fav-a", charts: favoriteMusicIds.map(i => ({ i })) },
        // a repeated music and one that does not exist
        {
            name: "fav-b",
            charts: [
                { i: favoriteMusicIds[1] as number },
                { i: favoriteMusicIds[1] as number },
                { i: 999999 },
            ],
        },
        { name: "fav-empty", charts: [] },
    ];

    // Version names, oldest first. The newest is left out on purpose so that the "version unknown
    // to the list" fallback of the grouping is covered too.
    const versionsByAppearance: string[] = [];
    for (const music of Object.values(musicList)) {
        const from = music.info.from as unknown as string;
        if (!versionsByAppearance.includes(from)) versionsByAppearance.push(from);
    }
    const versions = versionsByAppearance.slice(0, -1);

    return {
        charts: sorted,
        gameOrdered,
        unsorted,
        findScore,
        versionPlates,
        courses,
        favorites,
        versions,
    };
}

type Fixture = ReturnType<typeof buildFixture>;
const fixture = buildFixture();

// MARK: the page's chain of helpers

interface PageQuery {
    category: SongsCategory | VersionPlateCategory;
    tab: string;
    difficultyFilter?: number;
    plateSort?: string;
    query?: string;
    groupBy?: SongsGroupBy;
    versionGroupBy?: SongsVersionGroupBy;
}

// #region page-compose
function runPage(data: Fixture, request: PageQuery) {
    const { category, tab } = request;
    const groupBy = request.groupBy ?? "none";
    const selectedCourse =
        category === SongsCategory.Course
            ? (data.courses.find(course => course.name === tab) ?? null)
            : null;

    const filtered = filterChartsForCategory({
        charts: data.charts,
        category,
        selectedTab: tab,
        difficultyFilter: request.difficultyFilter ?? 3,
        favorites: data.favorites,
        selectedCourse,
        versionPlates: data.versionPlates,
        plateSort: request.plateSort ?? "condition",
    });
    const positioned = addChartPositionIndexes(data.charts, filtered);
    const searched = searchCharts(positioned, request.query ?? "");
    const shown = addQueriedPositionIndexes(searched, filtered.length);
    const groups = groupCharts({
        charts: shown,
        category,
        selectedTab: tab,
        groupBy,
        versionGroupBy: request.versionGroupBy ?? "none",
        versions: data.versions,
    });
    const overall =
        groupBy === "none" && category === SongsCategory.InGame && shown.length > 0
            ? countChartStats(shown)
            : null;

    return { total: filtered.length, shown, groups, overall };
}
// #endregion page-compose

// MARK: readable digests for the snapshots

function wrapRows(items: string[], perRow: number): string[] {
    const rows: string[] = [];
    for (let start = 0; start < items.length; start += perRow) {
        rows.push(`  ${items.slice(start, start + perRow).join(" ")}`);
    }
    return rows;
}

/** `id[allIndex/difficultIndex/queriedIndex]`, the three positions the cards show. */
function describePlacement(chart: Chart): string {
    const index = chart.score?.index;
    return `${chart.id}[${index?.all.index}/${index?.difficult.index}/${index?.queried?.index}]`;
}

function describeScore(chart: Chart): string {
    const score = chart.score;
    return [
        chart.id,
        chart.music.info.title,
        chart.info.level,
        score?.achievements ?? "-",
        score?.rankRate || "-",
        score?.comboStatus || "-",
        score?.syncStatus || "-",
        score?.deluxeScore,
        score?.deluxeRating,
        score?.playCount ?? "-",
        score?.lastChangedAt ?? "-",
    ].join(" ");
}

function describeTotals(charts: Chart[]): string {
    const unique = (values: Array<number | undefined>) => [...new Set(values)].join(",");
    return `totals all=${unique(charts.map(chart => chart.score?.index?.all.total))} difficult=${unique(charts.map(chart => chart.score?.index?.difficult.total))} queried=${unique(charts.map(chart => chart.score?.index?.queried?.total))}`;
}

function describeRun(request: PageQuery, run: ReturnType<typeof runPage>): string {
    const lines = [
        `${request.category} / ${request.tab}: filter ${request.difficultyFilter ?? 3}, plate sort ${request.plateSort ?? "condition"}, search "${request.query ?? ""}", group ${request.groupBy ?? "none"}, version group ${request.versionGroupBy ?? "none"}`,
        `shown ${run.shown.length} of ${run.total}`,
    ];

    if (run.shown.length > 0) {
        lines.push(describeTotals(run.shown));
        lines.push("placement:", ...wrapRows(run.shown.map(describePlacement), 8));
        lines.push(
            "first rows:",
            ...run.shown.slice(0, 3).map(chart => `  ${describeScore(chart)}`)
        );
    }

    if (run.groups) {
        // the recent tab titles its groups with local-time text, which depends on the machine's time
        // zone; the snapshot keeps the timestamp and the title is checked against it directly
        const isRecent = request.category === SongsCategory.InGame && request.tab === "最近";
        lines.push(`groups: ${run.groups.length}`);
        for (const group of run.groups) {
            const changedAt = group.items[0]?.score?.lastChangedAt ?? 0;
            if (isRecent) expect(group.title).toBe(formatScoreChangedAt(changedAt));
            const name = isRecent ? `changed at ${changedAt}` : `"${group.title}"`;
            const { sss, sssp, fc, ap, fsdx } = group.stats;
            lines.push(
                `  ${name} x${group.count}: sss ${sss}, sss+ ${sssp}, fc ${fc}, ap ${ap}, fsdx ${fsdx}`,
                ...wrapRows(
                    group.items.map(chart => String(chart.id)),
                    12
                ).map(row => `  ${row}`)
            );
        }
    } else {
        lines.push("groups: none");
    }

    lines.push(run.overall ? `overall: ${JSON.stringify(run.overall)}` : "overall: none");
    return lines.join("\n");
}

function snapshotScenario(request: PageQuery) {
    expect(describeRun(request, runPage(fixture, request))).toMatchSnapshot();
}

// MARK: fixed data, ordering

describe("fixed data", () => {
    it("is shaped as the snapshots expect", () => {
        const byGrade = new Map<number, number>();
        for (const chart of fixture.charts) {
            byGrade.set(chart.info.grade, (byGrade.get(chart.info.grade) ?? 0) + 1);
        }
        const records = fixture.charts.map(chart => fixture.findScore(chart));
        const played = fixture.charts.filter(chart => chart.score).length;
        const withRecord = records.filter(record => record).length;
        const withoutAchievement = records.filter(
            record => record && typeof record.achievements !== "number"
        ).length;
        const changed = fixture.charts.filter(
            chart => (chart.score?.lastChangedAt ?? 0) > 0
        ).length;

        expect({
            charts: fixture.charts.length,
            byGrade: Object.fromEntries([...byGrade].sort(([a], [b]) => a - b)),
            played,
            withRecord,
            withoutAchievement,
            changed,
            versions: fixture.versions.length,
        }).toMatchSnapshot();
    });
});

describe("default order", () => {
    it("orders charts the way the game lists them", () => {
        expect(
            wrapRows(
                fixture.gameOrdered.map(chart => String(chart.id)),
                12
            ).join("\n")
        ).toMatchSnapshot();
    });

    it("moves played charts to the front, best achievement first", () => {
        expect(
            wrapRows(
                fixture.charts.map(chart => String(chart.id)),
                12
            ).join("\n")
        ).toMatchSnapshot();
    });
});

describe("game order comparator", () => {
    function stub(musicId: number, grade: number) {
        return {
            id: musicId * 100 + grade,
            info: { grade },
            music: { id: musicId },
        } as unknown as Chart;
    }

    it("sorts by grade, then by the music's place in the sort list, both descending", () => {
        const charts = [stub(10, 3), stub(30, 3), stub(20, 4), stub(20, 3), stub(10, 4)];
        charts.sort(createGameOrderComparator([10, 20, 30]));
        expect(charts.map(chart => chart.id)).toEqual([2004, 1004, 3003, 2003, 1003]);
    });

    it("puts music missing from the sort list below every listed music of its grade", () => {
        const charts = [stub(99, 3), stub(10, 3), stub(20, 3), stub(30, 3)];
        charts.sort(createGameOrderComparator([10, 20, 30]));
        expect(charts.map(chart => chart.id)).toEqual([3003, 2003, 1003, 9903]);
    });

    it("keeps charts that compare equal in their input order", () => {
        const charts = [stub(98, 3), stub(99, 3), stub(97, 3)];
        charts.sort(createGameOrderComparator([10]));
        expect(charts.map(chart => chart.id)).toEqual([9803, 9903, 9703]);
    });
});

describe("played-first comparator", () => {
    function stub(id: number) {
        return { id } as unknown as Chart;
    }

    it("puts numeric achievements first, best first, and keeps the others in order", () => {
        const records = new Map<number, { achievements: number | null }>([
            [1, { achievements: 95 }],
            [2, { achievements: null }],
            [4, { achievements: 99 }],
            [5, { achievements: 95 }],
            [6, { achievements: 0 }],
        ]);
        const find = (chart: Chart) =>
            records.get(chart.id) as { achievements: number } | undefined;
        // chart 3 has no record at all
        const charts = [stub(3), stub(1), stub(2), stub(4), stub(5), stub(6)];

        charts.sort(createPlayedFirstComparator(find));

        expect(charts.map(chart => chart.id)).toEqual([4, 1, 5, 6, 3, 2]);
    });

    it("changes nothing when no chart has been played", () => {
        const charts = [stub(3), stub(1), stub(2)];
        charts.sort(createPlayedFirstComparator(() => undefined));
        expect(charts.map(chart => chart.id)).toEqual([3, 1, 2]);
    });
});

// MARK: filtering, indexes and search

describe("in-game difficulty tabs", () => {
    const InGame = SongsCategory.InGame;
    const scenarios: Array<[string, PageQuery]> = [
        [
            "all tab shows the selected grade: master",
            { category: InGame, tab: "ALL", difficultyFilter: 3 },
        ],
        [
            "all tab shows the selected grade: re:master",
            { category: InGame, tab: "ALL", difficultyFilter: 4 },
        ],
        [
            "all tab shows the selected grade: basic",
            { category: InGame, tab: "ALL", difficultyFilter: 0 },
        ],
        [
            "all tab shows the selected grade: utage",
            { category: InGame, tab: "ALL", difficultyFilter: 10 },
        ],
        [
            "all tab ignores the group setting",
            { category: InGame, tab: "ALL", difficultyFilter: 3, groupBy: "rank" },
        ],
        ["level tab: 13", { category: InGame, tab: "13" }],
        ["level tab: 13+", { category: InGame, tab: "13+" }],
        ["level tab without charts", { category: InGame, tab: "99" }],
        ["level tab grouped by constant", { category: InGame, tab: "12+", groupBy: "constant" }],
        ["level tab grouped by version", { category: InGame, tab: "13", groupBy: "version" }],
        ["level tab grouped by rank", { category: InGame, tab: "12+", groupBy: "rank" }],
        ["level tab grouped by combo", { category: InGame, tab: "12+", groupBy: "combo" }],
        ["level tab grouped by sync", { category: InGame, tab: "12+", groupBy: "sync" }],
        ["recent tab groups by change time", { category: InGame, tab: "最近" }],
        [
            "recent tab ignores the group setting",
            { category: InGame, tab: "最近", groupBy: "rank" },
        ],
    ];

    for (const [title, request] of scenarios) {
        it(title, () => snapshotScenario(request));
    }
});

describe("search", () => {
    const InGame = SongsCategory.InGame;
    const scenarios: Array<[string, PageQuery]> = [
        ["title fragment matches several songs", { category: InGame, tab: "ALL", query: "link" }],
        ["title match ignores case", { category: InGame, tab: "ALL", query: "TRUST" }],
        ["numeric title", { category: InGame, tab: "ALL", query: "39" }],
        ["music id matches exactly", { category: InGame, tab: "ALL", query: "8" }],
        ["romaji of a kana title", { category: InGame, tab: "ALL", query: "neko" }],
        ["kana title through its kanji", { category: InGame, tab: "ALL", query: "猫" }],
        [
            "simplified chinese finds the japanese form",
            { category: InGame, tab: "ALL", query: "脑浆" },
        ],
        ["short fragment matches many songs", { category: InGame, tab: "ALL", query: "ya" }],
        ["achievement text", { category: InGame, tab: "ALL", query: "100" }],
        ["combo status text", { category: InGame, tab: "ALL", query: "fc" }],
        ["sync status text", { category: InGame, tab: "ALL", query: "fs" }],
        ["no match", { category: InGame, tab: "ALL", query: "zzz" }],
        [
            "search inside a level tab keeps the unsearched total",
            { category: InGame, tab: "13", query: "fc" },
        ],
        [
            "search combined with grouping",
            { category: InGame, tab: "12+", groupBy: "rank", query: "fc" },
        ],
        ["search inside the recent tab", { category: InGame, tab: "最近", query: "ya" }],
    ];

    for (const [title, request] of scenarios) {
        it(title, () => snapshotScenario(request));
    }
});

describe("other categories", () => {
    const scenarios: Array<[string, PageQuery]> = [
        ["banquet: all tab", { category: SongsCategory.Banquet, tab: "ALL" }],
        ["banquet: a level", { category: SongsCategory.Banquet, tab: "14+?" }],
        [
            "banquet: ignores grouping",
            {
                category: SongsCategory.Banquet,
                tab: "ALL",
                groupBy: "rank",
                versionGroupBy: "rank",
            },
        ],
        ["version: plain", { category: SongsCategory.Version, tab: "maimai" }],
        [
            "version: grouped by level",
            { category: SongsCategory.Version, tab: "maimai", versionGroupBy: "level" },
        ],
        [
            "version: grouped by difficulty",
            {
                category: SongsCategory.Version,
                tab: "maimai",
                difficultyFilter: 4,
                versionGroupBy: "difficulty",
            },
        ],
        [
            "version: grouped by rank",
            { category: SongsCategory.Version, tab: "maimai PLUS", versionGroupBy: "rank" },
        ],
        [
            "version: grouped by combo",
            { category: SongsCategory.Version, tab: "maimai PLUS", versionGroupBy: "combo" },
        ],
        [
            "version: grouped by sync",
            { category: SongsCategory.Version, tab: "舞萌DX 2025", versionGroupBy: "sync" },
        ],
        [
            "version: utage grade",
            {
                category: SongsCategory.Version,
                tab: "舞萌DX 2024",
                difficultyFilter: 10,
                versionGroupBy: "level",
            },
        ],
        ["version: unknown version", { category: SongsCategory.Version, tab: "not a version" }],
        ["favorites: a list", { category: SongsCategory.Favorite, tab: "fav-a" }],
        [
            "favorites: another grade",
            { category: SongsCategory.Favorite, tab: "fav-a", difficultyFilter: 4 },
        ],
        [
            "favorites: grouped by level",
            { category: SongsCategory.Favorite, tab: "fav-a", versionGroupBy: "level" },
        ],
        [
            "favorites: grouped by rank with a search",
            { category: SongsCategory.Favorite, tab: "fav-a", versionGroupBy: "rank", query: "fc" },
        ],
        [
            "favorites: repeated and unknown songs",
            { category: SongsCategory.Favorite, tab: "fav-b" },
        ],
        ["favorites: empty list", { category: SongsCategory.Favorite, tab: "fav-empty" }],
        ["favorites: unknown list", { category: SongsCategory.Favorite, tab: "fav-missing" }],
        [
            "kaleidxscope has no chart list",
            { category: SongsCategory.Kaleidxscope, tab: "1", query: "a" },
        ],
        ["course: charts in play order", { category: SongsCategory.Course, tab: "课程A" }],
        ["course: skips tracks without a chart", { category: SongsCategory.Course, tab: "课程B" }],
        ["course: without tracks", { category: SongsCategory.Course, tab: "课程空" }],
        ["course: unknown course", { category: SongsCategory.Course, tab: "missing-course" }],
        ["course: with a search", { category: SongsCategory.Course, tab: "课程A", query: "true" }],
        [
            "unknown category",
            { category: "unknown" as VersionPlateCategory, tab: "whatever", query: "a" },
        ],
    ];

    for (const [title, request] of scenarios) {
        it(title, () => snapshotScenario(request));
    }
});

describe("version plates", () => {
    const sorts = ["condition", "constant-desc", "constant-asc"];
    const scenarios: Array<[string, PageQuery]> = [];
    for (const [category, tab] of [
        ["極", "極A"],
        ["将", "将A"],
        ["神", "神A"],
        ["舞舞", "舞A"],
    ] as const) {
        for (const plateSort of sorts) {
            scenarios.push([`${tab} sorted by ${plateSort}`, { category, tab, plateSort }]);
        }
    }
    scenarios.push(
        ["plate with several requirements", { category: "極", tab: "極C" }],
        [
            "plate without difficulty restriction",
            { category: "極", tab: "極D", plateSort: "constant-desc" },
        ],
        ["plate with an empty requirement list", { category: "極", tab: "極E" }],
        ["plate without requirements", { category: "極", tab: "極F" }],
        ["plate whose requirement names no difficulty", { category: "将", tab: "将C" }],
        [
            "a second plate of the same category",
            { category: "将", tab: "将B", plateSort: "constant-asc" },
        ],
        ["plate with a search", { category: "神", tab: "神B", query: "fc" }],
        [
            "an unknown sort falls back to the condition order",
            { category: "舞舞", tab: "舞B", plateSort: "something else" },
        ],
        ["unknown plate", { category: "極", tab: "no such plate" }],
        [
            "plates ignore grouping",
            { category: "極", tab: "極A", groupBy: "rank", versionGroupBy: "rank" },
        ]
    );

    for (const [title, request] of scenarios) {
        it(title, () => snapshotScenario(request));
    }
});

describe("page results", () => {
    it("shows nothing before any chart is loaded", () => {
        const empty = { ...fixture, charts: [] as Chart[] };
        const run = runPage(empty, { category: SongsCategory.InGame, tab: "ALL" });
        expect(run.shown).toEqual([]);
        expect(run.total).toBe(0);
        expect(run.groups).toBeNull();
        expect(run.overall).toBeNull();
    });

    it("does not reorder or modify the shared chart list", () => {
        const before = JSON.stringify(fixture.charts.map(chart => [chart.id, chart.score]));
        for (const category of ["極", "将", "神", "舞舞"] as const) {
            for (const plateSort of ["condition", "constant-desc", "constant-asc"]) {
                runPage(fixture, {
                    category,
                    tab: fixture.versionPlates[category][0]?.name ?? "",
                    plateSort,
                });
            }
        }
        runPage(fixture, { category: SongsCategory.InGame, tab: "最近" });
        runPage(fixture, {
            category: SongsCategory.InGame,
            tab: "13",
            query: "a",
            groupBy: "rank",
        });
        expect(JSON.stringify(fixture.charts.map(chart => [chart.id, chart.score]))).toBe(before);
    });
});

// MARK: position indexes

describe("position indexes", () => {
    function stub(id: number, grade: number, score?: Partial<ChartScore>) {
        return {
            id,
            info: { grade },
            music: { id },
            score: score as ChartScore | undefined,
        } as unknown as Chart;
    }

    it("counts down from the number of charts of the same grade and from the filtered size", () => {
        const a = stub(1, 3);
        const b = stub(2, 3);
        const c = stub(3, 3);
        const d = stub(4, 4);

        const positioned = addChartPositionIndexes([a, b, c, d], [c, a]);

        expect(positioned.map(chart => chart.score.index)).toEqual([
            { all: { index: 1, total: 3 }, difficult: { index: 2, total: 2 } },
            { all: { index: 3, total: 3 }, difficult: { index: 1, total: 2 } },
        ]);
    });

    it("gives unplayed charts an empty score and keeps the score of played ones", () => {
        const played = stub(1, 3, { achievements: 99.5, comboStatus: ComboStatus.FullCombo });
        const unplayed = stub(2, 3);

        const [first, second] = addChartPositionIndexes([played, unplayed], [played, unplayed]);

        expect(first?.score).toMatchObject({
            achievements: 99.5,
            comboStatus: ComboStatus.FullCombo,
        });
        expect(second?.score).toMatchObject({
            rankRate: "",
            achievements: null,
            comboStatus: "",
            syncStatus: "",
            deluxeScore: 0,
            deluxeRating: 0,
        });
    });

    it("places a grade outside the known ones at 0 of 0", () => {
        const odd = stub(1, 7);
        const [positioned] = addChartPositionIndexes([odd], [odd]);
        expect(positioned?.score.index?.all).toEqual({ index: 0, total: 0 });
    });

    it("counts the queried position from the size before the search", () => {
        const a = stub(1, 3);
        const b = stub(2, 3);
        const positioned = addChartPositionIndexes([a, b], [a, b]);

        const queried = addQueriedPositionIndexes(positioned, 10);

        expect(queried.map(chart => chart.score.index?.queried)).toEqual([
            { index: 10, total: 10 },
            { index: 9, total: 10 },
        ]);
        expect(queried.map(chart => chart.score.index?.all)).toEqual(
            positioned.map(chart => chart.score.index?.all)
        );
    });
});

// MARK: statistics and grouping

describe("statistics", () => {
    function scored(score: Partial<ChartScore> | undefined) {
        return { score } as unknown as Chart;
    }

    it("counts the rank, combo and sync milestones", () => {
        const charts = [
            scored({ achievements: 100.5 }),
            scored({ achievements: 100.4999 }),
            scored({ achievements: 100 }),
            scored({ achievements: 99.9999 }),
            scored({ achievements: 0, comboStatus: ComboStatus.FullCombo }),
            scored({ comboStatus: ComboStatus.FullComboPlus }),
            scored({ comboStatus: ComboStatus.AllPerfect, syncStatus: SyncStatus.FullSyncDX }),
            scored({
                comboStatus: ComboStatus.AllPerfectPlus,
                syncStatus: SyncStatus.FullSyncDXPlus,
            }),
            scored({ syncStatus: SyncStatus.FullSyncPlus }),
            scored({ achievements: null, syncStatus: SyncStatus.Sync }),
            scored(undefined),
        ];

        expect(countChartStats(charts)).toEqual({ sss: 2, sssp: 1, fc: 4, ap: 2, fsdx: 2 });
    });

    it("counts nothing for an empty list", () => {
        expect(countChartStats([])).toEqual({ sss: 0, sssp: 0, fc: 0, ap: 0, fsdx: 0 });
    });
});

describe("grouping", () => {
    const shown = runPage(fixture, { category: SongsCategory.InGame, tab: "12+" }).shown;

    it("has no groups where the page shows a flat list", () => {
        const none = {
            charts: shown,
            groupBy: "none" as const,
            versionGroupBy: "none" as const,
            versions: fixture.versions,
        };

        expect(
            groupCharts({ ...none, category: SongsCategory.InGame, selectedTab: "12+" })
        ).toBeNull();
        expect(
            groupCharts({
                ...none,
                category: SongsCategory.InGame,
                selectedTab: "ALL",
                groupBy: "rank",
            })
        ).toBeNull();
        expect(
            groupCharts({
                ...none,
                category: SongsCategory.Banquet,
                selectedTab: "ALL",
                groupBy: "rank",
                versionGroupBy: "rank",
            })
        ).toBeNull();
        expect(
            groupCharts({ ...none, category: SongsCategory.Version, selectedTab: "maimai" })
        ).toBeNull();
        expect(
            groupCharts({ ...none, category: SongsCategory.Favorite, selectedTab: "fav-a" })
        ).toBeNull();
        expect(
            groupCharts({
                ...none,
                category: "極",
                selectedTab: "極A",
                groupBy: "rank",
                versionGroupBy: "rank",
            })
        ).toBeNull();
    });

    it("has no groups for an empty list", () => {
        expect(
            groupCharts({
                charts: [],
                category: SongsCategory.InGame,
                selectedTab: "最近",
                groupBy: "none",
                versionGroupBy: "none",
                versions: [],
            })
        ).toBeNull();
    });

    it("keeps every chart exactly once across the groups", () => {
        for (const groupBy of ["constant", "version", "rank", "combo", "sync"] as const) {
            const groups = groupCharts({
                charts: shown,
                category: SongsCategory.InGame,
                selectedTab: "12+",
                groupBy,
                versionGroupBy: "none",
                versions: fixture.versions,
            });
            const ids = (groups ?? []).flatMap(group => group.items.map(chart => chart.id));
            expect([...ids].sort((a, b) => a - b)).toEqual(
                shown.map(chart => chart.id).sort((a, b) => a - b)
            );
        }
    });
});
