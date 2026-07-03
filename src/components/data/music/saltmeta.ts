import type { Chart, ChartInfo, Music, MusicInfo, SavedMusicList } from "./type";
import type { ChartStats } from "@/components/integrations/diving-fish/type";
import { ChartType, MusicGenre, MusicOrigin } from "@/components/data/maiTypes";
import { UTAGE_GRADE } from "@/components/data/chart/difficulty";

export const SALTMETA_NEXT_COMPACTED_URL =
    "https://meta.salt.realtvop.top/meta.next.compacted.json";
export const SALTMETA_CN_REGION = "cn";
export const SALTMETA_DX_ID_OFFSET = 10000;
const SALTMETA_CHART_ID_MULTIPLIER = 100;
export const SALTMETA_CURRENT_CN_VERSION = "舞萌DX 2026";
export const SALTMETA_NEXT_COMPACTED_VERSION = 1;

export type SaltMetaCnVersionInfo = {
    name: string;
    word: string;
};

type SaltMetaRegion = "jp" | "intl" | "cn" | "us";
type SaltMetaDifficulty = 0 | 1 | 2 | 3 | 4 | 10;
type SaltMetaChartType = "sd" | "dx" | "utage";

type SaltMetaVersion = {
    version: string;
    word: string;
    releaseDate: string;
    cnVerOverride: number | null;
};

type SaltMetaChartRegionData = {
    level: string;
    internalLevel: number;
    version: string | number;
};

type SaltMetaFitDiffDF = {
    cnt: number;
    diff: string;
    fitDiff: number;
    avg: number;
    avgDx: number;
    stdDev: number;
    dist: number[];
    fcDist: number[];
};

type SaltMetaChartNext = {
    type: SaltMetaChartType;
    difficulty: SaltMetaDifficulty;
    noteDesigner: string;
    noteCounts: {
        tap: number;
        hold: number;
        slide: number;
        touch: number | null;
        break: number;
        total: number;
    };
    regions: Partial<Record<SaltMetaRegion, SaltMetaChartRegionData | null>>;
    fitDiffDF?: SaltMetaFitDiffDF;
};

type SaltMetaMusicNext = {
    id: number;
    title: string;
    artist: string;
    bpm: number;
    aliases?: {
        cn: string[];
    };
    comment?: string;
    category: string;
    isLocked: boolean;
    charts: SaltMetaChartNext[];
};

export type SaltMetaMusicMetadataNext = {
    musics: SaltMetaMusicNext[];
    versions: SaltMetaVersion[];
};

type SaltMetaVersionCompacted = [string, string, string, number | null];

type SaltMetaVersionReferenceCompacted = number | ["raw", string | number];

type SaltMetaChartRegionCompacted = [
    SaltMetaRegion,
    string,
    number,
    SaltMetaVersionReferenceCompacted,
];

type SaltMetaFitDiffDFCompacted = [
    number,
    string,
    number,
    number,
    number,
    number,
    number[],
    number[],
];

type SaltMetaChartNextCompacted = [
    number,
    SaltMetaDifficulty,
    SaltMetaChartRegionCompacted[],
    string,
    [number, number, number | null, number, number],
    (SaltMetaFitDiffDFCompacted | null)?,
];

type SaltMetaMusicNextCompacted = [
    number,
    string,
    string,
    number,
    number,
    boolean,
    SaltMetaChartNextCompacted[],
    string[] | null,
    string | null,
];

export type SaltMetaMusicMetadataNextCompacted = {
    version: number;
    musics: SaltMetaMusicNextCompacted[];
    versions: SaltMetaVersionCompacted[];
};

const saltMetaCategories = [
    "POPS＆アニメ",
    "niconico＆ボーカロイド",
    "東方Project",
    "ゲーム＆バラエティ",
    "maimai",
    "オンゲキ＆CHUNITHM",
    "宴会場",
] as const;

const chartTypeNames = ["sd", "dx", "utage"] as const;

const categoryToSaltNetGenre: Record<string, MusicGenre> = {
    "POPS＆アニメ": "POPSアニメ" as unknown as MusicGenre,
    "niconico＆ボーカロイド": "niconicoボーカロイド" as unknown as MusicGenre,
    東方Project: "東方Project" as unknown as MusicGenre,
    "ゲーム＆バラエティ": "ゲームバラエティ" as unknown as MusicGenre,
    maimai: "maimai" as unknown as MusicGenre,
    "オンゲキ＆CHUNITHM": "オンゲキCHUNITHM" as unknown as MusicGenre,
    宴会場: "宴会場" as unknown as MusicGenre,
};

const jpDxVersionToCnVersion: Record<string, string> = {
    maimaiでらっくす: "舞萌DX",
    "maimaiでらっくす PLUS": "舞萌DX",
    Splash: "舞萌DX 2021",
    "Splash PLUS": "舞萌DX 2021",
    UNiVERSE: "舞萌DX 2022",
    "UNiVERSE PLUS": "舞萌DX 2022",
    FESTiVAL: "舞萌DX 2023",
    "FESTiVAL PLUS": "舞萌DX 2023",
    BUDDiES: "舞萌DX 2024",
    "BUDDiES PLUS": "舞萌DX 2024",
    PRiSM: "舞萌DX 2025",
    "PRiSM PLUS": "舞萌DX 2025",
    CiRCLE: "舞萌DX 2026",
    "CiRCLE PLUS": "舞萌DX 2026",
};

