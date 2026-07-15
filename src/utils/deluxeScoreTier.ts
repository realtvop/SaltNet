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

export function getDeluxeScoreStarsImg(tier: number): string {
    if (tier < 3) return "/icons/star1.png";
    if (tier < 5) return "/icons/star2.png";
    return "/icons/star3.png";
}
