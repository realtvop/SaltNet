import type { DivingFishMusicChart, MusicDataResponse } from "./type";
import { describe, expect, it } from "vitest";
import { UTAGE_GRADE } from "../../chart/difficulty";
import {
    ChartType,
    ComboStatus,
    MusicGenre,
    MusicOrigin,
    RankRate,
    SyncStatus,
} from "../../mai/types";
import { chartScoreFromDF, convertDFMusicList } from "./convert";

describe("chartScoreFromDF", () => {
    it("maps every field from DivingFishMusicChart to ChartScore correctly", () => {
        const dfChart: DivingFishMusicChart = {
            achievements: 100.4999,
            ds: 14.7,
            dxScore: 2450,
            fc: ComboStatus.AllPerfect,
            fs: SyncStatus.FullSyncDXPlus,
            level: "14+",
            level_index: 3,
            level_label: "Master",
            play_count: 42,
            ra: 295,
            rate: RankRate.sssp,
            song_id: 1122,
            title: "Test Song",
            type: "DX",
            lastChangedAt: 1700000000123,
        };

        const score = chartScoreFromDF(dfChart);

        expect(score).toEqual({
            rankRate: RankRate.sssp,
            achievements: 100.4999,
            comboStatus: ComboStatus.AllPerfect,
            syncStatus: SyncStatus.FullSyncDXPlus,
            deluxeRating: 295,
            deluxeScore: 2450,
            playCount: 42,
            lastChangedAt: 1700000000123,
        });
    });
});

