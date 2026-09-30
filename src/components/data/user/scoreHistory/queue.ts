import { appendScoreHistoryBatch } from "./repository";
import type { ScoreHistoryBatch } from "./type";

interface UserQueue {
    batches: ScoreHistoryBatch[];
    running: Promise<boolean> | null;
}

const queues = new Map<string, UserQueue>();

async function processQueue(queue: UserQueue): Promise<boolean> {
    while (queue.batches.length) {
        try {
            await appendScoreHistoryBatch(queue.batches[0]);
            queue.batches.shift();
        } catch (error) {
            console.error("Failed to save score history:", error);
            return false;
        }
    }
    return true;
}

function startQueue(userUid: string, queue: UserQueue): Promise<boolean> {
    if (queue.running) return queue.running;
    queue.running = processQueue(queue).finally(() => {
        queue.running = null;
        if (!queue.batches.length) queues.delete(userUid);
    });
    return queue.running;
}

export function enqueueScoreHistoryBatch(batch: ScoreHistoryBatch): Promise<boolean> {
    if (!batch.candidates.length) return Promise.resolve(true);
    const queue = queues.get(batch.userUid) ?? { batches: [], running: null };
    queue.batches.push(batch);
    queues.set(batch.userUid, queue);
    return startQueue(batch.userUid, queue);
}

export async function flushScoreHistoryQueue(): Promise<boolean> {
    let success = true;
    for (const [userUid, queue] of [...queues]) {
        if (!(await startQueue(userUid, queue))) success = false;
    }
    return success;
}

export function hasPendingScoreHistoryWrites(): boolean {
    return [...queues.values()].some(queue => queue.batches.length > 0 || queue.running);
}

export function discardPendingScoreHistoryForUser(userUid: string): void {
    const queue = queues.get(userUid);
    if (queue) queue.batches.length = 0;
}

export async function drainAndDiscardScoreHistoryForUser(userUid: string): Promise<void> {
    const queue = queues.get(userUid);
    if (!queue) return;
    queue.batches.length = 0;
    if (queue.running) await queue.running;
    queue.batches.length = 0;
    queues.delete(userUid);
}
