// src/types/user.ts
import type { DivingFishB50 } from "@/divingfish/type";

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
    };
}