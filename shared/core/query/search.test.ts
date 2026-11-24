import type { Chart, ChartScore } from "../music/type";
import { describe, expect, it } from "vitest";
import { createFixtureMusicList } from "../fixtures/saltmeta";
import { ComboStatus, RankRate, SyncStatus } from "../mai/types";
import {
    createMusicSearchIndex,
    createMusicSearchQuery,
    matchesMusicSearchIndex,
} from "../music/search";
import { searchCharts } from "./search";
import {
    addChartPositionIndexes,
    addQueriedPositionIndexes,
    groupCharts,
    SongsCategory,
} from "./songs";

const fixture = createFixtureMusicList();
const template = Object.values(fixture.chartList)[0];

function makeChart(
    id: number,
    title: string,
    options: {
        aliases?: string[];
        artist?: string;
        charter?: string;
        score?: Partial<ChartScore>;
    } = {}
): Chart {
    const aliases = options.aliases ?? [];
    const artist = options.artist ?? "unrelated artist";
    const charter = options.charter ?? "unrelated charter";
    const music = {
        ...template.music,
        id,
        info: {
            ...template.music.info,
            id,
            title,
            aliases,
            artist,
            searchIndex: createMusicSearchIndex([title, ...aliases, artist]),
        },
        charts: [] as Chart[],
    };
    const chart: Chart = {
        ...template,
        id,
        music,
        info: { ...template.info, charter, searchIndex: createMusicSearchIndex([charter]) },
        score: options.score
            ? {
                  achievements: null,
                  comboStatus: ComboStatus.None,
                  syncStatus: SyncStatus.None,
                  rankRate: RankRate.d,
                  deluxeScore: 0,
                  deluxeRating: 0,
                  ...options.score,
              }
            : undefined,
    };
    music.charts.push(chart);
    return chart;
}

