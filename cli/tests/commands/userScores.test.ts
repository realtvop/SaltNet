import type { Warning } from "../../src/output/warning";
import { describe, expect, it } from "vitest";
import { carryScoreContext } from "../../src/commands/userScores";
import { CliError } from "../../src/errors";

describe("carryScoreContext", () => {
    it("merges error, scores and base metadata and warnings preserving priority and order", () => {
        const W1: Warning = { code: "STALE_METADATA", message: "made-warning-1" };
        const W2: Warning = { code: "STALE_SCORES", message: "made-warning-2" };
        const W3: Warning = { code: "NO_SCORES", message: "made-warning-3" };

        const candidates = [{ ref: "made-candidate" }];
        const extra = { madeKey: "madeValue" };

        const error = new CliError("NOT_FOUND", "made-up message", {
            candidates,
            fix: "saltnet made-up-fix",
            retryable: true,
            extra,
            meta: {
                user: { index: 9, uid: "made-error-user", name: "Made Error" },
                dataAsOf: { collections: "made-collections-time" },
            },
            warnings: [W3],
        });

        const scores = {
            meta: { user: { index: 1, uid: "made-user", name: "Made User" } },
            dataAsOf: { scores: "made-scores-time" },
            warnings: [W2],
        };

        const baseMeta = {
            dataAsOf: { catalog: "made-catalog-time" },
            other: 1,
        };
        const baseWarnings = [W1];

        let thrown: unknown;
        try {
            carryScoreContext(error, scores, baseMeta, baseWarnings);
        } catch (e) {
            thrown = e;
        }

        expect(thrown).toBeInstanceOf(CliError);
        const carried = thrown as CliError;
        expect(carried.code).toBe("NOT_FOUND");
        expect(carried.message).toBe("made-up message");
        expect(carried.candidates).toEqual(candidates);
        expect(carried.fix).toBe("saltnet made-up-fix");
        expect(carried.retryable).toBe(true);
        expect(carried.extra).toEqual(extra);
        expect(carried.meta).toEqual({
            other: 1,
            user: { index: 9, uid: "made-error-user", name: "Made Error" },
            dataAsOf: {
                catalog: "made-catalog-time",
                scores: "made-scores-time",
                collections: "made-collections-time",
            },
        });
        expect(carried.warnings).toEqual([W1, W2, W3]);
    });

    it("rethrows non-CliError as the very same object", () => {
        const nonCliError = new TypeError("not a cli error");
        const scores = { meta: {}, dataAsOf: {}, warnings: [] };
        let thrown: unknown;
        try {
            carryScoreContext(nonCliError, scores);
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBe(nonCliError);
    });

    it("produces undefined meta and warnings when given empty scores and no base", () => {
        const error = new CliError("NOT_FOUND", "bare error");
        const scores = { meta: {}, dataAsOf: {}, warnings: [] };
        let thrown: unknown;
        try {
            carryScoreContext(error, scores);
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBeInstanceOf(CliError);
        const carried = thrown as CliError;
        expect(carried.meta).toBeUndefined();
        expect(carried.warnings).toBeUndefined();
    });
});
