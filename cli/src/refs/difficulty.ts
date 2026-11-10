/**
 * The ways a difficulty can be written (design 3.1): `bas/adv/exp/mas/rem/utage`, the English
 * names, the grade numbers `0`–`4` and `10`, or the colors `绿黄红紫白宴`.
 */
import { getChartDifficultySearchLabel } from "@core/chart/difficulty";
import { closestMatches } from "../util/closest";
import { foldName } from "../util/fold";

export interface Difficulty {
    /** The grade as the data keeps it: 0–4 from BASIC to Re:MASTER, 10 for a banquet chart. */
    readonly grade: number;
    /** The short name that commands print and accept first. */
    readonly value: string;
    /** Other spellings of the same difficulty. Case and width do not matter. */
    readonly aliases: readonly string[];
}

export const DIFFICULTIES: readonly Difficulty[] = [
    { grade: 0, value: "bas", aliases: ["basic", "0", "绿", "綠"] },
    { grade: 1, value: "adv", aliases: ["advanced", "1", "黄", "黃"] },
    { grade: 2, value: "exp", aliases: ["expert", "2", "红", "紅"] },
    { grade: 3, value: "mas", aliases: ["master", "3", "紫"] },
    { grade: 4, value: "rem", aliases: ["re:master", "remaster", "4", "白"] },
    { grade: 10, value: "utage", aliases: ["10", "宴"] },
];

interface Spelling {
    readonly text: string;
    readonly difficulty: Difficulty;
}

const SPELLINGS: readonly Spelling[] = DIFFICULTIES.flatMap(difficulty =>
    [difficulty.value, ...difficulty.aliases].map(text => ({ text: foldName(text), difficulty }))
);

/** The difficulty a text names, or undefined when it names none. */
export function parseDifficulty(text: string): Difficulty | undefined {
    const wanted = foldName(text.trim());
    return SPELLINGS.find(spelling => spelling.text === wanted)?.difficulty;
}

/** The short names of the spellings nearest to a mistyped difficulty. */
export function closestDifficulties(text: string): string[] {
    const wanted = foldName(text.trim());
    const spellings = SPELLINGS.map(spelling => spelling.text);
    const values = closestMatches(wanted, spellings, 6).map(
        near => SPELLINGS.find(spelling => spelling.text === near)!.difficulty.value
    );
    return [...new Set(values)];
}

/** The name the game shows for a grade: `BASIC` to `Re:MASTER`, and `UTAGE` for a banquet chart. */
export function difficultyLabel(grade: number): string {
    return DIFFICULTIES.some(difficulty => difficulty.grade === grade)
        ? getChartDifficultySearchLabel(grade)
        : String(grade);
}
