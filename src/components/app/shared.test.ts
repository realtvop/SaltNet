import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { User } from "@/components/data/user/type";

const mocks = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("localforage", () => ({
    default: {
        getItem: mocks.getItem,
        setItem: mocks.setItem,
        removeItem: vi.fn().mockResolvedValue(undefined),
    },
}));
vi.mock("@/components/data/user/scoreHistory", () => ({
    ensureUniqueUserUids: (users: User[]) => users,
    recoverPendingUserDataImport: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
    vi.resetModules();
    mocks.getItem.mockResolvedValue(null);
    mocks.setItem.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("window", {
        matchMedia: () => ({ matches: false, addEventListener: vi.fn() }),
        addEventListener: vi.fn(),
        innerWidth: 1000,
    });
    setActivePinia(createPinia());
});
afterEach(() => vi.unstubAllGlobals());

async function sharedWithUser() {
    const { useShared } = await import("./shared");
    const shared = useShared();
    await shared.usersLoaded;
    shared.users.push({
        uid: "user-a",
        remark: "first",
        divingFish: { name: null },
        inGame: { id: null },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: null },
    });
    await nextTick();
    await shared.persistUsers();
    mocks.setItem.mockClear();
    return shared;
}

describe("durable user writes for OAuth navigation", () => {
    it("waits for earlier writes and saves snapshots in order", async () => {
        const shared = await sharedWithUser();
        let release!: () => void;
        mocks.setItem.mockReturnValueOnce(
            new Promise<void>(resolve => {
                release = resolve;
            })
        );
        const first = shared.persistUsers();
        await vi.waitFor(() => expect(mocks.setItem).toHaveBeenCalledTimes(1));
        shared.users[0].remark = "second";
        let finished = false;
        const second = shared.persistUsers().then(() => {
            finished = true;
        });
        await nextTick();
        expect(finished).toBe(false);
        expect(mocks.setItem).toHaveBeenCalledTimes(1);
        release();
        await Promise.all([first, second]);
        expect(mocks.setItem.mock.calls[0][1][0].remark).toBe("first");
        expect(mocks.setItem.mock.calls[1][1][0].remark).toBe("second");
    });

    it("reports a failed write and permits a subsequent durable retry", async () => {
        const shared = await sharedWithUser();
        mocks.setItem.mockRejectedValueOnce(new Error("temporary failure"));
        await expect(shared.persistUsers()).rejects.toThrow("temporary failure");
        await expect(shared.persistUsers()).resolves.toBeUndefined();
        expect(mocks.setItem).toHaveBeenCalledTimes(2);
    });
});