describe("web search relevance", () => {
    it("puts whole aliases above partial titles, and direct names above sounds and creators", () => {
        const ranked = [
            makeChart(11, "shi"),
            makeChart(12, "alias whole", { aliases: ["shi"] }),
            makeChart(13, "shining"),
            makeChart(14, "alias prefix", { aliases: ["shining"] }),
            makeChart(15, "worship"),
            makeChart(16, "alias substring", { aliases: ["worship"] }),
            makeChart(17, "诗"),
            makeChart(18, "alias sound", { aliases: ["诗"] }),
            makeChart(19, "artist match", { artist: "shi" }),
            makeChart(20, "charter match", { charter: "shi" }),
        ];
        expect(searchCharts([...ranked].reverse(), "shi")).toEqual(ranked);
    });

    it("puts exact IDs ahead of numeric names and score-only matches", () => {
        const id = makeChart(42, "ID match");
        const name = makeChart(12, "42");
        const alias = makeChart(13, "numeric alias", { aliases: ["42"] });
        const partial = makeChart(142, "142");
        const score = makeChart(14, "score only", { score: { achievements: 42 } });
        expect(searchCharts([score, partial, alias, name, id], "42")).toEqual([
            id,
            name,
            alias,
            partial,
            score,
        ]);
        expect(searchCharts([id], "4")).toEqual([]);
    });

    it("prefers whole sounds, then prefixes, then substrings, with title breaking equal relations", () => {
        const title = makeChart(11, "诗");
        const alias = makeChart(12, "alias", { aliases: ["诗"] });
        const prefix = makeChart(13, "诗歌");
        const substring = makeChart(14, "古诗");
        expect(searchCharts([substring, prefix, alias, title], "shi")).toEqual([
            title,
            alias,
            prefix,
            substring,
        ]);
    });

    it("uses romaji and shortened long vowels in the same sound tier", () => {
        const exact = makeChart(11, "とうきょう");
        const prefix = makeChart(12, "とうきょうタワー");
        const direct = makeChart(13, "my tokyo song");
        expect(searchCharts([prefix, exact, direct], "tōkyō")).toEqual([direct, exact, prefix]);
    });

    it.each([
        ["ＡＢＣ　ＤＥＦ！", "Abc Def", "abc-def"],
        ["台风", "颱風", "台风"],
    ])("does not penalize equivalent text forms for %s", (query, titleA, titleB) => {
        const first = makeChart(99, titleA);
        const second = makeChart(11, titleB);
        const alias = makeChart(12, "alias", { aliases: [titleB] });
        expect(searchCharts([alias, first, second], query)).toEqual([first, second, alias]);
    });

    it("takes only the strongest match, without boosting repeated aliases or extra fields", () => {
        const single = makeChart(99, "plain", { aliases: ["shi"] });
        const multiple = makeChart(11, "other", {
            aliases: ["SHI", "shi!", "ｓｈｉ"],
            artist: "shi",
            charter: "shi",
        });
        expect(searchCharts([single, multiple], "shi")).toEqual([single, multiple]);
    });

    it("searches charters per chart and keeps a song's unrelated charts out", () => {
        const charter = makeChart(11, "plain", { charter: "ほしぞら" });
        const other = {
            ...charter,
            id: 12,
            info: {
                ...charter.info,
                charter: "other",
                searchIndex: createMusicSearchIndex(["other"]),
            },
        };
        expect(searchCharts([other, charter], "hoshizora")).toEqual([charter]);
        expect(searchCharts([other, charter], "plain")).toEqual([other, charter]);
    });

    it.each([
        ["100.5", { achievements: 100.5123 }],
        ["fc", { comboStatus: ComboStatus.FullComboPlus }],
        ["fs", { syncStatus: SyncStatus.FullSyncDXPlus }],
    ] satisfies Array<[string, Partial<ChartScore>]>)(
        "keeps score-only searches in incoming order for %s",
        (query, score) => {
            const first = makeChart(99, "first", { score });
            const second = makeChart(11, "second", { score });
            const direct = makeChart(12, query);
            expect(searchCharts([first, second, direct, makeChart(13, "unplayed")], query)).toEqual(
                [direct, first, second]
            );
        }
    );

    it("keeps chart identity and extra fields, without mutating the input or position indexes", () => {
        const charts = [makeChart(99, "abc def"), makeChart(11, "abc")];
        const positioned = addChartPositionIndexes(charts, charts).map(chart => ({
            ...chart,
            extra: "kept",
        }));
        const before = JSON.stringify(positioned.map(chart => chart.score));
        const result = searchCharts(positioned, "abc");
        expect(result[0]).toBe(positioned[1]);
        expect(result[0].extra).toBe("kept");
        expect(positioned.map(chart => chart.id)).toEqual([99, 11]);
        expect(JSON.stringify(positioned.map(chart => chart.score))).toBe(before);
        const shown = addQueriedPositionIndexes(result, positioned.length);
        expect(shown[0].score.index).toEqual({
            ...positioned[1].score.index,
            queried: { index: 2, total: 2 },
        });
        const groups = groupCharts({
            charts: shown,
            category: SongsCategory.InGame,
            selectedTab: "13",
            groupBy: "constant",
            versionGroupBy: "none",
            versions: [],
        });
        expect(groups?.[0].items.map(chart => chart.id)).toEqual([11, 99]);
        expect(searchCharts(positioned, "")).toBe(positioned);
    });

    it("rebuilds cached variants after metadata changes, including aliases changed in place", () => {
        const chart = makeChart(11, "shi prefix", { aliases: ["other"], charter: "other" });
        const exact = makeChart(12, "shi");
        expect(searchCharts([chart, exact], "shi")).toEqual([exact, chart]);
        chart.music.info.title = "shi";
        expect(searchCharts([chart, exact], "shi")).toEqual([chart, exact]);
        chart.music.info.title = "other";
        const aliases = chart.music.info.aliases ?? [];
        aliases[0] = "shi";
        const partial = makeChart(15, "shi prefix");
        expect(searchCharts([partial, chart], "shi")).toEqual([chart, partial]);
        aliases[0] = "other";
        chart.music.info.artist = "shi";
        const charter = makeChart(13, "other", { charter: "shi" });
        expect(searchCharts([charter, chart], "shi")).toEqual([chart, charter]);
        charter.info.charter = "shi prefix";
        const exactCharter = makeChart(14, "other", { charter: "shi" });
        expect(searchCharts([charter, exactCharter], "shi")).toEqual([exactCharter, charter]);
    });

    it("preserves indexed spellings even if the source fields no longer contain them", () => {
        const chart = makeChart(11, "old name");
        chart.music.info.title = "new name";
        expect(searchCharts([chart], "old")).toEqual([chart]);
    });

    it("preserves the old match set across the real fixture, including blank, numeric and score queries", () => {
        const charts = Object.values(fixture.chartList).map((chart, index) => ({
            ...chart,
            score: {
                achievements: index % 2 ? 100.5123 : null,
                comboStatus: ComboStatus.FullCombo,
                syncStatus: SyncStatus.FullSync,
                rankRate: RankRate.sssp,
                deluxeScore: 0,
                deluxeRating: 0,
            },
        }));
        for (const query of [
            "",
            " ",
            "!!!",
            "link",
            "TRUST",
            "39",
            "8",
            "neko",
            "猫",
            "脑浆",
            "ya",
            "a",
            "台风",
            "shijie",
            "sjjh",
            "Luxizhel",
            "100.5",
            "fc",
            "fs",
            "zzz",
        ]) {
            const terms = createMusicSearchQuery(query);
            const previous = charts.filter(
                chart =>
                    !query ||
                    matchesMusicSearchIndex(chart.music.info.searchIndex, terms) ||
                    matchesMusicSearchIndex(chart.info.searchIndex, terms) ||
                    chart.music.info.id.toString() === query ||
                    chart.score.achievements?.toString().includes(query) ||
                    chart.score.comboStatus.includes(query) ||
                    chart.score.syncStatus.includes(query)
            );
            const result = searchCharts(charts, query);
            expect(
                result.map(chart => chart.id).sort((a, b) => a - b),
                query
            ).toEqual(previous.map(chart => chart.id).sort((a, b) => a - b));
        }
    });
});
