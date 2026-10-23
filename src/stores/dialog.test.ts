import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDialogStore } from "./dialog";

beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("history", { state: null, back: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("initial dialog history reconciliation", () => {
    it("allows callback dialogs immediately when the initial entry is a page", async () => {
        const store = useDialogStore();
        expect(store.reconcileInitialHistory()).toBe(false);
        await expect(store.waitForInitialHistory()).resolves.toBeUndefined();
        expect(history.back).not.toHaveBeenCalled();
    });

    it("waits until stale dialog entries are skipped before opening a callback dialog", async () => {
        history.replaceState = vi.fn();
        Object.assign(history, { state: { __saltnetDialog: { id: "stale-outer" } } });
        const store = useDialogStore();
        expect(store.reconcileInitialHistory()).toBe(true);
        let ready = false;
        const waiting = store.waitForInitialHistory().then(() => {
            ready = true;
        });
        await Promise.resolve();
        expect(ready).toBe(false);
        Object.assign(history, { state: { __saltnetDialog: { id: "stale-inner" } } });
        store.handlePopstate();
        await Promise.resolve();
        expect(ready).toBe(false);
        expect(history.back).toHaveBeenCalledTimes(2);
        Object.assign(history, { state: null });
        store.handlePopstate();
        await waiting;
        expect(ready).toBe(true);
    });

    it("releases a pending callback when history coordination is reset", async () => {
        Object.assign(history, { state: { __saltnetDialog: { id: "stale" } } });
        const store = useDialogStore();
        store.reconcileInitialHistory();
        const waiting = store.waitForInitialHistory();
        store.reset();
        await expect(waiting).resolves.toBeUndefined();
    });
});
