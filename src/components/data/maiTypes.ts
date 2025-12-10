export enum ComboStatus {
    None = "",
    FullCombo = "fc",
    FullComboPlus = "fcp",
    AllPerfect = "ap",
    AllPerfectPlus = "app",
}

export enum SyncStatus {
    None = "",
    Sync = "sync",
    FullSync = "fs",
    FullSyncPlus = "fsp",
    FullSyncDX = "fsd",
    FullSyncDXPlus = "fsdp",
}

export enum RankRate {
    d = "d",
    c = "c",
    b = "b",
    bb = "bb",
    bbb = "bbb",
    a = "a",
    aa = "aa",
    aaa = "aaa",
    s = "s",
    sp = "sp",
    ss = "ss",
    ssp = "ssp",
    sss = "sss",
    sssp = "sssp",
}

export enum ChartType {
    Standard = "SD",
    Deluxe = "DX",
}

export enum MusicOrigin {
    "maimai",
    "maimai PLUS",
    "maimai GreeN",
    "maimai GreeN PLUS",
    "maimai ORANGE",
    "maimai ORANGE PLUS",
    "maimai PiNK",
    "maimai PiNK PLUS",
    "maimai MURASAKi",
    "maimai MURASAKi PLUS",
    "maimai MiLK",
    "maimai MiLK PLUS",
    "maimai FiNALE",
    "maimai でらっくす",
    "maimai でらっくす PLUS",
    "maimai でらっくす Splash",
    "maimai でらっくす Splash PLUS",
    "maimai でらっくす UNiVERSE",
    "maimai でらっくす UNiVERSE PLUS",
    "maimai でらっくす FESTiVAL",
    "maimai でらっくす FESTiVAL PLUS",
    "maimai でらっくす BUDDiES",
    "maimai でらっくす BUDDiES PLUS",
    "maimai でらっくす PRiSM",
    "maimai でらっくす PRiSM PLUS",
    "maimai でらっくす CiRCLE",
    // "maimai でらっくす CiRCLE PLUS",
}

export enum MusicGenre {
    "宴会場",
    "POPS＆アニメ",
    "niconico＆ボーカロイド",
    "東方Project",
    "ゲーム＆バラエティ",
    "maimai",
    "オンゲキ＆CHUNITHM",
}

export enum MusicGenreCN {
    "宴会場" = "宴会场",
    "POPS＆アニメ" = "流行&动漫",
    "niconico＆ボーカロイド" = "niconico & VOCALOID",
    "東方Project" = "东方Project",
    "ゲーム＆バラエティ" = "其他游戏",
    "maimai" = "舞萌",
    "オンゲキ＆CHUNITHM" = "音击&中二节奏",
}

export const MusicGenreCNMap: Record<MusicGenre, MusicGenreCN> = {
    [MusicGenre["宴会場"]]: MusicGenreCN["宴会場"],
    [MusicGenre["POPS＆アニメ"]]: MusicGenreCN["POPS＆アニメ"],
    [MusicGenre["niconico＆ボーカロイド"]]: MusicGenreCN["niconico＆ボーカロイド"],
    [MusicGenre["東方Project"]]: MusicGenreCN["東方Project"],
    [MusicGenre["ゲーム＆バラエティ"]]: MusicGenreCN["ゲーム＆バラエティ"],
    [MusicGenre["maimai"]]: MusicGenreCN["maimai"],
    [MusicGenre["オンゲキ＆CHUNITHM"]]: MusicGenreCN["オンゲキ＆CHUNITHM"],
}

export function getMusicGenreCN(genre: MusicGenre): MusicGenreCN {
    return MusicGenreCN[MusicGenre[genre] as keyof typeof MusicGenre];
}

/**
 * RankRate到显示名称的映射
 */
export const RANK_RATE_DISPLAY_NAMES: Record<RankRate, string> = {
    [RankRate.d]: "D",
    [RankRate.c]: "C",
    [RankRate.b]: "B",
    [RankRate.bb]: "BB",
    [RankRate.bbb]: "BBB",
    [RankRate.a]: "A",
    [RankRate.aa]: "AA",
    [RankRate.aaa]: "AAA",
    [RankRate.s]: "S",
    [RankRate.sp]: "S+",
    [RankRate.ss]: "SS",
    [RankRate.ssp]: "SS+",
    [RankRate.sss]: "SSS",
    [RankRate.sssp]: "SSS+",
};

/**
 * 达成率阈值配置，按降序排列
 */
export const ACHIEVEMENT_RATE_THRESHOLDS = [
    { threshold: 100.5, rank: RankRate.sssp },
    { threshold: 100.0, rank: RankRate.sss },
    { threshold: 99.5, rank: RankRate.ssp },
    { threshold: 99.0, rank: RankRate.ss },
    { threshold: 98.0, rank: RankRate.sp },
    { threshold: 97.0, rank: RankRate.s },
    { threshold: 94.0, rank: RankRate.aaa },
    { threshold: 90.0, rank: RankRate.aa },
    { threshold: 80.0, rank: RankRate.a },
    { threshold: 75.0, rank: RankRate.bbb },
    { threshold: 70.0, rank: RankRate.bb },
    { threshold: 60.0, rank: RankRate.b },
    { threshold: 50.0, rank: RankRate.c },
] as const;

/**
 * 根据达成率获取对应的RankRate等级
 * @param achievementRate 达成率（百分比形式，如 99.5 表示 99.5%）
 * @returns 对应的RankRate等级
 */
export const getRankRateByAchievement = (achievementRate: number): RankRate =>
    ACHIEVEMENT_RATE_THRESHOLDS.find(item => achievementRate >= item.threshold)?.rank ?? RankRate.d;
