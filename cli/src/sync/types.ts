/**
 * Types shared across sync operations (design 5.1).
 */
import type { ChartRow } from "../catalog/chartRow";
import type { ChartScoreRow } from "../catalog/chartScore";
import type { ErrorCode } from "../errors";
import type { Warning } from "../output/warning";

export const SYNC_SOURCES = ["ingame", "lxns", "df-token", "df-name"] as const;

export type ResolvedSyncSource = (typeof SYNC_SOURCES)[number];

export type CliSyncSource = "auto" | ResolvedSyncSource;

export type SyncMode = "full" | "fast" | "public-b50";

export const UPLOAD_TARGETS = ["diving-fish", "lxns"] as const;
export type UploadTarget = (typeof UPLOAD_TARGETS)[number];

export interface SyncUploadResult {
    readonly target: UploadTarget;
    readonly ok: boolean;
    readonly error: { readonly code: ErrorCode; readonly message: string } | null;
}

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
    readonly uploads: readonly SyncUploadResult[];
}

export interface SyncResultError {
    readonly code: ErrorCode;
    readonly message: string;
    readonly fix?: string;
}

export interface SyncSkippedUser {
    readonly user: SyncUserMeta;
}

export interface SyncAllResult {
    readonly user: SyncUserMeta;
    readonly ok: boolean;
    readonly data: SyncData | null;
    readonly error: SyncResultError | null;
    readonly warnings: readonly Warning[];
}

export interface SyncAllData {
    readonly results: readonly SyncAllResult[];
    readonly skipped: readonly SyncSkippedUser[];
}

export interface SyncPlan {
    readonly user: SyncUserMeta;
    readonly source: ResolvedSyncSource | null;
    readonly mode: "full" | "fast" | null;
    readonly uploads: readonly UploadTarget[];
    readonly effect: "local" | "remote" | "account";
    readonly error: SyncResultError | null;
}

export interface SyncPlanData {
    readonly plans: readonly SyncPlan[];
    readonly skipped: readonly SyncSkippedUser[];
}