describe("convertDFMusicList", () => {
    it("converts music basic info and charts properly", () => {
        const data: MusicDataResponse = [
            {
                id: "800",
                title: "Standard Song",
                type: ChartType.Deluxe,
                ds: [7.0, 9.5, 12.0, 14.2],
                level: ["7", "9+", "12", "14"],
                cids: [8001, 8002, 8003, 8004],
                charts: [
                    { notes: [50, 10, 10, 5, 0], charter: "Charter 0" },
                    { notes: [100, 20, 20, 10, 0], charter: "Charter 1" },
                    { notes: [200, 30, 30, 20, 5], charter: "Charter 2" },
                    {
                        notes: [300, 50, 50, 30, 10],
                        charter: "Charter 3",
                        stats: {
                            cnt: 500,
                            diff: "14",
                            fit_diff: 14.25,
                            avg: 99.2,
                            avg_dx: 1200,
                            std_dev: 1.5,
                            dist: [0, 0, 0, 0, 0, 1, 2, 5, 10, 20, 50, 100, 150, 162],
                            fc_dist: [100, 100, 200, 50, 50],
                        },
                    },
                ],
                basic_info: {
                    title: "Standard Song",
                    artist: "Standard Artist",
                    genre: MusicGenre["niconico & VOCALOID"],
                    bpm: 180,
                    release_date: "2023-01-01",
                    from: MusicOrigin["maimai でらっくす"],
                    is_new: true,
                },
                aliases: ["StdAlias"],
            },
        ];

        const { musicList, chartList } = convertDFMusicList(data);

        expect(musicList[800]).toBeDefined();
        expect(musicList[800].info).toEqual({
            id: 800,
            title: "Standard Song",
            aliases: ["StdAlias"],
            artist: "Standard Artist",
            genre: MusicGenre["niconico & VOCALOID"],
            bpm: 180,
            from: MusicOrigin["maimai でらっくす"],
            isNew: true,
            type: ChartType.Deluxe,
        });

        expect(musicList[800].charts).toHaveLength(4);
        // chart ids come from cids
        expect(
            Object.keys(chartList)
                .map(Number)
                .sort((a, b) => a - b)
        ).toEqual([8001, 8002, 8003, 8004]);
        expect(chartList[8004].info.charter).toBe("Charter 3");
        expect(chartList[8004].info.constant).toBe(14.2);
        expect(chartList[8004].info.grade).toBe(3);
        expect(chartList[8004].info.stat).toEqual(data[0].charts[3].stats);

        // Chart without stats has undefined stat
        expect(chartList[8001].info.stat).toBeUndefined();
    });

    it("preserves chart ordering, links chart music reference, and retains exact notes and level across difficulties", () => {
        const data: MusicDataResponse = [
            {
                id: "800",
                title: "Standard Song",
                type: ChartType.Deluxe,
                ds: [7.0, 9.5, 12.0, 14.2],
                level: ["7", "9+", "12", "14"],
                cids: [8001, 8002, 8003, 8004],
                charts: [
                    { notes: [50, 10, 10, 5, 0], charter: "Charter 0" },
                    { notes: [100, 20, 20, 10, 0], charter: "Charter 1" },
                    { notes: [200, 30, 30, 20, 5], charter: "Charter 2" },
                    { notes: [300, 50, 50, 30, 10], charter: "Charter 3" },
                ],
                basic_info: {
                    title: "Standard Song",
                    artist: "Standard Artist",
                    genre: MusicGenre["niconico & VOCALOID"],
                    bpm: 180,
                    release_date: "2023-01-01",
                    from: MusicOrigin["maimai でらっくす"],
                    is_new: true,
                },
            },
            {
                id: "801",
                title: "Second Song",
                type: ChartType.Standard,
                ds: [6.0, 8.5],
                level: ["6", "8+"],
                cids: [8011, 8012],
                charts: [
                    { notes: [40, 5, 5, 2, 0], charter: "Charter A" },
                    { notes: [80, 15, 15, 8, 1], charter: "Charter B" },
                ],
                basic_info: {
                    title: "Second Song",
                    artist: "Second Artist",
                    genre: MusicGenre["流行&动漫"],
                    bpm: 140,
                    release_date: "2023-02-01",
                    from: MusicOrigin.maimai,
                    is_new: false,
                },
            },
        ];

        const { musicList, chartList } = convertDFMusicList(data);

        // Order of charts in each music entry
        expect(musicList[800].charts.map(chart => chart.id)).toEqual([8001, 8002, 8003, 8004]);
        expect(musicList[801].charts.map(chart => chart.id)).toEqual([8011, 8012]);

        // Order of charts in the chart list
        expect(Object.keys(chartList).map(Number)).toEqual([8001, 8002, 8003, 8004, 8011, 8012]);
        expect(Object.values(chartList).map(chart => chart.id)).toEqual([
            8001, 8002, 8003, 8004, 8011, 8012,
        ]);

        // Every chart's music is the very same object as the entry it belongs to (toBe)
        for (const chart of musicList[800].charts) {
            expect(chart.music).toBe(musicList[800]);
            expect(chartList[chart.id].music).toBe(musicList[800]);
        }
        for (const chart of musicList[801].charts) {
            expect(chart.music).toBe(musicList[801]);
            expect(chartList[chart.id].music).toBe(musicList[801]);
        }

        // Exact notes and level of at least two charts of different difficulties
        expect(chartList[8001].info.notes).toEqual([50, 10, 10, 5, 0]);
        expect(chartList[8001].info.level).toBe("7");

        expect(chartList[8004].info.notes).toEqual([300, 50, 50, 30, 10]);
        expect(chartList[8004].info.level).toBe("14");
    });

    it("assigns UTAGE_GRADE to banquet songs", () => {
        const banquetData: MusicDataResponse = [
            {
                id: "900",
                title: "Banquet 1",
                type: ChartType.Standard,
                ds: [13.0],
                level: ["13"],
                cids: [9001],
                charts: [{ notes: [100, 10, 10, 10, 0], charter: "Banquet Charter" }],
                basic_info: {
                    title: "Banquet 1",
                    artist: "Artist",
                    genre: "宴会场" as MusicGenre,
                    bpm: 160,
                    release_date: "2023-06-01",
                    from: MusicOrigin.maimai,
                    is_new: false,
                },
            },
            {
                id: "901",
                title: "Banquet 2",
                type: ChartType.Standard,
                ds: [14.0],
                level: ["14"],
                cids: [9002],
                charts: [{ notes: [120, 10, 10, 10, 0], charter: "Banquet Charter 2" }],
                basic_info: {
                    title: "Banquet 2",
                    artist: "Artist",
                    genre: MusicGenre["宴会場"],
                    bpm: 170,
                    release_date: "2023-07-01",
                    from: MusicOrigin.maimai,
                    is_new: false,
                },
            },
        ];

        const { chartList } = convertDFMusicList(banquetData);

        expect(chartList[9001].info.grade).toBe(UTAGE_GRADE);
        expect(chartList[9002].info.grade).toBe(UTAGE_GRADE);
    });

    it("calculates deluxeScoreMax as three times the sum of notes, treating null notes as 0", () => {
        const data: MusicDataResponse = [
            {
                id: "950",
                title: "Null Notes Song",
                type: ChartType.Deluxe,
                ds: [12.0],
                level: ["12"],
                cids: [9501],
                charts: [
                    {
                        // Some endpoints might deliver null in notes tuple
                        notes: [100, null, 50, 20, 10] as unknown as [
                            number,
                            number,
                            number,
                            number,
                            number?,
                        ],
                        charter: "Tester",
                    },
                ],
                basic_info: {
                    title: "Null Notes Song",
                    artist: "Artist",
                    genre: MusicGenre["niconico & VOCALOID"],
                    bpm: 150,
                    release_date: "2023-01-01",
                    from: MusicOrigin.maimai,
                    is_new: false,
                },
            },
        ];

        const { chartList } = convertDFMusicList(data);

        // Sum of notes: 100 + 0 + 50 + 20 + 10 = 180
        // deluxeScoreMax: 180 * 3 = 540
        expect(chartList[9501].info.deluxeScoreMax).toBe(540);
    });
});
