/**
 * What `status` says about the downloaded sources (design 3.2): when each was fetched, how it
 * stands against `metadata.maxAgeHours`, what it holds, and the upstream songs that were folded
 * together. Nothing here downloads or rebuilds anything; it only reads what `meta_state` records.
 */
import type { MergedDuplicateMusic } from "@core/music/duplicates";
import type { DownloadedSource, MetaState } from "./store";
import { formatLocalTime } from "../util/time";
import { HOUR_MS, isExpired } from "./ensure";
import { SOURCE_LABELS } from "./refresh";
import { CATALOG_BUILDER } from "./store";

/**
 * - `fresh`: stored by this version of the CLI and younger than `metadata.maxAgeHours`.
 * - `stale`: stored but too old; the next command that reads it downloads it again.
 * - `other-version`: stored by another version of the CLI; the next command that reads it rebuilds
 *   it from the snapshot in `cache/` (or downloads it when there is none).
 * - `missing`: nothing stored yet.
 */
export type SourceState = "fresh" | "stale" | "other-version" | "missing";

export interface SourceStatus {
    /** The name of the source, as `refresh` reports it. */
    readonly source: DownloadedSource;
    readonly label: string;
    readonly state: SourceState;
    /** When it was downloaded, in the machine's time zone; null when nothing is stored. */
    readonly fetchedAt: string | null;
    /** Hours since then, to one decimal; null when nothing is stored. */
    readonly ageHours: number | null;
    /** The version of the upstream document, when the source has one. */
    readonly upstreamVersion: string | null;
    /** How many of what the download held (songs and charts, or collections by kind). */
    readonly counts: Readonly<Record<string, number>> | null;
}

function stateOf(stored: MetaState | undefined, now: Date, maxAgeHours: number): SourceState {
    if (!stored) return "missing";
    if (stored.builder !== CATALOG_BUILDER) return "other-version";
    return isExpired(stored.fetchedAt, now, maxAgeHours) ? "stale" : "fresh";
}

/** The numbers in what a refresh found; the lists in it (the merged songs) are not counts. */
function countsOf(detail: MetaState["detail"]): Record<string, number> | null {
    if (!detail) return null;
    const counts = Object.entries(detail).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number"
    );
    return counts.length > 0 ? Object.fromEntries(counts) : null;
}

/** One source as `status` shows it; `stored` is its `meta_state` row, if it has one. */
export function sourceStatus(
    source: DownloadedSource,
    stored: MetaState | undefined,
    now: Date,
    maxAgeHours: number
): SourceStatus {
    return {
        source,
        label: SOURCE_LABELS[source],
        state: stateOf(stored, now, maxAgeHours),
        fetchedAt: stored ? formatLocalTime(new Date(stored.fetchedAt)) : null,
        ageHours: stored
            ? Math.round((Math.max(0, now.getTime() - stored.fetchedAt) / HOUR_MS) * 10) / 10
            : null,
        upstreamVersion: stored?.upstreamVersion ?? null,
        counts: stored ? countsOf(stored.detail) : null,
    };
}

function isMergedDuplicate(value: unknown): value is MergedDuplicateMusic {
    if (typeof value !== "object" || value === null) return false;
    const { id, title, mergedTitles } = value as Record<string, unknown>;
    return (
        typeof id === "number" &&
        typeof title === "string" &&
        Array.isArray(mergedTitles) &&
        mergedTitles.every(merged => typeof merged === "string")
    );
}

/**
 * The songs that upstream lists more than once and that the catalog folded into one entry, as the
 * last download of the song catalog recorded them (empty when there is none).
 */
export function mergedDuplicatesOf(stored: MetaState | undefined): MergedDuplicateMusic[] {
    const recorded = stored?.detail?.mergedDuplicates;
    if (!Array.isArray(recorded)) return [];
    return recorded
        .filter(isMergedDuplicate)
        .map(({ id, title, mergedTitles }) => ({ id, title, mergedTitles }));
}
