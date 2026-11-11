import type { Collection, Title } from "@core/collection/type";
import type { ChartEntry } from "../../src/catalog/songs";
import type { CollectionEntry } from "../../src/refs/collection";
import { mapLXNSCollections } from "@core/collection/map";
import { CollectionKind, TitleColor } from "@core/collection/type";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import { describe, expect, it } from "vitest";
import { allChartEntries } from "../../src/catalog/chartQuery";
import {
    collectionChartEntries,
    collectionChartRow,
    collectionDetail,
    collectionRow,
    missingCollectionSongs,
} from "../../src/catalog/collectionView";
import { listCollections } from "../../src/refs/collection";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { catalogOf } from "../madeCatalog";
import { entryOf } from "../madeChart";

const EXPECTED_FIXTURE_ROWS = [
    {
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
    },
    {
        ref: "plate:2",
        kind: "plate",
        id: 2,
        name: "从整体中随机选择",
        genre: "随机",
        color: null,
        description: "每次游戏将从所有收藏中随机设置！",
        songCount: 0,
        owned: null,
        progress: null,
    },
    {
        ref: "plate:6101",
        kind: "plate",
        id: 6101,
        name: "真極",
        genre: "実績",
        color: null,
        description: "maimai PLUSまでの全曲/BASIC～MASTER/FULL COMBO",
        songCount: 5,
        owned: null,
        progress: null,
    },
    {
        ref: "plate:6102",
        kind: "plate",
        id: 6102,
        name: "真神",
        genre: "実績",
        color: null,
        description: "maimai PLUSまでの全曲/BASIC～MASTER/ALL PERFECT",
        songCount: 5,
        owned: null,
        progress: null,
    },
    {
        ref: "plate:6103",
        kind: "plate",
        id: 6103,
        name: "真舞舞",
        genre: "実績",
        color: null,
        description: "maimai PLUSまでの全曲/BASIC～MASTER/FULL SYNC DX",
        songCount: 5,
        owned: null,
        progress: null,
    },
    {
        ref: "plate:6104",
        kind: "plate",
        id: 6104,
        name: "超極",
        genre: "実績",
        color: null,
        description: "maimai GreeN 全曲/BASIC～MASTER/FULL COMBO",
        songCount: 4,
        owned: null,
        progress: null,
    },
    {
        ref: "plate:6105",
        kind: "plate",
        id: 6105,
        name: "超将",
        genre: "実績",
        color: null,
        description: "maimai GreeN 全曲/BASIC～MASTER/RANK SSS",
        songCount: 4,
        owned: null,
        progress: null,
    },
    {
        ref: "plate:6106",
        kind: "plate",
        id: 6106,
        name: "超神",
        genre: "実績",
        color: null,
        description: "maimai GreeN 全曲/BASIC～MASTER/ALL PERFECT",
        songCount: 4,
        owned: null,
        progress: null,
    },
    {
        ref: "plate:6107",
        kind: "plate",
        id: 6107,
        name: "超舞舞",
        genre: "実績",
        color: null,
        description: "maimai GreeN 全曲/BASIC～MASTER/FULL SYNC DX",
        songCount: 4,
        owned: null,
        progress: null,
    },
    {
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
    },
    {
        ref: "plate:409506",
        kind: "plate",
        id: 409506,
        name: "USM二人三脚",
        genre: "実績",
        color: null,
        description: "ULTRA SYNERGY MATRIX[でらっくす]/FULL SYNC",
        songCount: 1,
        owned: null,
        progress: null,
    },
    {
        ref: "plate:101",
        kind: "plate",
        id: 101,
        name: "はじまりのちほー",
        genre: "オリジナルちほー",
        color: null,
        description: "はじまりのちほーのキャラクターを1回ずつ覚醒",
        songCount: 0,
        owned: null,
        progress: null,
    },
    {
        ref: "title:1",
        kind: "title",
        id: 1,
        name: "新人出道",
        genre: "デフォルト",
        color: "Normal",
        description: "はじめから所持",
        songCount: 0,
        owned: null,
        progress: null,
    },
    {
        ref: "title:2",
        kind: "title",
        id: 2,
        name: "从整体中随机选择",
        genre: "随机",
        color: "Normal",
        description: "每次游戏将从所有收藏中随机设置！",
        songCount: 0,
        owned: null,
        progress: null,
    },
    {
        ref: "title:5101",
        kind: "title",
        id: 5101,
        name: "千本桜",
        genre: "niconicoボーカロイド",
        color: "Gold",
        description: "千本桜[でらっくす]/全難易度/ALL PERFECT",
        songCount: 1,
        owned: null,
        progress: null,
    },
    {
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
    },
    {
        ref: "title:5502",
        kind: "title",
        id: 5502,
        name: "どっちかの夜は昼間",
        genre: "POPSアニメ",
        color: "Bronze",
        description: "U.S.A.[でらっくす]/EXPERT/RANK S",
        songCount: 1,
        owned: null,
        progress: null,
    },
    {
        ref: "title:5501",
        kind: "title",
        id: 5501,
        name: "M.A.I.",
        genre: "POPSアニメ",
        color: "Silver",
        description: "U.S.A.[でらっくす]/MASTER/RANK S",
        songCount: 1,
        owned: null,
        progress: null,
    },
    {
        ref: "title:158511",
        kind: "title",
        id: 158511,
        name: "MEGA+MEGAはGIGAじゃないぞ。オレたちはMEGA+MEGAでTERAだ！10倍だぞ10倍",
        genre: "オンゲキCHUNITHM",
        color: "Gold",
        description:
            "MEGATON KICK[でらっくす]/MEGATON BLAST[でらっくす]/MASTER/一回のクレジットでFULL SYNC DX",
        songCount: 2,
        owned: null,
        progress: null,
    },
    {
        ref: "title:458582",
        kind: "title",
        id: 458582,
        name: "and you",
        genre: "maimai",
        color: "Rainbow",
        description: "系ぎて[でらっくす]/BASIC～Re:MASTER/ALL PERFECT+",
        songCount: 1,
        owned: null,
        progress: null,
    },
    {
        ref: "title:20",
        kind: "title",
        id: 20,
        name: "彩虹评级熊！",
        genre: "実績",
        color: "Rainbow",
        description: "maimai でらっくすでレーティング8500達成",
        songCount: 0,
        owned: null,
        progress: null,
    },
    {
        ref: "icon:1",
        kind: "icon",
        id: 1,
        name: "デフォルト",
        genre: "デフォルト",
        color: null,
        description: "はじめから所持",
        songCount: 0,
        owned: null,
        progress: null,
    },
    {
        ref: "icon:2",
        kind: "icon",
        id: 2,
        name: "从整体中随机选择",
        genre: "随机",
        color: null,
        description: "每次游戏将从所有收藏中随机设置！",
        songCount: 0,
        owned: null,
        progress: null,
    },
    {
        ref: "icon:209502",
        kind: "icon",
        id: 209502,
        name: "UNiVERSE しゃま＆みるく",
        genre: "その他",
        color: null,
        description:
            "とびだせ！TO THE COSMIC!![でらっくす]/ミルキースター・シューティングスター[でらっくす]/一回のクレジットでプレイ",
        songCount: 2,
        owned: null,
        progress: null,
    },
    {
        ref: "frame:1",
        kind: "frame",
        id: 1,
        name: "デフォルト",
        genre: "デフォルト",
        color: null,
        description: "はじめから所持",
        songCount: 0,
        owned: null,
        progress: null,
    },
    {
        ref: "frame:2",
        kind: "frame",
        id: 2,
        name: "从整体中随机选择",
        genre: "随机",
        color: null,
        description: "每次游戏将从所有收藏中随机设置！",
        songCount: 0,
        owned: null,
        progress: null,
    },
    {
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
    },
];

