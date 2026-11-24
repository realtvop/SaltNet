/**
 * Times in the output are ISO 8601 with the machine's own offset (design 4.5), for example
 * `2026-11-10T09:12:03+08:00`.
 */

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

/** `date` written with a fixed offset, given in minutes east of UTC. */
export function formatWithOffset(date: Date, offsetMinutes: number): string {
    const local = new Date(date.getTime() + offsetMinutes * 60_000);
    const day = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
    const time = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
    const minutes = Math.abs(offsetMinutes);
    const sign = offsetMinutes < 0 ? "-" : "+";
    return `${day}T${time}${sign}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** `date` written in the machine's time zone. */
export function formatLocalTime(date: Date): string {
    // `getTimezoneOffset` counts minutes west of UTC, the other way round from the written offset.
    return formatWithOffset(date, -date.getTimezoneOffset());
}