const legacyVersionToCnVersion: Record<string, string> = {
    GreeN: "maimai GreeN",
    "GreeN PLUS": "maimai GreeN PLUS",
    ORANGE: "maimai ORANGE",
    "ORANGE PLUS": "maimai ORANGE PLUS",
    PiNK: "maimai PiNK",
    "PiNK PLUS": "maimai PiNK PLUS",
    MURASAKi: "maimai MURASAKi",
    "MURASAKi PLUS": "maimai MURASAKi PLUS",
    MiLK: "maimai MiLK",
    "MiLK PLUS": "maimai MiLK PLUS",
    FiNALE: "maimai FiNALE",
};

function expandVersionReference(
    reference: SaltMetaVersionReferenceCompacted,
    versions: SaltMetaVersion[],
    musicId: number
): string | number {
    if (Array.isArray(reference)) return reference[1];

    const version = versions[reference];
    if (!version) throw new Error(`Version index ${reference} not found for music ${musicId}`);
    return version.version;
}

function expandSaltMetaChart(
    compacted: SaltMetaChartNextCompacted,
    versions: SaltMetaVersion[],
    musicId: number
): SaltMetaChartNext {
    const [
        typeIndex,
        difficulty,
        regionEntries,
        noteDesigner,
        noteCountsCompacted,
        fitDiffDFCompacted,
    ] = compacted;
    const type = chartTypeNames[typeIndex];
    if (!type) throw new Error(`Chart type index ${typeIndex} not found for music ${musicId}`);

    const regions: SaltMetaChartNext["regions"] = {};
    for (const [region, level, internalLevel, versionReference] of regionEntries) {
        regions[region] = {
            level,
            internalLevel,
            version: expandVersionReference(versionReference, versions, musicId),
        };
    }

    const [tap, hold, slideRaw, touchRaw, breakCount] = noteCountsCompacted;
    const slide = slideRaw ?? 0;
    const touch = type === "sd" ? null : touchRaw;

    const chart: SaltMetaChartNext = {
        type,
        difficulty,
        noteDesigner,
        noteCounts: {
            tap,
            hold,
            slide,
            touch,
            break: breakCount,
            total: tap + hold + slide + (touch ?? 0) + breakCount,
        },
        regions,
    };
    if (fitDiffDFCompacted) {
        const [cnt, diff, fitDiff, avg, avgDx, stdDev, dist, fcDist] = fitDiffDFCompacted;
        chart.fitDiffDF = {
            cnt,
            diff,
            fitDiff,
            avg,
            avgDx,
            stdDev,
            dist,
            fcDist,
        };
    }

    return chart;
}

export function convertSaltMetaNextCompactedToNormal(
    compacted: SaltMetaMusicMetadataNextCompacted
): SaltMetaMusicMetadataNext {
    if (compacted.version !== SALTMETA_NEXT_COMPACTED_VERSION) {
        throw new Error(
            `SaltMeta next compacted version mismatch. Expected: ${SALTMETA_NEXT_COMPACTED_VERSION}, Got: ${compacted.version}`
        );
    }

    const versions = compacted.versions.map(([version, word, releaseDate, cnVerOverride]) => ({
        version,
        word,
        releaseDate,
        cnVerOverride,
    }));

    const musics = compacted.musics.map(compactedMusic => {
        const [
            id,
            title,
            artist,
            bpm,
            categoryIndex,
            isLocked,
            chartsCompacted,
            aliasesCn,
            comment,
        ] = compactedMusic;
        const category = saltMetaCategories[categoryIndex];
        if (!category) throw new Error(`Category index ${categoryIndex} not found for music ${id}`);

        const base: SaltMetaMusicNext = {
            id,
            title,
            artist,
            bpm,
            category,
            isLocked,
            charts: chartsCompacted.map(chart => expandSaltMetaChart(chart, versions, id)),
        };
        const withAliases = aliasesCn?.length ? { ...base, aliases: { cn: aliasesCn } } : base;
        return comment ? { ...withAliases, comment } : withAliases;
    });

    return { musics, versions };
}

function getSaltNetMusicId(saltMetaMusicId: number, chartType: SaltMetaChartType): number {
    return chartType === "sd" ? saltMetaMusicId : saltMetaMusicId + SALTMETA_DX_ID_OFFSET;
}

export function getSaltNetMusicIdForChartType(musicId: number, chartType: string): number {
    if (chartType.toUpperCase() !== "DX") return musicId;
    return musicId >= SALTMETA_DX_ID_OFFSET ? musicId : musicId + SALTMETA_DX_ID_OFFSET;
}

export function normalizeSaltMetaCnVersion(version: string | number): string {
    if (typeof version === "number") return `舞萌DX ${version}`;
    return jpDxVersionToCnVersion[version] ?? legacyVersionToCnVersion[version] ?? version;
}

