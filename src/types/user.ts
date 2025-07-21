// src/types/user.ts
import type { DivingFishB50, DivingFishFullRecord } from "@/divingfish/type";
import type { Chart } from "./music";
import type { Level } from "./inGame";

export interface User {
    uid?: string;
    remark?: string | null;
    divingFish: {
        name: string | null;
        importToken?: string | null;
    };
    inGame: {
        name?: string | null;
        id: number | null;
    };
    data: {
        updateTime: number | null;
        name: string | null;
        rating: number | null;
        b50?: DivingFishB50;
        detailed?: DetailedData;
    };
}
export interface ChartsSortCached {
    identifier: {
        name: string;
        updateTime: number;
        verBuildTime: number;
    };
    charts: Chart[];
}

// favorite charts
export interface FavoriteList {
    name: string;
    charts: FavoriteChart[];
}
export interface FavoriteChart {
    i: number; // id
    d: Level;
}

type DetailedData = Record<string, DivingFishFullRecord>;

export function convertDetailed(data: DivingFishFullRecord[]): DetailedData {
    const result: DetailedData = {};

    for (const item of data) result[`${item.song_id}-${item.level_index}`] = item;

    return result;
}
