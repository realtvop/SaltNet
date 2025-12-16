// src/types/user.ts
import type {
    DivingFishB50,
    DivingFishFullRecord,
} from "@/components/integrations/diving-fish/type";
import type { Chart } from "../music/type";
import type { Level, UserItem, UserInfo, UserCharacter } from "../inGame";
import type { LXNSAuth } from "@/components/integrations/lxns";

export interface User {
    uid?: string;
    remark?: string | null;
    divingFish: {
        name: string | null;
        importToken?: string | null;
    };
    lxns?: {
        auth: LXNSAuth | null;
        name: string | null;
        id: number | null;
    };
    inGame: {
        name?: string | null;
        id: number | null;
    };
    settings: {
        manuallyUpdate: boolean;
    };
    data: {
        updateTime: number | null;
        name: string | null;
        rating: number | null;
        b50?: DivingFishB50;
        detailed?: DetailedData;
        items?: UserItem[][];
        characters?: UserCharacter[];
        info?: UserInfo;
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

export function getUserDisplayName(user: User, fallback: string = "wmc"): string {
    if (!user) return fallback;

    return (
        user.remark ??
        user.data.name ??
        user.inGame.name ??
        user.divingFish.name ??
        (user.inGame.id ? user.inGame.id.toString() : fallback)
    );
}