export function getSaltMetaCnVersions(
    metadata: SaltMetaMusicMetadataNext,
    savedMusicList: SavedMusicList
): SaltMetaCnVersionInfo[] {
    const usedVersions = new Set(
        Object.values(savedMusicList.musicList).map(music => music.info.from as unknown as string)
    );
    const versionInfos: SaltMetaCnVersionInfo[] = [];
    const seen = new Set<string>();

    for (const version of metadata.versions) {
        const name = normalizeSaltMetaCnVersion(version.cnVerOverride ?? version.version);
        if (!usedVersions.has(name) || seen.has(name)) continue;
        seen.add(name);
        versionInfos.push({
            name,
            word: version.word,
        });
    }

    for (const version of usedVersions) {
        if (seen.has(version)) continue;
        seen.add(version);
        versionInfos.push({
            name: version,
            word: version,
        });
    }

    return versionInfos;
}

export function getSaltMetaCnVersionPlates(
    metadata: SaltMetaMusicMetadataNext,
    savedMusicList: SavedMusicList
): SaltMetaCnVersionInfo[] {
    const usedVersions = new Set(
        Object.values(savedMusicList.musicList).map(music => music.info.from as unknown as string)
    );

    return metadata.versions
        .map(version => ({
            name: normalizeSaltMetaCnVersion(version.cnVerOverride ?? version.version),
            word: version.word,
        }))
        .filter(version => usedVersions.has(version.name) && version.word.length > 0);
}

function getSaltNetChartType(chartType: SaltMetaChartType): ChartType {
    return chartType === "sd" ? ChartType.Standard : ChartType.Deluxe;
}

function getSaltNetGenre(category: string): MusicGenre {
    return categoryToSaltNetGenre[category] ?? (category as unknown as MusicGenre);
}

function getChartNotes(chart: SaltMetaChartNext): [number, number, number, number, number?] {
    const { tap, hold, slide, touch, break: breakCount } = chart.noteCounts;
    if (chart.type === "sd") return [tap, hold, slide, breakCount];
    return [tap, hold, slide, touch ?? 0, breakCount];
}

function getChartGrade(chart: SaltMetaChartNext): number {
    return chart.type === "utage" ? UTAGE_GRADE : chart.difficulty;
}

function getChartStats(chart: SaltMetaChartNext): ChartStats | undefined {
    const stat = chart.fitDiffDF;
    if (!stat) return undefined;

    return {
        cnt: stat.cnt,
        diff: stat.diff,
        fit_diff: stat.fitDiff,
        avg: stat.avg,
        avg_dx: stat.avgDx,
        std_dev: stat.stdDev,
        dist: stat.dist,
        fc_dist: stat.fcDist,
    };
}

export function convertSaltMetaNextToSavedMusicList(
    metadata: SaltMetaMusicMetadataNext,
    region: typeof SALTMETA_CN_REGION = SALTMETA_CN_REGION
): SavedMusicList {
    const musicList: Record<number, Music> = {};
    const chartList: Record<number, Chart> = {};

    for (const saltMetaMusic of metadata.musics) {
        const chartsByMusicId = new Map<number, Chart[]>();

        for (const saltMetaChart of saltMetaMusic.charts) {
            const regionData = saltMetaChart.regions[region];
            if (!regionData) continue;

            const musicId = getSaltNetMusicId(saltMetaMusic.id, saltMetaChart.type);
            const chartGrade = getChartGrade(saltMetaChart);
            const chartId = musicId * SALTMETA_CHART_ID_MULTIPLIER + chartGrade;
            const cnVersion = normalizeSaltMetaCnVersion(regionData.version);
            let music = musicList[musicId];

            if (!music) {
                const musicInfo: MusicInfo = {
                    id: musicId,
                    title: saltMetaMusic.title,
                    aliases: saltMetaMusic.aliases?.cn,
                    artist: saltMetaMusic.artist,
                    genre: getSaltNetGenre(saltMetaMusic.category),
                    bpm: saltMetaMusic.bpm,
                    from: cnVersion as unknown as MusicOrigin,
                    isNew: cnVersion === SALTMETA_CURRENT_CN_VERSION,
                    type: getSaltNetChartType(saltMetaChart.type),
                };
                music = {
                    id: musicId,
                    info: musicInfo,
                    charts: [],
                };
                musicList[musicId] = music;
                chartsByMusicId.set(musicId, music.charts);
            }

            const deluxeScoreMax = saltMetaChart.noteCounts.total * 3;
            const chartInfo: ChartInfo = {
                notes: getChartNotes(saltMetaChart),
                charter: saltMetaChart.noteDesigner,
                level: regionData.level,
                grade: chartGrade,
                constant: regionData.internalLevel,
                deluxeScoreMax,
                stat: getChartStats(saltMetaChart),
            };
            const chart: Chart = {
                id: chartId,
                info: chartInfo,
                music,
            };

            const charts = chartsByMusicId.get(musicId) ?? music.charts;
            charts.push(chart);
            chartList[chartId] = chart;
        }
    }

    return {
        musicList,
        chartList,
    };
}
