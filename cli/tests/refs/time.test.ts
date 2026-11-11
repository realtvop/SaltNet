import { describe, expect, it } from "vitest";
import { parseTime, parseTimeOption } from "../../src/refs/time";
import { formatLocalTime } from "../../src/util/time";
import { caught } from "../caught";
import { useTimeZone } from "../zone";

// Not UTC and not UTC+8, and with summer time, so a time read in the wrong zone shows.
useTimeZone("America/New_York");

describe("parseTime", () => {
    describe("with a zone", () => {
        it("parses explicit offsets and UTC", () => {
            expect(parseTime("2026-10-01T07:00:00+08:00")?.getTime()).toBe(
                Date.UTC(2026, 8, 30, 23, 0, 0)
            );
            expect(parseTime("2026-10-01T07:00:00Z")?.getTime()).toBe(
                Date.UTC(2026, 9, 1, 7, 0, 0)
            );
            expect(parseTime("2026-10-01T07:00:00z")?.getTime()).toBe(
                Date.UTC(2026, 9, 1, 7, 0, 0)
            );
            expect(parseTime("2026-10-01T07:00:00+0800")?.getTime()).toBe(
                Date.UTC(2026, 8, 30, 23, 0, 0)
            );
            expect(parseTime("2026-10-01T07:00:00+08")?.getTime()).toBe(
                Date.UTC(2026, 8, 30, 23, 0, 0)
            );
            expect(parseTime("2026-10-01T07:00:00-05:30")?.getTime()).toBe(
                Date.UTC(2026, 9, 1, 12, 30, 0)
            );
        });

        it("allows omitting seconds or using space instead of T", () => {
            expect(parseTime("2026-10-01T07:00+08:00")?.getTime()).toBe(
                Date.UTC(2026, 8, 30, 23, 0, 0)
            );
            expect(parseTime("2026-10-01 07:00:00+08:00")?.getTime()).toBe(
                Date.UTC(2026, 8, 30, 23, 0, 0)
            );
        });

        it("handles fractional seconds with truncation", () => {
            expect(parseTime("2026-10-01T07:00:00.5Z")?.getTime()).toBe(
                Date.UTC(2026, 9, 1, 7, 0, 0) + 500
            );
            expect(parseTime("2026-10-01T07:00:00.123456789Z")?.getTime()).toBe(
                Date.UTC(2026, 9, 1, 7, 0, 0) + 123
            );
            expect(parseTime("2026-10-01T07:00:00.1Z")?.getTime()).toBe(
                Date.UTC(2026, 9, 1, 7, 0, 0) + 100
            );
        });

        it("trims surrounding white space", () => {
            expect(parseTime("  2026-10-01T07:00:00Z  ")?.getTime()).toBe(
                Date.UTC(2026, 9, 1, 7, 0, 0)
            );
        });

        it("handles boundary dates correctly", () => {
            expect(parseTime("2024-02-29T00:00:00Z")?.getTime()).toBe(Date.UTC(2024, 1, 29));
            expect(parseTime("2026-12-31T23:59:59Z")?.getTime()).toBe(
                Date.UTC(2026, 11, 31, 23, 59, 59)
            );
            expect(parseTime("2026-01-01T00:00:00Z")?.getTime()).toBe(
                Date.UTC(2026, 0, 1, 0, 0, 0)
            );
            expect(parseTime("0100-01-01T00:00:00Z")?.getTime()).toBe(Date.UTC(100, 0, 1, 0, 0, 0));
            expect(parseTime("0099-01-01T00:00:00Z")).toBeUndefined();
        });
    });

    describe("without a zone", () => {
        it("reads fields in the machine's zone", () => {
            expect(parseTime("2026-10-01T07:00")?.getTime()).toBe(
                new Date(2026, 9, 1, 7, 0, 0).getTime()
            );
            expect(parseTime("2026-10-01T07:00:30")?.getTime()).toBe(
                new Date(2026, 9, 1, 7, 0, 30).getTime()
            );
            expect(parseTime("2026-10-01 07:00")?.getTime()).toBe(
                new Date(2026, 9, 1, 7, 0, 0).getTime()
            );
            expect(parseTime("2026-10-01T07:00:00.250")?.getTime()).toBe(
                new Date(2026, 9, 1, 7, 0, 0, 250).getTime()
            );
        });

        it("interprets a date alone as that day's midnight in local time", () => {
            expect(parseTime("2026-10-01")?.getTime()).toBe(new Date(2026, 9, 1).getTime());
        });

        it("reads them in the machine's zone, whatever it is", () => {
            // New York is at UTC-4 in October (summer time) and at UTC-5 in December.
            expect(parseTime("2026-10-01T07:00")?.toISOString()).toBe("2026-10-01T11:00:00.000Z");
            expect(parseTime("2026-12-01T07:00")?.toISOString()).toBe("2026-12-01T12:00:00.000Z");
            expect(parseTime("2026-12-01")?.toISOString()).toBe("2026-12-01T05:00:00.000Z");
        });

        it("formats back to local time starting with the date and time", () => {
            const time = parseTime("2026-10-01T07:00:00");
            expect(time).toBeDefined();
            expect(formatLocalTime(time!)).toMatch(/^2026-10-01T07:00:00/);
        });
    });

    describe("invalid or non-existent times", () => {
        const invalidTexts = [
            "2026-00-01T00:00:00Z",
            "2026-13-01T00:00:00Z",
            "2026-01-00T00:00:00Z",
            "2026-01-32T00:00:00Z",
            "2026-02-29",
            "2100-02-29",
            "2026-04-31",
            "2026-02-29T00:00:00Z",
            "2100-02-29T00:00:00Z",
            "2026-04-31T00:00:00Z",
            "2026-10-01T24:00:00Z",
            "2026-10-01T07:60:00Z",
            "2026-10-01T07:00:60Z",
            "2026-10-01T07:00:00+24:00",
            "2026-10-01T07:00:00+08:60",
            "yesterday",
            "7d",
            "2026-10",
            "2026-10-1",
            "20261001",
            "2026/10/01",
            "2026-10-01T07",
            "2026-10-01T7:00",
            "2026-10-01Z",
            "2026-10-01T07:00+8",
            "2026-10-01T07:00+08:0",
            "2026-1-01",
            "26-10-01",
            "2026-10-01T07:00:00.",
            "2026-10-01T07:00:00 +08:00",
            "",
            "   ",
            "0099-01-01T00:00:00Z",
        ];

        for (const text of invalidTexts) {
            it(`returns undefined for ${JSON.stringify(text)}`, () => {
                expect(parseTime(text)).toBeUndefined();
            });
        }
    });
});

