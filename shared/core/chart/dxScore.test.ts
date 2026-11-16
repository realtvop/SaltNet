import { describe, expect, it } from "vitest";
import { getDeluxeScoreTier } from "./dxScore";

describe("getDeluxeScoreTier", () => {
    it.each([
        [0, 0],
        [8499, 0],
        [8500, 1],
        [8999, 1],
        [9000, 2],
        [9299, 2],
        [9300, 3],
        [9499, 3],
        [9500, 4],
        [9699, 4],
        [9700, 5],
        [10000, 5],
    ])("maps %i/10000 to tier %i", (score, tier) => {
        expect(getDeluxeScoreTier(score, 10000)).toBe(tier);
    });
});
