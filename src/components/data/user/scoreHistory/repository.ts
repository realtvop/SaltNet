import {
    SCORE_HISTORY_PAGE_SIZE,
    SCORE_HISTORY_SCHEMA_VERSION,
    ScoreHistoryChange,
    type PendingScoreHistoryImport,
    type ScoreHistoryBatch,
    type ScoreHistoryEventV1,
    type ScoreHistoryPage,
    type ScoreHistoryTimelineEntry,
} from "./type";

const DATABASE_NAME = "saltnet-score-history";
const DATABASE_VERSION = 1;
const EVENTS_STORE = "events";
const META_STORE = "meta";
const ACTIVE_GENERATION_KEY = "activeGeneration";
const PENDING_IMPORT_KEY = "pendingImport";
const DEFAULT_GENERATION = "default";

interface MetaRecord<T = unknown> {
    key: string;
    value: T;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB aborted"));
    });
}

function openDatabase(): Promise<IDBDatabase> {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            const events = database.createObjectStore(EVENTS_STORE, { keyPath: "id" });
            events.createIndex("generationUserChartTime", [
                "generationId",
                "userUid",
                "chartKey",
                "observedAt",
                "sequence",
            ]);
            events.createIndex("generationUserTime", [
                "generationId",
                "userUid",
                "observedAt",
                "sequence",
            ]);
            events.createIndex("generationBatch", ["generationId", "batchId"]);
            database.createObjectStore(META_STORE, { keyPath: "key" });
        };
        request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => database.close();
            resolve(database);
        };
        request.onerror = () => {
            databasePromise = null;
            reject(request.error ?? new Error("Unable to open score history database"));
        };
    });
    return databasePromise;
}

