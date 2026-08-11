export type KaleidxscopeGateId = "blue" | "white" | "purple" | "black" | "yellow" | "red";

export type KaleidxscopeDifficulty = "BASIC" | "EXPERT" | "MASTER";

export interface KaleidxscopeSong {
    musicId: number;
    title: string;
}

export interface KaleidxscopeLifePhase {
    /** ISO 8601 timestamp. CN schedules use UTC+8. */
    startsAt: string;
    difficulty: KaleidxscopeDifficulty;
    life: number;
}

export interface KaleidxscopeKeyCondition {
    summary: string;
    notes: string[];
    songs: KaleidxscopeSong[];
}

export interface KaleidxscopeSelectionPool {
    track: 1 | 2 | 3;
    description: string;
    selection: "random" | "fixed";
    songs: KaleidxscopeSong[];
}

export interface KaleidxscopeGate {
    id: KaleidxscopeGateId;
    name: string;
    shortName: string;
    region: string;
    openedAt: string;
    keyCondition: KaleidxscopeKeyCondition;
    lifePhases: KaleidxscopeLifePhase[];
    selectionPools: KaleidxscopeSelectionPool[];
}

export type KaleidxscopePhaseStatus = "past" | "current" | "future";
