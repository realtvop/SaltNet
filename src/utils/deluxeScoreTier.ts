export { getDeluxeScoreTier } from "@core/chart/dxScore";

export function getDeluxeScoreStarsImg(tier: number): string {
    if (tier < 3) return "/icons/star1.png";
    if (tier < 5) return "/icons/star2.png";
    return "/icons/star3.png";
}
