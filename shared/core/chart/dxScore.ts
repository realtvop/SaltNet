/** The number of DX stars shown for a score, using the game's five percentage thresholds. */
export function getDeluxeScoreTier(deluxeScore: number, deluxeScoreMax: number): number {
    const deluxeScorePercent = deluxeScore / deluxeScoreMax;
    if (deluxeScorePercent >= 0.97) {
        return 5;
    }
    if (deluxeScorePercent >= 0.95) {
        return 4;
    }
    if (deluxeScorePercent >= 0.93) {
        return 3;
    }
    if (deluxeScorePercent >= 0.9) {
        return 2;
    }
    if (deluxeScorePercent >= 0.85) {
        return 1;
    }
    return 0;
}
