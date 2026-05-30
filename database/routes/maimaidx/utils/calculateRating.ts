type RatingTableEntry = readonly [achievement4: number, offset: number];

// Match the game client: achievements use four decimals and coefficients use one decimal.
const RATING_TABLE: readonly RatingTableEntry[] = [
    [0, 0],
    [100_000, 16],
    [200_000, 32],
    [300_000, 48],
    [400_000, 64],
    [500_000, 80],
    [600_000, 96],
    [700_000, 112],
    [750_000, 120],
    [799_999, 128],
    [800_000, 136],
    [900_000, 152],
    [940_000, 168],
    [969_999, 176],
    [970_000, 200],
    [980_000, 203],
    [989_999, 206],
    [990_000, 208],
    [995_000, 211],
    [999_999, 214],
    [1_000_000, 216],
    [1_004_999, 222],
    [1_005_000, 224],
] as const;

const ACHIEVEMENT_SCALE = 10_000;
const CONSTANT_SCALE = 10;
const MAX_ACHIEVEMENT4 = 1_005_000;
const RATING_DIVISOR = 100_000_000;

export function calculateRating(achievements: number, ds: number): number {
    const achievement4 = Math.min(
        MAX_ACHIEVEMENT4,
        Math.max(0, Math.round(achievements * ACHIEVEMENT_SCALE))
    );
    const constant10 = Math.round(ds * CONSTANT_SCALE);
    let offset = 0;

    for (const entry of RATING_TABLE) {
        if (entry[0] > achievement4) break;
        offset = entry[1];
    }

    return Math.floor((constant10 * achievement4 * offset) / RATING_DIVISOR);
}
