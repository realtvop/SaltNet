import process from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSqlite, withoutSqliteWarning } from "../../src/store/sqlite";

describe("loadSqlite", () => {
    it("gives the node:sqlite module, loaded once", () => {
        const sqlite = loadSqlite();
        expect(typeof sqlite.DatabaseSync).toBe("function");
        expect(loadSqlite()).toBe(sqlite);
        expect(new sqlite.DatabaseSync(":memory:").prepare("SELECT 1 AS one").get()).toEqual({
            one: 1,
        });
    });
});

describe("withoutSqliteWarning", () => {
    const original = process.emitWarning;

    afterEach(() => {
        process.emitWarning = original;
    });

    /** Stands in for the real `process.emitWarning`, which prints to stderr. */
    function spyOnEmitWarning() {
        const spy = vi.fn();
        process.emitWarning = spy as unknown as typeof process.emitWarning;
        return spy;
    }

    it("drops the experimental-feature warning about SQLite, however it is written", () => {
        const spy = spyOnEmitWarning();
        withoutSqliteWarning(() => {
            process.emitWarning(
                "SQLite is an experimental feature and might change at any time",
                "ExperimentalWarning"
            );
            process.emitWarning("SQLite is an experimental feature", {
                type: "ExperimentalWarning",
            });
            const error = new Error("SQLite is an experimental feature");
            error.name = "ExperimentalWarning";
            process.emitWarning(error);
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it("lets every other warning through", () => {
        const spy = spyOnEmitWarning();
        withoutSqliteWarning(() => {
            process.emitWarning("Foo is an experimental feature", "ExperimentalWarning");
            process.emitWarning("SQLite is mentioned here", "DeprecationWarning", "DEP0000");
            process.emitWarning("plain");
        });
        expect(spy.mock.calls).toEqual([
            ["Foo is an experimental feature", "ExperimentalWarning"],
            ["SQLite is mentioned here", "DeprecationWarning", "DEP0000"],
            ["plain"],
        ]);
    });

    it("returns what the loader returns and puts process.emitWarning back", () => {
        const spy = spyOnEmitWarning();
        expect(withoutSqliteWarning(() => 42)).toBe(42);
        expect(process.emitWarning).toBe(spy);
    });

    it("puts process.emitWarning back when the loader throws", () => {
        const spy = spyOnEmitWarning();
        expect(() =>
            withoutSqliteWarning(() => {
                throw new Error("no such module");
            })
        ).toThrow("no such module");
        expect(process.emitWarning).toBe(spy);
    });
});
