import { createFixtureMusicList } from "@core/fixtures/saltmeta";
import { getSaltNetMusicIdForChartType } from "@core/music/saltmeta";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version";

describe("cli scaffold", () => {
    it("falls back to a development version when it is not bundled", () => {
        expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("reaches shared/core through the @core alias", () => {
        expect(getSaltNetMusicIdForChartType(1451, "DX")).toBe(11451);
        expect(getSaltNetMusicIdForChartType(1451, "SD")).toBe(1451);

        const fixture = createFixtureMusicList();
        expect(Object.keys(fixture.musicList).length).toBeGreaterThan(0);
        expect(Object.keys(fixture.chartList).length).toBeGreaterThan(0);
    });
});
