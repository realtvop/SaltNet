import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComboStatus, SyncStatus } from "../../maiTypes";
import type { ScoreHistoryBatch } from "./type";

const mocks = vi.hoisted(() => ({
    appendScoreHistoryBatch: vi.fn(),
}));

vi.mock("./repository", () => ({
    appendScoreHistoryBatch: mocks.appendScoreHistoryBatch,
}));

import {
    enqueueScoreHistoryBatch,
    flushScoreHistoryQueue,
    hasPendingScoreHistoryWrites,
} from "./queue";

function createBatch(userUid: string, batchId: string): ScoreHistoryBatch {
    return {
        userUid,
        batchId,
        source: "inGame",
        candidates: [
            {
                chartKey: "10001-3",
                observedAt: 1_000,
                kind: "initial",
                changedMask: 0,
                before: null,
                previousObservedAt: null,
                after: {
                    achievements: 100.5,
                    dxScore: 2_500,
                    fc: ComboStatus.FullCombo,
                    fs: SyncStatus.FullSync,
                    playCount: 10,
                },
            },
        ],
    };
}

beforeEach(() => {
    mocks.appendScoreHistoryBatch.mockReset();
});

describe("score history write queue", () => {
    it("keeps a failed batch and retries it on flush", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        mocks.appendScoreHistoryBatch
            .mockRejectedValueOnce(new Error("temporary failure"))
            .mockResolvedValueOnce(undefined);

        await expect(enqueueScoreHistoryBatch(createBatch("retry-user", "first"))).resolves.toBe(
            false
        );
        expect(hasPendingScoreHistoryWrites()).toBe(true);
        await expect(flushScoreHistoryQueue()).resolves.toBe(true);
        expect(mocks.appendScoreHistoryBatch).toHaveBeenCalledTimes(2);
        expect(hasPendingScoreHistoryWrites()).toBe(false);
        consoleError.mockRestore();
    });

    it("writes batches for one user in FIFO order", async () => {
        let releaseFirst!: () => void;
        mocks.appendScoreHistoryBatch.mockImplementationOnce(
            () => new Promise<void>(resolve => (releaseFirst = resolve))
        );
        mocks.appendScoreHistoryBatch.mockResolvedValueOnce(undefined);

        const first = enqueueScoreHistoryBatch(createBatch("fifo-user", "first"));
        const second = enqueueScoreHistoryBatch(createBatch("fifo-user", "second"));
        await Promise.resolve();
        expect(mocks.appendScoreHistoryBatch.mock.calls[0][0].batchId).toBe("first");
        releaseFirst();
        await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
        expect(mocks.appendScoreHistoryBatch.mock.calls.map(call => call[0].batchId)).toEqual([
            "first",
            "second",
        ]);
    });
});
