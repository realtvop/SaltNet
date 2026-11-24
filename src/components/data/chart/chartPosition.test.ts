import type { Chart } from "@core/music/type";
import type { ChartsSortCached } from "@core/user/type";
import { findChartPosition } from "@core/chart/position";
import { createFixtureMusicList } from "@core/fixtures/saltmeta";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";

const { default: localForage } = await import("localforage");
const { getChartPositionFromCache } = await import("./chartPosition");

const CHARTS_SORT_CACHE_KEY = "chartsSortCachedV2";
const charts = Object.values(createFixtureMusicList().chartList).slice(0, 20);

function cachedCharts(value: Chart[]): ChartsSortCached {
    return {
        identifier: { name: "fixture", updateTime: 1, verBuildTime: 1 },
        charts: value,
    };
}

beforeEach(async () => {
    await localForage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("getChartPositionFromCache", () => {
    it("returns a dash when the cache is missing", async () => {
        expect(await getChartPositionFromCache(charts[0], "ALL")).toBe("-");
    });

    it("returns a dash when the cached value has no charts", async () => {
        await localForage.setItem(CHARTS_SORT_CACHE_KEY, {});
        expect(await getChartPositionFromCache(charts[0], "ALL")).toBe("-");
    });

    it("delegates cached charts to the core position lookup", async () => {
        const chart = charts[5];
        await localForage.setItem(CHARTS_SORT_CACHE_KEY, cachedCharts(charts));
        const expected = findChartPosition(charts, chart, chart.info.level);

        expect(await getChartPositionFromCache(chart, chart.info.level)).toBe(expected);
    });

    it("returns a dash and preserves the error log when reading fails", async () => {
        const error = new Error("read failed");
        vi.spyOn(localForage, "getItem").mockRejectedValueOnce(error);
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const message = "Failed to get chart position from cache:";

        expect(await getChartPositionFromCache(charts[0], "ALL")).toBe("-");
        expect(consoleError).toHaveBeenCalledWith(message, error);
    });

    it("returns a dash and logs the error when the cached charts cannot be searched", async () => {
        // A cached value whose charts are not a list makes the lookup itself throw.
        await localForage.setItem(CHARTS_SORT_CACHE_KEY, { charts: {} });
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const message = "Failed to get chart position from cache:";

        expect(await getChartPositionFromCache(charts[0], "ALL")).toBe("-");
        expect(consoleError).toHaveBeenCalledWith(message, expect.any(TypeError));
    });
});