describe("parseTimeOption", () => {
    it("returns the parsed date for a valid time text", () => {
        expect(parseTimeOption("at", "2026-10-01T07:00:00Z").getTime()).toBe(
            Date.UTC(2026, 9, 1, 7, 0, 0)
        );
    });

    it("throws a USAGE error for invalid dates with short plain text echoed", () => {
        const err = caught(() => parseTimeOption("at", "2026-13-01"));
        expect(err.code).toBe("USAGE");
        expect(err.message).toBe(
            "选项 --at 的值「2026-13-01」不是时间；写成 ISO 8601，例如 2026-10-01、2026-10-01T07:00 或 2026-10-01T07:00:00+08:00，没写时区就按本机时区算"
        );
    });

    it("throws a USAGE error without echoed text for odd characters or long text", () => {
        const errOdd = caught(() => parseTimeOption("at", "not a time!"));
        expect(errOdd.code).toBe("USAGE");
        expect(errOdd.message).toBe(
            "选项 --at 的值不是时间；写成 ISO 8601，例如 2026-10-01、2026-10-01T07:00 或 2026-10-01T07:00:00+08:00，没写时区就按本机时区算"
        );

        const longText = "a".repeat(41);
        const errLong = caught(() => parseTimeOption("at", longText));
        expect(errLong.code).toBe("USAGE");
        expect(errLong.message).toBe(
            "选项 --at 的值不是时间；写成 ISO 8601，例如 2026-10-01、2026-10-01T07:00 或 2026-10-01T07:00:00+08:00，没写时区就按本机时区算"
        );
    });

    it("writes the flag name as given", () => {
        const err = caught(() => parseTimeOption("since", "x"));
        expect(err.code).toBe("USAGE");
        expect(err.message).toMatch(/^选项 --since 的值「x」不是时间/);
    });
});
