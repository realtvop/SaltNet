import type { MetaState } from "../../src/catalog/store";
import { describe, expect, it } from "vitest";
import { HOUR_MS } from "../../src/catalog/ensure";
import { mergedDuplicatesOf, sourceStatus } from "../../src/catalog/statusView";
import { CATALOG_BUILDER } from "../../src/catalog/store";
import { formatLocalTime } from "../../src/util/time";
import { useTimeZone } from "../zone";

describe("statusView", () => {
    useTimeZone("Asia/Shanghai");

    describe("sourceStatus", () => {
        const now = new Date("2026-11-11T12:00:00Z");

        it("returns missing state with all null fields when stored is undefined", () => {
            const status = sourceStatus("saltmeta", undefined, now, 24);
            expect(status).toEqual({
                source: "saltmeta",
                label: "曲库（SaltMeta）",
                state: "missing",
                fetchedAt: null,
                ageHours: null,
                upstreamVersion: null,
                counts: null,
            });

            const lxnsStatus = sourceStatus("lxns-collections", undefined, now, 24);
            expect(lxnsStatus.label).toBe("收藏品（落雪）");
            expect(lxnsStatus.state).toBe("missing");
        });

        it("returns fresh state when younger than maxAgeHours", () => {
            const fetchedAt = now.getTime() - 2 * HOUR_MS;
            const stored: MetaState = {
                source: "saltmeta",
                fetchedAt,
                upstreamVersion: "1",
                builder: CATALOG_BUILDER,
                detail: { songs: 3, charts: 9, versions: 2 },
            };
            const status = sourceStatus("saltmeta", stored, now, 24);
            expect(status.state).toBe("fresh");
            expect(status.fetchedAt).toBe(formatLocalTime(new Date(fetchedAt)));
            expect(status.ageHours).toBe(2);
            expect(status.upstreamVersion).toBe("1");
            expect(status.counts).toEqual({ songs: 3, charts: 9, versions: 2 });
        });

        it("is stale exactly at the limit and fresh one millisecond before", () => {
            const maxAgeHours = 24;
            const exactlyAtLimit: MetaState = {
                source: "saltmeta",
                fetchedAt: now.getTime() - maxAgeHours * HOUR_MS,
                upstreamVersion: "1",
                builder: CATALOG_BUILDER,
                detail: null,
            };
            expect(sourceStatus("saltmeta", exactlyAtLimit, now, maxAgeHours).state).toBe("stale");

            const oneMsBefore: MetaState = {
                source: "saltmeta",
                fetchedAt: now.getTime() - (maxAgeHours * HOUR_MS - 1),
                upstreamVersion: "1",
                builder: CATALOG_BUILDER,
                detail: null,
            };
            expect(sourceStatus("saltmeta", oneMsBefore, now, maxAgeHours).state).toBe("fresh");
        });

        it("is stale at age 0 when maxAgeHours is 0", () => {
            const stored: MetaState = {
                source: "saltmeta",
                fetchedAt: now.getTime(),
                upstreamVersion: "1",
                builder: CATALOG_BUILDER,
                detail: null,
            };
            expect(sourceStatus("saltmeta", stored, now, 0).state).toBe("stale");
        });

        it("is other-version when builder differs, even when expired, keeping details", () => {
            const fetchedAt = now.getTime() - 50 * HOUR_MS;
            const stored: MetaState = {
                source: "saltmeta",
                fetchedAt,
                upstreamVersion: "1",
                builder: "catalog-0/old",
                detail: { songs: 5 },
            };
            const status = sourceStatus("saltmeta", stored, now, 24);
            expect(status.state).toBe("other-version");
            expect(status.fetchedAt).toBe(formatLocalTime(new Date(fetchedAt)));
            expect(status.ageHours).toBe(50);
            expect(status.counts).toEqual({ songs: 5 });
        });

        it("calculates ageHours rounded to one decimal and handles future times", () => {
            const checkAge = (msAgo: number) => {
                const stored: MetaState = {
                    source: "saltmeta",
                    fetchedAt: now.getTime() - msAgo,
                    upstreamVersion: null,
                    builder: CATALOG_BUILDER,
                    detail: null,
                };
                return sourceStatus("saltmeta", stored, now, 24).ageHours;
            };

            expect(checkAge(90 * 60 * 1000)).toBe(1.5);
            expect(checkAge(80 * 60 * 1000)).toBe(1.3);
            expect(checkAge(100 * 60 * 1000)).toBe(1.7);
            expect(checkAge(20 * 60 * 1000)).toBe(0.3);
            expect(checkAge(25 * HOUR_MS)).toBe(25);
            expect(checkAge(-10 * 60 * 1000)).toBe(0);
        });

        it("extracts numeric counts from detail, returning null when none exist", () => {
            const makeStored = (detail: MetaState["detail"]): MetaState => ({
                source: "saltmeta",
                fetchedAt: now.getTime(),
                upstreamVersion: null,
                builder: CATALOG_BUILDER,
                detail,
            });

            expect(
                sourceStatus(
                    "saltmeta",
                    makeStored({ songs: 3, charts: 9, versions: 2, nonNumeric: "str" }),
                    now,
                    24
                ).counts
            ).toEqual({ songs: 3, charts: 9, versions: 2 });

            expect(sourceStatus("saltmeta", makeStored(null), now, 24).counts).toBeNull();
            expect(sourceStatus("saltmeta", makeStored({}), now, 24).counts).toBeNull();
            expect(
                sourceStatus("saltmeta", makeStored({ mergedDuplicates: [] }), now, 24).counts
            ).toBeNull();
        });

        it("preserves null upstreamVersion", () => {
            const stored: MetaState = {
                source: "lxns-collections",
                fetchedAt: now.getTime(),
                upstreamVersion: null,
                builder: CATALOG_BUILDER,
                detail: null,
            };
            expect(sourceStatus("lxns-collections", stored, now, 24).upstreamVersion).toBeNull();
        });
    });

    describe("mergedDuplicatesOf", () => {
        it("returns [] for undefined, missing detail, or non-array mergedDuplicates", () => {
            expect(mergedDuplicatesOf(undefined)).toEqual([]);

            const storedNoDetail: MetaState = {
                source: "saltmeta",
                fetchedAt: 0,
                upstreamVersion: null,
                builder: CATALOG_BUILDER,
                detail: null,
            };
            expect(mergedDuplicatesOf(storedNoDetail)).toEqual([]);

            const storedNonArray: MetaState = {
                source: "saltmeta",
                fetchedAt: 0,
                upstreamVersion: null,
                builder: CATALOG_BUILDER,
                detail: { mergedDuplicates: "invalid" as unknown as [] },
            };
            expect(mergedDuplicatesOf(storedNonArray)).toEqual([]);
        });

        it("filters out invalid entries and preserves exact fields in order", () => {
            const stored: MetaState = {
                source: "saltmeta",
                fetchedAt: 0,
                upstreamVersion: null,
                builder: CATALOG_BUILDER,
                detail: {
                    mergedDuplicates: [
                        { id: 101, title: "Valid 1", mergedTitles: ["Sub 1"], extraField: true },
                        null,
                        "string-entry",
                        { title: "Missing ID", mergedTitles: [] },
                        { id: "not-a-number", title: "String ID", mergedTitles: [] },
                        { id: 102, title: "Bad Sub", mergedTitles: [123] },
                        { id: 104, mergedTitles: ["No title"] },
                        { id: 105, title: "No titles" },
                        { id: 106, title: "Mixed", mergedTitles: ["Sub 4", 4] },
                        { id: 107, title: "Titles not a list", mergedTitles: "Sub 5" },
                        { id: 103, title: "Valid 2", mergedTitles: ["Sub 2", "Sub 3"] },
                    ],
                },
            };

            const result = mergedDuplicatesOf(stored);
            expect(result).toEqual([
                { id: 101, title: "Valid 1", mergedTitles: ["Sub 1"] },
                { id: 103, title: "Valid 2", mergedTitles: ["Sub 2", "Sub 3"] },
            ]);
            expect(Object.keys(result[0])).toEqual(["id", "title", "mergedTitles"]);
        });
    });
});