function createId(): string {
    return (
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
}

async function getMeta<T>(key: string): Promise<T | null> {
    const database = await openDatabase();
    const transaction = database.transaction(META_STORE, "readonly");
    const record = await requestToPromise(
        transaction.objectStore(META_STORE).get(key) as IDBRequest<MetaRecord<T> | undefined>
    );
    return record?.value ?? null;
}

export async function getActiveScoreHistoryGeneration(): Promise<string> {
    return (await getMeta<string>(ACTIVE_GENERATION_KEY)) ?? DEFAULT_GENERATION;
}

async function getChartEvents(
    generationId: string,
    userUid: string,
    chartKey: string
): Promise<ScoreHistoryEventV1[]> {
    const database = await openDatabase();
    const transaction = database.transaction(EVENTS_STORE, "readonly");
    const index = transaction.objectStore(EVENTS_STORE).index("generationUserChartTime");
    const range = IDBKeyRange.bound(
        [generationId, userUid, chartKey, Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
        [generationId, userUid, chartKey, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]
    );
    return requestToPromise(index.getAll(range) as IDBRequest<ScoreHistoryEventV1[]>);
}

async function getUserEvents(
    generationId: string,
    userUid: string
): Promise<ScoreHistoryEventV1[]> {
    const database = await openDatabase();
    const transaction = database.transaction(EVENTS_STORE, "readonly");
    const index = transaction.objectStore(EVENTS_STORE).index("generationUserTime");
    const range = IDBKeyRange.bound(
        [generationId, userUid, Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
        [generationId, userUid, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]
    );
    return requestToPromise(index.getAll(range) as IDBRequest<ScoreHistoryEventV1[]>);
}

export async function appendScoreHistoryBatch(batch: ScoreHistoryBatch): Promise<void> {
    if (!batch.candidates.length) return;
    const generationId = await getActiveScoreHistoryGeneration();
    const existingKeys = new Set(
        (await getUserEvents(generationId, batch.userUid)).map(event => event.chartKey)
    );

    const database = await openDatabase();
    const transaction = database.transaction(EVENTS_STORE, "readwrite");
    const store = transaction.objectStore(EVENTS_STORE);

    for (const candidate of batch.candidates) {
        let sequence = 0;
        if (
            candidate.kind === "change" &&
            candidate.before &&
            !existingKeys.has(candidate.chartKey)
        ) {
            const baselineTime = candidate.previousObservedAt ?? candidate.observedAt;
            const baseline: ScoreHistoryEventV1 = {
                id: `${generationId}:${batch.batchId}:${candidate.chartKey}:baseline`,
                schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
                generationId,
                batchId: batch.batchId,
                userUid: batch.userUid,
                chartKey: candidate.chartKey,
                observedAt: baselineTime,
                sequence: 0,
                source: batch.source,
                kind: "initial",
                changedMask: 0,
                state: candidate.before,
            };
            store.put(baseline);
            sequence = baselineTime === candidate.observedAt ? 1 : 0;
        }

        const event: ScoreHistoryEventV1 = {
            id: `${generationId}:${batch.batchId}:${candidate.chartKey}:${candidate.kind}`,
            schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
            generationId,
            batchId: batch.batchId,
            userUid: batch.userUid,
            chartKey: candidate.chartKey,
            observedAt: candidate.observedAt,
            sequence,
            source: batch.source,
            kind: candidate.kind,
            changedMask: candidate.changedMask,
            state: candidate.after,
        };
        store.put(event);
    }
    await transactionDone(transaction);
}

export async function getScoreHistoryPage(
    userUid: string,
    chartKey: string,
    options: { offset?: number; limit?: number; includePlayCountOnly?: boolean } = {}
): Promise<ScoreHistoryPage> {
    const generationId = await getActiveScoreHistoryGeneration();
    const events = await getChartEvents(generationId, userUid, chartKey);
    events.sort((a, b) => a.observedAt - b.observedAt || a.sequence - b.sequence);

    const timeline: ScoreHistoryTimelineEntry[] = events.map((event, index) => ({
        event,
        before: index ? events[index - 1].state : null,
        after: event.state,
    }));
    const filtered = options.includePlayCountOnly
        ? timeline
        : timeline.filter(
              entry =>
                  entry.event.kind === "initial" ||
                  entry.event.changedMask !== ScoreHistoryChange.PlayCount
          );
    filtered.reverse();

    const offset = options.offset ?? 0;
    const limit = options.limit ?? SCORE_HISTORY_PAGE_SIZE;
    const entries = filtered.slice(offset, offset + limit);
    return {
        entries,
        nextOffset: offset + entries.length < filtered.length ? offset + entries.length : null,
    };
}

export async function exportScoreHistoryEvents(): Promise<ScoreHistoryEventV1[]> {
    const generationId = await getActiveScoreHistoryGeneration();
    const database = await openDatabase();
    const transaction = database.transaction(EVENTS_STORE, "readonly");
    const all = await requestToPromise(
        transaction.objectStore(EVENTS_STORE).getAll() as IDBRequest<ScoreHistoryEventV1[]>
    );
    return all.filter(event => event.generationId === generationId);
}

async function deleteGeneration(generationId: string): Promise<void> {
    const database = await openDatabase();
    const readTransaction = database.transaction(EVENTS_STORE, "readonly");
    const all = await requestToPromise(
        readTransaction.objectStore(EVENTS_STORE).getAll() as IDBRequest<ScoreHistoryEventV1[]>
    );
    const transaction = database.transaction(EVENTS_STORE, "readwrite");
    const store = transaction.objectStore(EVENTS_STORE);
    for (const event of all) if (event.generationId === generationId) store.delete(event.id);
    await transactionDone(transaction);
}

export async function stageScoreHistoryImport(
    events: ScoreHistoryEventV1[],
    usersJson: string
): Promise<PendingScoreHistoryImport> {
    const generationId = `import-${createId()}`;
    const database = await openDatabase();
    const transaction = database.transaction([EVENTS_STORE, META_STORE], "readwrite");
    const eventStore = transaction.objectStore(EVENTS_STORE);
    for (const source of events) {
        eventStore.put({
            ...source,
            id: `${generationId}:${source.userUid}:${source.batchId}:${source.chartKey}:${source.sequence}:${source.kind}`,
            generationId,
        } satisfies ScoreHistoryEventV1);
    }
    const pending = { generationId, usersJson } satisfies PendingScoreHistoryImport;
    transaction
        .objectStore(META_STORE)
        .put({ key: PENDING_IMPORT_KEY, value: pending } satisfies MetaRecord);
    await transactionDone(transaction);
    return pending;
}

export async function activateStagedScoreHistoryImport(generationId: string): Promise<void> {
    const previous = await getActiveScoreHistoryGeneration();
    const database = await openDatabase();
    const transaction = database.transaction(META_STORE, "readwrite");
    const store = transaction.objectStore(META_STORE);
    store.put({ key: ACTIVE_GENERATION_KEY, value: generationId } satisfies MetaRecord);
    store.delete(PENDING_IMPORT_KEY);
    await transactionDone(transaction);
    if (previous !== generationId) await deleteGeneration(previous);
}

export async function getPendingScoreHistoryImport(): Promise<PendingScoreHistoryImport | null> {
    return getMeta<PendingScoreHistoryImport>(PENDING_IMPORT_KEY);
}

export async function deleteScoreHistoryForUser(userUid: string): Promise<void> {
    const generationId = await getActiveScoreHistoryGeneration();
    const events = await getUserEvents(generationId, userUid);
    const database = await openDatabase();
    const transaction = database.transaction(EVENTS_STORE, "readwrite");
    const store = transaction.objectStore(EVENTS_STORE);
    for (const event of events) store.delete(event.id);
    await transactionDone(transaction);
}

export async function clearScoreHistory(): Promise<void> {
    const emptyGeneration = `empty-${createId()}`;
    const database = await openDatabase();
    const transaction = database.transaction([EVENTS_STORE, META_STORE], "readwrite");
    transaction
        .objectStore(META_STORE)
        .put({ key: ACTIVE_GENERATION_KEY, value: emptyGeneration } satisfies MetaRecord);
    transaction.objectStore(EVENTS_STORE).clear();
    await transactionDone(transaction);
}

export async function resetScoreHistoryDatabaseForTests(): Promise<void> {
    if (databasePromise) {
        const database = await databasePromise.catch(() => null);
        database?.close();
    }
    databasePromise = null;
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DATABASE_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Score history database deletion blocked"));
    });
}
