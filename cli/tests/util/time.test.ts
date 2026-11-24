import { describe, expect, it } from "vitest";
import { formatLocalTime, formatWithOffset } from "../../src/util/time";

describe("writing a time with an offset", () => {
    const at = new Date("2026-11-10T01:12:03.456Z");

    it("shifts to the offset and writes it after the time", () => {
        expect(formatWithOffset(at, 480)).toBe("2026-11-10T09:12:03+08:00");
    });

    it("writes a negative offset with a minus sign and its minutes", () => {
        expect(formatWithOffset(at, -330)).toBe("2026-11-09T19:42:03-05:30");
    });

    it("writes UTC as +00:00", () => {
        expect(formatWithOffset(at, 0)).toBe("2026-11-10T01:12:03+00:00");
    });

    it("carries into the next year", () => {
        expect(formatWithOffset(new Date("2026-12-31T20:00:00Z"), 480)).toBe(
            "2027-01-01T04:00:00+08:00"
        );
    });
});

describe("writing a time in the machine's zone", () => {
    it("names the same instant, to the second", () => {
        const at = new Date("2026-11-10T01:12:03.999Z");
        const written = formatLocalTime(at);

        expect(written).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
        expect(new Date(written).getTime()).toBe(Math.floor(at.getTime() / 1000) * 1000);
    });
});
