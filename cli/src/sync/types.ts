/**
 * Types shared across sync operations (design 5.1).
 */
import type { ChartRow } from "../catalog/chartRow";
import type { ChartScoreRow } from "../catalog/chartScore";

export type CliSyncSource = "auto" | "ingame" | "lxns" | "df-token" | "df-name";

export type ResolvedSyncSource = Exclude<CliSyncSource, "auto">;

export type SyncMode = "full" | "fast" | "public-b50";

export interface SyncCounts {
    readonly charts: number;
    readonly added: number;
    readonly improved: number;
}

export interface SyncChangeItem extends ChartRow {
    readonly before: ChartScoreRow | null;
}

export interface SyncRating {
    readonly before: number | null;
    readonly after: number | null;
}

export interface SyncUserMeta {
    readonly uid: string;
    readonly index: number;
    readonly name: string;
}

export interface SyncData {
    readonly user: SyncUserMeta;
    readonly source: ResolvedSyncSource;
    readonly mode: SyncMode;
    readonly rating: SyncRating;
    readonly counts: SyncCounts;
    readonly changes: readonly SyncChangeItem[];
    readonly changesTotal: number;
    readonly missing: number;
    readonly uploads: readonly unknown[];
}
