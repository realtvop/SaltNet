import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { expect, it, vi } from "vitest";
import { METADATA_LOCK, METADATA_LOCK_TTL_MS } from "../../src/catalog/refresh";
import { readSnapshot } from "../../src/catalog/snapshots";
import { readMetaState } from "../../src/catalog/store";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { commandIn, META_URL, NOW, routes } from "../commandRun";
import { jsonResponse } from "../mockHttp";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

it.each(["renews", "loses"] as const)("handles a long refresh that %s its lease", async outcome => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const paths = makeHome();
    const observer = openStore(paths);
    const now = new Date(NOW);
    let requestStarted!: () => void;
    const started = new Promise<void>(resolve => {
        requestStarted = resolve;
    });
    let sendResponse!: (response: ReturnType<typeof jsonResponse>) => void;
    const response = new Promise<ReturnType<typeof jsonResponse>>(resolve => {
        sendResponse = resolve;
    });
    const upcoming = commandIn(paths, "refresh", [], {
        now,
        env: { SALTNET_NETWORK_TIMEOUT_MS: "300000" },
        network: routes({
            [META_URL]: () => {
                requestStarted();
                return response;
            },
        }),
    });
    try {
        await started;
        if (outcome === "renews") {
            now.setTime(+NOW + METADATA_LOCK_TTL_MS / 2);
            vi.advanceTimersByTime(METADATA_LOCK_TTL_MS / 2);
        }
        now.setTime(+NOW + METADATA_LOCK_TTL_MS + 1);
        const contender = acquireLock(observer, METADATA_LOCK, {
            ttlMs: METADATA_LOCK_TTL_MS,
            now: () => +now,
        });
        try {
            expect(contender.acquired).toBe(outcome === "loses");
            sendResponse(jsonResponse(getFixtureSaltMetaCompacted()));
            const result = await upcoming;
            if (outcome === "loses") {
                expect(result.json.error?.code).toBe("SYNC_IN_PROGRESS");
                for (const source of ["saltmeta", "lxns-collections"] as const) {
                    expect(readSnapshot(paths, source)).toBeUndefined();
                    expect(readMetaState(observer, source)).toBeUndefined();
                }
            } else {
                expect(result.code).toBe(0);
                expect(readMetaState(observer, "saltmeta")?.fetchedAt).toBe(+now);
            }
        } finally {
            if (contender.acquired) contender.lock.release();
        }
    } finally {
        sendResponse(jsonResponse(getFixtureSaltMetaCompacted()));
        await upcoming;
        observer.close();
        vi.useRealTimers();
    }
});
