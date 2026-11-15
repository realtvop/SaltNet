import type { Route } from "../mockHttp";
import { describe, expect, it } from "vitest";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, META_URL, NOW, routes } from "../commandRun";
import { delayedRoute } from "../mockHttp";
import { useTempHome } from "../tempHome";

const DELAY_MS = 400;
const EARLIER = new Date(NOW.getTime() - 30 * 60 * 60 * 1000);
const LONG_NETWORK_ENV = {
    SALTNET_METADATA_TIMEOUT_MS: "100",
    SALTNET_NETWORK_TIMEOUT_MS: "3000",
};

const makeHome = useTempHome();

function delayedRoutes(): Record<string, Route> {
    return Object.fromEntries(
        Object.entries(routes()).map(([url, route]) => {
            if (typeof route === "function")
                throw new Error(`fixture route is not a response: ${url}`);
            return [url, delayedRoute(route, DELAY_MS)];
        })
    );
}

describe("metadata download deadlines", () => {
    it("uses network.timeoutMs when the catalog has nothing to fall back on", async () => {
        const result = await commandIn(makeHome(), "search", ["39"], {
            network: delayedRoutes(),
            env: LONG_NETWORK_ENV,
        });

        expect(result.code).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.warnings).toEqual([]);
        expect(result.requests.map(request => request.url)).toEqual([META_URL]);
    });

    it("uses metadata.timeoutMs and stored rows when an expired catalog refresh times out", async () => {
        const paths = makeHome();
        await commandIn(paths, "search", ["39"], { now: EARLIER });

        const result = await commandIn(paths, "search", ["39"], {
            network: delayedRoutes(),
            env: LONG_NETWORK_ENV,
        });

        expect(result.code).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.meta.dataAsOf.catalog).toBe(formatLocalTime(EARLIER));
        expect(result.json.warnings.map(warning => warning.code)).toEqual(["STALE_METADATA"]);
        expect(result.requests.map(request => request.url)).toEqual([META_URL]);
    });

    it("names network.timeoutMs when a first catalog download times out", async () => {
        const result = await commandIn(makeHome(), "search", ["39"], {
            network: delayedRoutes(),
            env: {
                SALTNET_METADATA_TIMEOUT_MS: "3000",
                SALTNET_NETWORK_TIMEOUT_MS: "100",
            },
        });

        expect(result.code).toBe(5);
        expect(result.json.error).toMatchObject({
            code: "NETWORK",
            retryable: true,
            fix: expect.stringContaining("network.timeoutMs"),
        });
    });

    it("chooses the deadline per source when only the expired catalog has a fallback", async () => {
        const paths = makeHome();
        await commandIn(paths, "search", ["39"], { now: EARLIER });

        const result = await commandIn(paths, "charts", ["--plate", "真極", "--diff", "mas"], {
            network: delayedRoutes(),
            env: LONG_NETWORK_ENV,
        });

        expect(result.code).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.meta.dataAsOf.catalog).toBe(formatLocalTime(EARLIER));
        expect(result.json.meta.dataAsOf.collections).toBe(formatLocalTime(NOW));
        expect(result.json.warnings.map(warning => warning.code)).toEqual(["STALE_METADATA"]);
        expect(result.requests).toHaveLength(5);
        expect(result.requests.map(request => request.url)).toContain(META_URL);
    });
});
