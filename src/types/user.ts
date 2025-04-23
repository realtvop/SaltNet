// src/types/user.ts
export interface User {
    divingFish: {
        name: string | null;
        importToken?: string | null; // Optional
    };
    inGame: {
        name: string | null;
        id: number | null;
    };
    data?: { // Optional data section
        rating?: number | null;
        // other potential data fields
    } | null;
}