type RankType =
    | "d"
    | "c"
    | "b"
    | "bb"
    | "bbb"
    | "a"
    | "aa"
    | "aaa"
    | "s"
    | "sp"
    | "ss"
    | "ssp"
    | "sss"
    | "sssp";

type ScoreCoefficientEntry = readonly [achievement4: number, offset: number, rank: RankType];

// Match the game client: achievements use four decimals and coefficients use one decimal.
const SCORE_COEFFICIENT_TABLE: readonly ScoreCoefficientEntry[] = [
    [0, 0, "d"],
    [100_000, 16, "d"],
    [200_000, 32, "d"],
    [300_000, 48, "d"],
    [400_000, 64, "d"],
    [500_000, 80, "c"],
    [600_000, 96, "b"],
    [700_000, 112, "bb"],
    [750_000, 120, "bbb"],
    [799_999, 128, "bbb"],
    [800_000, 136, "a"],
    [900_000, 152, "aa"],
    [940_000, 168, "aaa"],
    [969_999, 176, "aaa"],
    [970_000, 200, "s"],
    [980_000, 203, "sp"],
    [989_999, 206, "sp"],
    [990_000, 208, "ss"],
    [995_000, 211, "ssp"],
    [999_999, 214, "ssp"],
    [1_000_000, 216, "sss"],
    [1_004_999, 222, "sss"],
    [1_005_000, 224, "sssp"],
] as const;

const ACHIEVEMENT_SCALE = 10_000;
const CONSTANT_SCALE = 10;
const MAX_ACHIEVEMENT4 = 1_005_000;
const RATING_DIVISOR = 100_000_000;

function normalizeAchievement4(achievements: number): number {
    return Math.min(MAX_ACHIEVEMENT4, Math.max(0, Math.round(achievements * ACHIEVEMENT_SCALE)));
}

export function isRatingCoefficientBoundary(achievement4: number): boolean {
    return SCORE_COEFFICIENT_TABLE.some(
        ([minimumAchievement4]) => minimumAchievement4 === achievement4
    );
}

export class ScoreCoefficient {
    public readonly r!: RankType;
    public readonly c!: number;
    public readonly min!: number;
    public readonly a!: number;

    private readonly achievement4!: number;
    private readonly offset!: number;

    constructor(achievements: number) {
        this.achievement4 = normalizeAchievement4(achievements);

        let selectedEntry = SCORE_COEFFICIENT_TABLE[0];
        for (const entry of SCORE_COEFFICIENT_TABLE) {
            if (entry[0] > this.achievement4) break;
            selectedEntry = entry;
        }

        this.offset = selectedEntry[1];
        this.r = selectedEntry[2];
        this.c = selectedEntry[1] / CONSTANT_SCALE;
        this.min = selectedEntry[0] / ACHIEVEMENT_SCALE;
        this.a = this.achievement4 / ACHIEVEMENT_SCALE;
    }

    ra(ds: number): number {
        const constant10 = Math.round(ds * CONSTANT_SCALE);
        return Math.floor((constant10 * this.achievement4 * this.offset) / RATING_DIVISOR);
    }
}
