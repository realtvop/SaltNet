import type { AvailableRegion, MusicDifficultyID } from "./data";

export interface Music {
    id: number; // < 10000, same for sd and dx
    title: string;
    artist: string;
    bpm: number;

    aliases?: {
        cn: string[];
    };

    // releaseDate: string;
    category: string;
    isLocked: boolean; // needs unlocking

    charts: Chart[];
}

export interface Chart {
    type: "sd" | "dx" | "utage";
    difficulty: MusicDifficultyID;
    level: string;
    internalLevel: number;
    version: string | null;
    regionVersionOverride?: Partial<Record<AvailableRegion, string | number>>;

    noteDesigner: string;
    noteCounts: {
        tap: number;
        hold: number;
        slide: number;
        touch: number | null;
        break: number;
        total: number;
    };

    availableRegions: AvailableRegion[];
    // isSpecial: boolean;
}

export interface Version {
    version: string;
    word: string; // 一个字简称
    releaseDate: string;
    cnVerOverride: number | null; // 中国版特有的版本名年份
}
