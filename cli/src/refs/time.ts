/**
 * Times as the commands read them (design 4.1): ISO 8601, and a time without a zone is in the
 * machine's own time zone. A date alone (`2026-10-01`) is that day's midnight. The space between
 * the date and the time may stand in for the `T`, the zone may be `Z`, `+08:00`, `+0800` or `+08`,
 * and the seconds and the fraction of a second may be left out.
 */
import { usageError } from "../errors";
import { echo } from "../util/echo";

const TIME =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;
const ZONE = /^([+-])(\d{2})(?::?(\d{2}))?$/;

/** The offset of a written zone in minutes east of UTC, or undefined when it is not a real one. */
function zoneOffset(zone: string): number | undefined {
    if (zone.toUpperCase() === "Z") return 0;
    const match = ZONE.exec(zone);
    if (!match) return undefined;
    const hours = Number(match[2]);
    const minutes = Number(match[3] ?? "0");
    if (hours > 23 || minutes > 59) return undefined;
    return (match[1] === "-" ? -1 : 1) * (hours * 60 + minutes);
}

/** The instant a text names, or undefined when it is not a time that exists. */
export function parseTime(text: string): Date | undefined {
    const match = TIME.exec(text.trim());
    if (!match) return undefined;
    const [year, month, day, hour, minute, second] = match
        .slice(1, 7)
        .map(part => Number(part ?? 0));
    const millisecond = Number((match[7] ?? "").padEnd(3, "0").slice(0, 3));

    // A day that does not exist (February 30) would roll over into the next month, so it is
    // checked in UTC, where nothing else can move it. The year and the day catch the rest: a
    // month of 0 or 13 moves the year (so does a year before 100, which `Date.UTC` reads as 19xx)
    // and an hour of 24 or more moves the day. A minute or second of 60 only moves the hour or
    // the minute, so those two are limited by hand.
    const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
    const exists =
        utc.getUTCFullYear() === year && utc.getUTCDate() === day && minute <= 59 && second <= 59;
    if (!exists) return undefined;

    if (match[8] === undefined) {
        // Date's own constructor reads the fields in the machine's zone, which is what is meant.
        return new Date(year, month - 1, day, hour, minute, second, millisecond);
    }
    const offset = zoneOffset(match[8]);
    return offset === undefined ? undefined : new Date(utc.getTime() - offset * 60_000);
}

/** The instant an option was given, or `USAGE` when it is not a time. */
export function parseTimeOption(flag: string, text: string): Date {
    const time = parseTime(text);
    if (time) return time;
    throw usageError(
        `选项 --${flag} 的值${echo(text)}不是时间；写成 ISO 8601，例如 2026-10-01、2026-10-01T07:00 或 2026-10-01T07:00:00+08:00，没写时区就按本机时区算`
    );
}