const BMEM = ["BASIC", "ADVANCED", "EXPERT", "MASTER"] as const;

describe("collectionView fixture data", () => {
    const fixtureCollections = mapLXNSCollections(getFixtureLXNSCollections());
    const entries = listCollections(fixtureCollections);
    const catalog = fixtureSongCatalog();
    const allCharts = allChartEntries(catalog);

    const chartKey = (e: ChartEntry) => `${e.chart.music.id}-${e.chart.info.grade}`;

    describe("collectionRow on fixture entries", () => {
        it("matches the expected 27 fixture rows and their key order", () => {
            expect(entries.length).toBe(966);
            for (let i = 0; i < 27; i++) {
                const row = collectionRow(entries[i]);
                expect(row).toEqual(EXPECTED_FIXTURE_ROWS[i]);
                expect(Object.keys(row)).toEqual([
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
            }
        });

        it("matches character:101 and partner:1 from static data", () => {
            const charEntry = entries.find(e => e.kind === "character" && e.collection.id === 101)!;
            expect(charEntry).toBeDefined();
            expect(collectionRow(charEntry)).toEqual({
                ref: "character:101",
                kind: "character",
                id: 101,
                name: "でらっくま",
                genre: "はじまりのちほー",
                color: null,
                description: "",
                songCount: 0,
                owned: null,
                progress: null,
            });

            const partnerEntry = entries.find(e => e.kind === "partner" && e.collection.id === 1)!;
            expect(partnerEntry).toBeDefined();
            expect(collectionRow(partnerEntry)).toEqual({
                ref: "partner:1",
                kind: "partner",
                id: 1,
                name: "でらっくま",
                genre: null,
                color: null,
                description: "",
                songCount: 0,
                owned: null,
                progress: null,
            });
        });
    });

    describe("collectionDetail on fixture entries", () => {
        it("returns expected requirements for collections with conditions", () => {
            const detailOf = (ref: string) => {
                const entry = entries.find(e => `${e.kind}:${e.collection.id}` === ref)!;
                return collectionDetail(entry);
            };

            const p6101 = detailOf("plate:6101");
            expect(p6101.requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "FC",
                    sync: null,
                    songCount: 5,
                },
            ]);

            const p6102 = detailOf("plate:6102");
            expect(p6102.requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "AP",
                    sync: null,
                    songCount: 5,
                },
            ]);

            const p6103 = detailOf("plate:6103");
            expect(p6103.requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: null,
                    sync: "FDX",
                    songCount: 5,
                },
            ]);

            const p6104 = detailOf("plate:6104");
            expect(p6104.requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "FC",
                    sync: null,
                    songCount: 4,
                },
            ]);

            const p6105 = detailOf("plate:6105");
            expect(p6105.requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: "SSS",
                    combo: null,
                    sync: null,
                    songCount: 4,
                },
            ]);

            const p6106 = detailOf("plate:6106");
            expect(p6106.requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "AP",
                    sync: null,
                    songCount: 4,
                },
            ]);

            const p6107 = detailOf("plate:6107");
            expect(p6107.requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: null,
                    sync: "FDX",
                    songCount: 4,
                },
            ]);

            const p6148 = detailOf("plate:6148");
            expect(p6148.requirements).toEqual([
                {
                    difficulties: BMEM,
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
            ]);

            const p409506 = detailOf("plate:409506");
            expect(p409506.requirements).toEqual([
                {
                    difficulties: null,
                    rank: null,
                    combo: null,
                    sync: "FS",
                    songCount: 1,
                },
            ]);

            const t5101 = detailOf("title:5101");
            expect(t5101.requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "AP",
                    sync: null,
                    songCount: 1,
                },
            ]);

            const t5102 = detailOf("title:5102");
            expect(t5102.requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "AP",
                    sync: null,
                    songCount: 1,
                },
            ]);

            const t5502 = detailOf("title:5502");
            expect(t5502.requirements).toEqual([
                {
                    difficulties: ["EXPERT"],
                    rank: "S",
                    combo: null,
                    sync: null,
                    songCount: 1,
                },
            ]);

            const t5501 = detailOf("title:5501");
            expect(t5501.requirements).toEqual([
                {
                    difficulties: ["MASTER"],
                    rank: "S",
                    combo: null,
                    sync: null,
                    songCount: 1,
                },
            ]);

            const t158511 = detailOf("title:158511");
            expect(t158511.requirements).toEqual([
                {
                    difficulties: ["MASTER"],
                    rank: null,
                    combo: null,
                    sync: "FDX",
                    songCount: 2,
                },
            ]);

            const t458582 = detailOf("title:458582");
            expect(t458582.requirements).toEqual([
                {
                    difficulties: ["Re:MASTER"],
                    rank: null,
                    combo: "AP+",
                    sync: null,
                    songCount: 1,
                },
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "AP+",
                    sync: null,
                    songCount: 1,
                },
            ]);

            const i209502 = detailOf("icon:209502");
            expect(i209502.requirements).toEqual([
                {
                    difficulties: null,
                    rank: null,
                    combo: null,
                    sync: null,
                    songCount: 2,
                },
            ]);

            const f109101 = detailOf("frame:109101");
            expect(f109101.requirements).toEqual([
                {
                    difficulties: BMEM,
                    rank: null,
                    combo: "AP",
                    sync: null,
                    songCount: 2,
                },
            ]);
        });

        it("returns empty requirements for collections without conditions and keeps key order", () => {
            const noConditionRefs = [
                "plate:1",
                "title:1",
                "icon:1",
                "frame:1",
                "plate:101",
                "character:101",
                "partner:1",
            ];
            for (const ref of noConditionRefs) {
                const entry = entries.find(e => `${e.kind}:${e.collection.id}` === ref)!;
                const detail = collectionDetail(entry);
                expect(detail.requirements).toEqual([]);
                expect(Object.keys(detail)).toEqual([
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
                    "requirements",
                ]);
            }
        });
    });

    describe("collectionChartEntries on fixture entries", () => {
        it("returns expected chart keys in game order", () => {
            const collectionOf = (ref: string) =>
                entries.find(e => `${e.kind}:${e.collection.id}` === ref)!.collection;

            expect(
                collectionChartEntries(collectionOf("plate:6101"), allCharts).map(chartKey)
            ).toEqual([
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
            ]);

            const expected6104 = [
                "115-3",
                "188-3",
                "191-3",
                "256-3",
                "115-2",
                "188-2",
                "191-2",
                "256-2",
                "115-1",
                "188-1",
                "191-1",
                "256-1",
                "115-0",
                "188-0",
                "191-0",
                "256-0",
            ];
            expect(
                collectionChartEntries(collectionOf("plate:6104"), allCharts).map(chartKey)
            ).toEqual(expected6104);

            expect(
                collectionChartEntries(collectionOf("plate:6148"), allCharts).map(chartKey)
            ).toEqual([
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
            ]);

            expect(
                collectionChartEntries(collectionOf("title:5102"), allCharts).map(chartKey)
            ).toEqual(["10146-3", "10146-2", "10146-1", "10146-0"]);

            expect(
                collectionChartEntries(collectionOf("frame:109101"), allCharts).map(chartKey)
            ).toEqual([
                "10191-3",
                "10256-3",
                "10191-2",
                "10256-2",
                "10191-1",
                "10256-1",
                "10191-0",
                "10256-0",
            ]);

            expect(collectionChartEntries(collectionOf("title:5101"), allCharts)).toEqual([]);
            expect(collectionChartEntries(collectionOf("plate:409506"), allCharts)).toEqual([]);
            expect(collectionChartEntries(collectionOf("icon:209502"), allCharts)).toEqual([]);
            expect(collectionChartEntries(collectionOf("title:1"), allCharts)).toEqual([]);
            expect(collectionChartEntries(collectionOf("character:101"), allCharts)).toEqual([]);

            // Shuffled entries maintain their input order
            const reversedEntries = [...allCharts].reverse();
            const freshP6104 = { ...collectionOf("plate:6104") };
            expect(collectionChartEntries(freshP6104, reversedEntries).map(chartKey)).toEqual(
                [...expected6104].reverse()
            );
        });
    });

    describe("missingCollectionSongs on fixture data", () => {
        it("returns expected missing songs for collections whose songs the catalog lacks", () => {
            const collectionOf = (ref: string) =>
                entries.find(e => `${e.kind}:${e.collection.id}` === ref)!.collection;

            expect(missingCollectionSongs(collectionOf("title:5101"), catalog)).toEqual([
                { musicId: 10125, title: "千本桜" },
            ]);
            expect(missingCollectionSongs(collectionOf("title:5502"), catalog)).toEqual([
                { musicId: 11036, title: "U.S.A." },
            ]);
            expect(missingCollectionSongs(collectionOf("title:5501"), catalog)).toEqual([
                { musicId: 11036, title: "U.S.A." },
            ]);
            expect(missingCollectionSongs(collectionOf("title:158511"), catalog)).toEqual([
                { musicId: 11248, title: "MEGATON BLAST" },
                { musicId: 11292, title: "MEGATON KICK" },
            ]);
            expect(missingCollectionSongs(collectionOf("title:458582"), catalog)).toEqual([
                { musicId: 11663, title: "系ぎて" },
            ]);
            expect(missingCollectionSongs(collectionOf("icon:209502"), catalog)).toEqual([
                { musicId: 11296, title: "とびだせ！TO THE COSMIC!!" },
                { musicId: 11375, title: "ミルキースター・シューティングスター" },
            ]);
            expect(missingCollectionSongs(collectionOf("plate:409506"), catalog)).toEqual([
                { musicId: 11591, title: "ULTRA SYNERGY MATRIX" },
            ]);

            expect(missingCollectionSongs(collectionOf("plate:6148"), catalog)).toEqual([]);
            expect(missingCollectionSongs(collectionOf("title:5102"), catalog)).toEqual([]);
            expect(missingCollectionSongs(collectionOf("frame:109101"), catalog)).toEqual([]);
            expect(missingCollectionSongs(collectionOf("plate:1"), catalog)).toEqual([]);
        });
    });

    describe("collectionChartRow on fixture entries", () => {
        it("formats chart rows with done: null and keeps key order", () => {
            const entry10146_3 = allCharts.find(
                e => e.chart.music.id === 10146 && e.chart.info.grade === 3
            )!;
            expect(collectionChartRow(entry10146_3)).toEqual({
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
            });
            expect(Object.keys(collectionChartRow(entry10146_3))).toEqual([
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

            const entry58_3 = allCharts.find(
                e => e.chart.music.id === 58 && e.chart.info.grade === 3
            )!;
            expect(collectionChartRow(entry58_3)).toEqual({
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

            const entry70_4 = allCharts.find(
                e => e.chart.music.id === 70 && e.chart.info.grade === 4
            )!;
            expect(collectionChartRow(entry70_4)).toEqual({
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
        });
    });
});

describe("collectionView made-up data", () => {
    describe("songCount counting", () => {
        it("counts distinct songs correctly across standard, dx and utage", () => {
            const entry1: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 1,
                    name: "test",
                    description: "d",
                    required: [
                        {
                            songs: [
                                { id: 8, title: "A", type: "standard" },
                                { id: 8, title: "A dx", type: "dx" },
                            ],
                        },
                    ],
                },
            };
            expect(collectionRow(entry1).songCount).toBe(2);

            const entry2: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 2,
                    name: "test",
                    description: "d",
                    required: [
                        {
                            songs: [
                                { id: 8, title: "A dx", type: "dx" },
                                { id: 10008, title: "A dx 10008", type: "dx" },
                            ],
                        },
                    ],
                },
            };
            expect(collectionRow(entry2).songCount).toBe(1);

            const entry3: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 3,
                    name: "test",
                    description: "d",
                    required: [
                        {
                            songs: [
                                { id: 8, title: "A", type: "standard" },
                                { id: 8, title: "A utage", type: "utage" },
                            ],
                        },
                    ],
                },
            };
            expect(collectionRow(entry3).songCount).toBe(1);

            const entry4: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 4,
                    name: "test",
                    description: "d",
                    required: [
                        {
                            songs: [
                                { id: 8, title: "A", type: "standard" },
                                { id: 8, title: "A", type: "standard" },
                            ],
                        },
                    ],
                },
            };
            expect(collectionRow(entry4).songCount).toBe(1);

            const entry5: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 5,
                    name: "test",
                    description: "d",
                    required: [
                        { songs: [{ id: 8, title: "A", type: "standard" }] },
                        { songs: [{ id: 8, title: "A", type: "standard" }] },
                    ],
                },
            };
            expect(collectionRow(entry5).songCount).toBe(1);
            const detail5 = collectionDetail(entry5);
            expect(detail5.requirements[0].songCount).toBe(1);
            expect(detail5.requirements[1].songCount).toBe(1);

            const entry6: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 6,
                    name: "test",
                    description: "d",
                    required: [{}],
                },
            };
            expect(collectionRow(entry6).songCount).toBe(0);
            expect(collectionDetail(entry6).requirements[0].songCount).toBe(0);

            const entry7: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 7,
                    name: "test",
                    description: "d",
                },
            };
            expect(collectionRow(entry7).songCount).toBe(0);
            expect(collectionDetail(entry7).requirements).toEqual([]);
        });

        it("counts a song named twice in one condition once, in the condition and in the collection", () => {
            const entry: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 8,
                    name: "test",
                    description: "d",
                    required: [
                        {
                            songs: [
                                { id: 8, title: "A", type: "standard" },
                                { id: 8, title: "A", type: "standard" },
                                { id: 9, title: "B", type: "standard" },
                                { id: 10009, title: "B dx", type: "dx" },
                                { id: 9, title: "B dx", type: "dx" },
                            ],
                        },
                        { songs: [{ id: 8, title: "A", type: "standard" }] },
                    ],
                },
            };
            // The music ids are 8, 8, 9, 10009 and 10009: three songs; the second condition adds none.
            expect(collectionRow(entry).songCount).toBe(3);
            expect(collectionDetail(entry).requirements.map(r => r.songCount)).toEqual([3, 1]);
        });
    });

    describe("requirementRow fields through collectionDetail", () => {
        it("converts requirement fields correctly", () => {
            const entry1: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 1,
                    name: "test",
                    description: "d",
                    required: [
                        {
                            difficulties: [0, 1, 2, 3, 4],
                            rate: RankRate.sss,
                            fc: ComboStatus.FullComboPlus,
                            fs: SyncStatus.FullSyncDXPlus,
                        },
                    ],
                },
            };
            const req1 = collectionDetail(entry1).requirements[0];
            expect(req1.difficulties).toEqual([
                "BASIC",
                "ADVANCED",
                "EXPERT",
                "MASTER",
                "Re:MASTER",
            ]);
            expect(req1.rank).toBe("SSS");
            expect(req1.combo).toBe("FC+");
            expect(req1.sync).toBe("FDX+");

            const entry2: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 2,
                    name: "test",
                    description: "d",
                    required: [
                        {
                            difficulties: [],
                            rate: RankRate.sssp,
                            fc: ComboStatus.None,
                            fs: SyncStatus.Sync,
                        },
                        {
                            difficulties: [2],
                            fs: SyncStatus.None,
                        },
                        {},
                    ],
                },
            };
            const reqs2 = collectionDetail(entry2).requirements;
            expect(reqs2[0].difficulties).toBeNull();
            expect(reqs2[0].rank).toBe("SSS+");
            expect(reqs2[0].combo).toBeNull();
            expect(reqs2[0].sync).toBe("SYNC");

            expect(reqs2[1].difficulties).toEqual(["EXPERT"]);
            expect(reqs2[1].rank).toBeNull();
            expect(reqs2[1].combo).toBeNull();
            expect(reqs2[1].sync).toBeNull();

            expect(reqs2[2].difficulties).toBeNull();
            expect(reqs2[2].rank).toBeNull();
            expect(reqs2[2].combo).toBeNull();
            expect(reqs2[2].sync).toBeNull();
        });
    });

    describe("genre, color and description handling", () => {
        it("handles genre, color, and description variations", () => {
            const entryGenre: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 1,
                    name: "test",
                    description: "desc",
                    genre: "genreX",
                },
            };
            expect(collectionRow(entryGenre).genre).toBe("genreX");
            expect(collectionRow(entryGenre).description).toBe("desc");

            const entryNoGenre: CollectionEntry = {
                kind: "plate",
                collection: {
                    type: CollectionKind.Plate,
                    id: 2,
                    name: "test",
                    description: "",
                },
            };
            expect(collectionRow(entryNoGenre).genre).toBeNull();
            expect(collectionRow(entryNoGenre).description).toBe("");

            const titleRainbow: CollectionEntry = {
                kind: "title",
                collection: {
                    type: CollectionKind.Title,
                    id: 3,
                    name: "title test",
                    description: "desc",
                    color: TitleColor.Rainbow,
                } as Title,
            };
            expect(collectionRow(titleRainbow).color).toBe("Rainbow");

            const titleNoColor: CollectionEntry = {
                kind: "title",
                collection: {
                    type: CollectionKind.Title,
                    id: 4,
                    name: "title test",
                    description: "desc",
                } as Title,
            };
            expect(collectionRow(titleNoColor).color).toBeNull();

            const iconWithColor: CollectionEntry = {
                kind: "icon",
                collection: {
                    type: CollectionKind.Icon,
                    id: 5,
                    name: "icon test",
                    description: "desc",
                    color: TitleColor.Gold,
                } as unknown as Collection,
            };
            expect(collectionRow(iconWithColor).color).toBeNull();
        });
    });

    describe("collectionChartEntries matching with entryOf", () => {
        it("matches songs and difficulties correctly", () => {
            const e10008 = entryOf({ id: 10008, grade: 3 });
            const e8 = entryOf({ id: 8, grade: 3 });

            const colStd8: Collection = {
                type: CollectionKind.Plate,
                id: 1,
                name: "test",
                description: "",
                required: [{ songs: [{ id: 8, title: "8", type: "standard" }] }],
            };
            expect(collectionChartEntries(colStd8, [e10008, e8])).toEqual([e8]);

            const colDx8: Collection = {
                type: CollectionKind.Plate,
                id: 2,
                name: "test",
                description: "",
                required: [{ songs: [{ id: 8, title: "8", type: "dx" }] }],
            };
            expect(collectionChartEntries(colDx8, [e10008, e8])).toEqual([e10008]);

            const colDx10008: Collection = {
                type: CollectionKind.Plate,
                id: 3,
                name: "test",
                description: "",
                required: [{ songs: [{ id: 10008, title: "8", type: "dx" }] }],
            };
            expect(collectionChartEntries(colDx10008, [e10008, e8])).toEqual([e10008]);

            const grades8 = [0, 1, 2, 3, 4].map(grade => entryOf({ id: 8, grade }));

            const colDiff3: Collection = {
                type: CollectionKind.Plate,
                id: 4,
                name: "test",
                description: "",
                required: [{ difficulties: [3], songs: [{ id: 8, title: "8", type: "standard" }] }],
            };
            expect(collectionChartEntries(colDiff3, grades8)).toEqual([grades8[3]]);

            const colEmptyDiff: Collection = {
                type: CollectionKind.Plate,
                id: 5,
                name: "test",
                description: "",
                required: [{ difficulties: [], songs: [{ id: 8, title: "8", type: "standard" }] }],
            };
            expect(collectionChartEntries(colEmptyDiff, grades8)).toEqual(grades8);

            const colNoDiff: Collection = {
                type: CollectionKind.Plate,
                id: 6,
                name: "test",
                description: "",
                required: [{ songs: [{ id: 8, title: "8", type: "standard" }] }],
            };
            expect(collectionChartEntries(colNoDiff, grades8)).toEqual(grades8);

            const colDiff04: Collection = {
                type: CollectionKind.Plate,
                id: 7,
                name: "test",
                description: "",
                required: [
                    { difficulties: [0], songs: [{ id: 8, title: "8", type: "standard" }] },
                    { difficulties: [4], songs: [{ id: 8, title: "8", type: "standard" }] },
                ],
            };
            expect(collectionChartEntries(colDiff04, grades8)).toEqual([grades8[0], grades8[4]]);

            const colDrop: Collection = {
                type: CollectionKind.Plate,
                id: 8,
                name: "test",
                description: "",
                required: [{ songs: [{ id: 8, title: "8", type: "standard" }] }],
            };
            const e9 = entryOf({ id: 9, grade: 3 });
            expect(collectionChartEntries(colDrop, [e9])).toEqual([]);

            expect(
                collectionChartEntries(
                    { type: CollectionKind.Plate, id: 9, name: "test", description: "" },
                    grades8
                )
            ).toEqual([]);
            expect(
                collectionChartEntries(
                    {
                        type: CollectionKind.Plate,
                        id: 10,
                        name: "test",
                        description: "",
                        required: [],
                    },
                    grades8
                )
            ).toEqual([]);
            expect(
                collectionChartEntries(
                    {
                        type: CollectionKind.Plate,
                        id: 11,
                        name: "test",
                        description: "",
                        required: [{}],
                    },
                    grades8
                )
            ).toEqual([]);

            const reversedGrades = [...grades8].reverse();
            const colOrderTest: Collection = {
                type: CollectionKind.Plate,
                id: 12,
                name: "test",
                description: "",
                required: [{ songs: [{ id: 8, title: "8", type: "standard" }] }],
            };
            expect(collectionChartEntries(colOrderTest, reversedGrades)).toEqual(reversedGrades);
        });
    });

    describe("missingCollectionSongs with catalogOf", () => {
        it("identifies missing songs accurately", () => {
            const cat8 = catalogOf([
                { id: 8, title: "Song 8", charters: ["c0", "c1", "c2", "c3", "c4"] },
            ]);
            const col8: Collection = {
                type: CollectionKind.Plate,
                id: 1,
                name: "test",
                description: "",
                required: [{ songs: [{ id: 8, title: "Song 8", type: "standard" }] }],
            };
            expect(missingCollectionSongs(col8, cat8)).toEqual([]);

            const colDxMissing: Collection = {
                type: CollectionKind.Plate,
                id: 2,
                name: "test",
                description: "",
                required: [{ songs: [{ id: 8, title: "Song 8 DX", type: "dx" }] }],
            };
            expect(missingCollectionSongs(colDxMissing, cat8)).toEqual([
                { musicId: 10008, title: "Song 8 DX" },
            ]);

            const colDupMissing: Collection = {
                type: CollectionKind.Plate,
                id: 3,
                name: "test",
                description: "",
                required: [
                    { songs: [{ id: 99, title: "First", type: "standard" }] },
                    { songs: [{ id: 99, title: "Second", type: "standard" }] },
                ],
            };
            expect(missingCollectionSongs(colDupMissing, cat8)).toEqual([
                { musicId: 99, title: "First" },
            ]);

            const colOrderMissing: Collection = {
                type: CollectionKind.Plate,
                id: 4,
                name: "test",
                description: "",
                required: [
                    { songs: [{ id: 101, title: "Song 101", type: "standard" }] },
                    { songs: [{ id: 100, title: "Song 100", type: "standard" }] },
                ],
            };
            expect(missingCollectionSongs(colOrderMissing, cat8)).toEqual([
                { musicId: 101, title: "Song 101" },
                { musicId: 100, title: "Song 100" },
            ]);

            const cat8Single = catalogOf([{ id: 8, title: "A", charters: ["x"] }]);
            const colAskDiff3: Collection = {
                type: CollectionKind.Plate,
                id: 5,
                name: "test",
                description: "",
                required: [{ difficulties: [3], songs: [{ id: 8, title: "A", type: "standard" }] }],
            };
            expect(missingCollectionSongs(colAskDiff3, cat8Single)).toEqual([]);
            expect(collectionChartEntries(colAskDiff3, allChartEntries(cat8Single))).toEqual([]);

            expect(
                missingCollectionSongs(
                    { type: CollectionKind.Plate, id: 6, name: "test", description: "" },
                    cat8
                )
            ).toEqual([]);
        });
    });
});
