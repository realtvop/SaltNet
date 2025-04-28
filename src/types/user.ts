// src/types/user.ts
import type { DivingFishB50, DivingFishFullRecord } from "@/divingfish/type";

export interface User {
    divingFish: {
        name: string | null;
        importToken?: string | null;
    };
    inGame: {
        name?: string | null;
        id: number | null;
    };
    data: {
        rating?: number | null;
        b50?: DivingFishB50;
        detailed?: DetailedData;
    };
}

type DetailedData = Record<number, DivingFishFullRecord>;

export function convertDetailed(data: DivingFishFullRecord[]): DetailedData {
    const result: DetailedData = {};

    for (const item of data) 
        result[Number(item.song_id)] = item;

    return result;
}