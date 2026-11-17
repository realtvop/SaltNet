import { describe, expect, it } from "vitest";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { beginRun, finishRun, recordRun } from "../../src/sync/journal";
import { commandIn } from "../commandRun";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

describe("v_sync_runs view through sql command", () => {
    it("reads journal rows newest first with exact columns and UTC times", async () => {
        const paths = makeHome();
        const store = openStore(paths);

        // Insert two runs using journal API
        recordRun(
            store,
            {
                kind: "import",
                userUid: null,
                userName: null,
                source: null,
                mode: null,
            },
            {
                outcome: "ok",
                summary: { users: 2, scoreEvents: 10 },
            },
            { now: () => 1700000000000, version: "0.1.0" }
        );

        const at = () => 1700000050000;
        const acquisition = acquireLock(store, "sync:u_test", { ttlMs: 60_000, now: at });
        if (!acquisition.acquired) throw new Error("the sync lock should be free");
        const runId = beginRun(
            store,
            { kind: "sync", userUid: "u_test", userName: "Tester", source: "ingame", mode: "fast" },
            acquisition.lock,
            { now: at, version: "0.1.0" }
        );
        finishRun(
            store,
            runId,
            {
                outcome: "failed",
                errorCode: "NETWORK",
                errorMessage: "请求超时",
                summary: { retry: 0 },
            },
            { now: at }
        );
        acquisition.lock.release();

        store.close();

        const res = await commandIn(paths, "sql", ["SELECT * FROM v_sync_runs"]);
        expect(res.code).toBe(0);
        expect(res.json.meta.viewsVersion).toBe(4);
        expect(res.json.meta.columns).toEqual([
            "id",
            "kind",
            "user_uid",
            "user_name",
            "source",
            "mode",
            "outcome",
            "error_code",
            "error_message",
            "summary",
            "started_at",
            "finished_at",
            "cli_version",
        ]);

        const items = res.json.data.items as Record<string, unknown>[];
        expect(items).toHaveLength(2);

        // Newest first
        expect(items[0]).toEqual({
            id: 2,
            kind: "sync",
            user_uid: "u_test",
            user_name: "Tester",
            source: "ingame",
            mode: "fast",
            outcome: "failed",
            error_code: "NETWORK",
            error_message: "请求超时",
            summary: JSON.stringify({ retry: 0 }),
            started_at: "2023-11-14T22:14:10.000Z",
            finished_at: "2023-11-14T22:14:10.000Z",
            cli_version: "0.1.0",
        });

        expect(items[1]).toEqual({
            id: 1,
            kind: "import",
            user_uid: null,
            user_name: null,
            source: null,
            mode: null,
            outcome: "ok",
            error_code: null,
            error_message: null,
            summary: JSON.stringify({ users: 2, scoreEvents: 10 }),
            started_at: "2023-11-14T22:13:20.000Z",
            finished_at: "2023-11-14T22:13:20.000Z",
            cli_version: "0.1.0",
        });
    });
});
