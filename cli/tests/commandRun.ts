import type { RuntimePaths } from "../src/runtime/paths";
import type { Route } from "./mockHttp";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { createRegistry } from "../src/commands";
import { createHarness, run } from "./harness";
import { jsonResponse, mockFetch } from "./mockHttp";

export const META_URL = "https://meta.test/saltmeta.json";
export const LXNS_URL = "https://lxns.test";
export const NOW = new Date("2026-11-11T01:00:00Z");

export function routes(overrides: Record<string, Route> = {}): Record<string, Route> {
    const lists = getFixtureLXNSCollections();
    const list = (kind: string) => `${LXNS_URL}/api/v0/maimai/${kind}/list?required=true`;
    return {
        [META_URL]: jsonResponse(getFixtureSaltMetaCompacted()),
        [list("trophy")]: jsonResponse({ trophies: lists.trophies }),
        [list("icon")]: jsonResponse({ icons: lists.icons }),
        [list("plate")]: jsonResponse({ plates: lists.plates }),
        [list("frame")]: jsonResponse({ frames: lists.frames }),
        ...overrides,
    };
}

export interface PrintedOutput {
    v: number;
    ok: boolean;
    command: string;
    // eslint-disable-next-line ts/no-explicit-any
    data: any;
    // eslint-disable-next-line ts/no-explicit-any
    meta: any;
    warnings: { code: string; message: string; fix?: string }[];
    error: {
        code: string;
        message: string;
        fix?: string;
        retryable: boolean;
        candidates?: { ref: string; [key: string]: unknown }[];
    };
}

export async function commandIn(
    paths: RuntimePaths,
    command: string,
    args: string[],
    options: { now?: Date; network?: Record<string, Route> } = {}
): Promise<{ code: number; json: PrintedOutput; stdout: string; requests: { url: string }[] }> {
    const fetch = mockFetch(options.network ?? routes());
    const harness = createHarness({
        env: {
            SALTNET_HOME: paths.home,
            SALTNET_SALTMETA_URL: META_URL,
            SALTNET_LXNS_BASE_URL: LXNS_URL,
        },
        fetch,
        now: options.now ?? NOW,
    });
    const code = await run(createRegistry(), harness, command, ...args);
    const stdout = harness.stdout();
    let json: PrintedOutput | undefined;
    try {
        json = JSON.parse(stdout) as PrintedOutput;
    } catch {
        // Non-JSON output like --format tsv
    }
    return { code, json: json!, stdout, requests: fetch.requests };
}
