export type KaleidxscopeGateId =
    | "blue"
    | "white"
    | "purple"
    | "black"
    | "yellow"
    | "red"
    | "prism"
    | "noise"
    | "hope"
    | "final";

export type KaleidxscopeDifficulty = "BASIC" | "EXPERT" | "MASTER" | "Re:MASTER";

export interface KaleidxscopeSong {
    musicId: number;
    title: string;
}

export interface KaleidxscopeLifePair {
    first: number;
    second: number;
}

export type KaleidxscopeLife = number | KaleidxscopeLifePair;

export interface KaleidxscopeLifePhase {
    /** ISO 8601 timestamp. CN schedules use UTC+8. */
    startsAt: string;
    difficulty: KaleidxscopeDifficulty;
    life: KaleidxscopeLife;
}

export interface KaleidxscopeKeyCondition {
    summary: string;
    songs: KaleidxscopeSong[];
}

export interface KaleidxscopeSelectionPool {
    track: 1 | 2 | 3;
    label?: string;
    description: string;
    selection: "random" | "fixed";
    songs: KaleidxscopeSong[];
    unlistedDescription?: string;
}

export interface KaleidxscopeGate {
    id: KaleidxscopeGateId;
    name: string;
    shortName: string;
    region: string;
    description?: string;
    lifeNote?: string;
    openedAt: string;
    keyCondition: KaleidxscopeKeyCondition;
    lifePhases: KaleidxscopeLifePhase[];
    selectionPools: KaleidxscopeSelectionPool[];
}

export type KaleidxscopePhaseStatus = "past" | "current" | "future";
