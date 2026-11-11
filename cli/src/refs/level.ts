/**
 * Levels as the commands read them (design 3.3). A level sits on one scale where `13` is 13 and
 * `13+` is 13.5, so the range `13..14` takes `13`, `13+` and `14` but not `14+` (write `13..14+`
 * for that). A banquet chart's level ends in `?` (`13?`); the `?` may be left out of what is
 * typed and does not matter when levels are compared.
 */
import type { RangeValue } from "../commands/registry";
import { usageError } from "../errors";
import { echo } from "../util/echo";

const LEVEL = /^(\d{1,2})(\+?)\??$/;

/** A level's place on the scale, or undefined for text that is not a level. */
export function levelValue(level: string): number | undefined {
    const match = LEVEL.exec(level.trim());
    return match ? Number(match[1]) + (match[2] ? 0.5 : 0) : undefined;
}

/** Both ends included; a missing end is open. */
export interface LevelRange {
    readonly from: number | null;
    readonly to: number | null;
}

function levelEnd(text: string | null): number | null {
    if (text === null) return null;
    const value = levelValue(text);
    if (value === undefined) {
        throw usageError(
            `选项 --level 里${echo(text) || "有一端"}不是等级；等级写成 13 或 13+，区间写成 13..14、13+.. 或 ..12+`
        );
    }
    return value;
}

/** The range `--level` was given as, or `USAGE` when an end is not a level or they are reversed. */
export function parseLevelRange(range: RangeValue<string>): LevelRange {
    const from = levelEnd(range.from);
    const to = levelEnd(range.to);
    if (from !== null && to !== null && from > to) {
        throw usageError("选项 --level 的区间下限大于上限");
    }
    return { from, to };
}

export function levelInRange(level: string, range: LevelRange): boolean {
    const value = levelValue(level);
    if (value === undefined) return false;
    return (range.from === null || value >= range.from) && (range.to === null || value <= range.to);
}
