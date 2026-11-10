import { describe, expect, it } from "vitest";
import { CliError, ERROR_CODES, exitCodeOf, usageError } from "../src/errors";

describe("exit codes", () => {
    it("maps every code to the exit code of design 4.6", () => {
        const expected: Record<string, number> = {
            INTERNAL: 1,
            USAGE: 2,
            SQL_ERROR: 2,
            INVALID_BACKUP: 2,
            FILE_EXISTS: 2,
            NOT_FOUND: 3,
            AMBIGUOUS_REF: 3,
            NO_USER: 4,
            NOT_BOUND: 4,
            QR_REQUIRED: 4,
            QR_INVALID: 4,
            LXNS_REAUTH_REQUIRED: 4,
            NETWORK: 5,
            UPSTREAM_ERROR: 5,
            OFFLINE_NO_CACHE: 5,
            CONFIRMATION_REQUIRED: 6,
            SYNC_IN_PROGRESS: 7,
            DB_LOCKED: 7,
        };
        expect(Object.fromEntries(ERROR_CODES.map(code => [code, exitCodeOf(code)]))).toEqual(
            expected
        );
    });

    it("never maps an error to 0", () => {
        for (const code of ERROR_CODES) expect(exitCodeOf(code)).toBeGreaterThan(0);
    });
});

describe("cli errors", () => {
    it("carries its code, message and options", () => {
        const cause = new Error("root");
        const error = new CliError("AMBIGUOUS_REF", "有歧义", {
            candidates: [{ ref: "131", title: "Link", type: "SD" }],
            fix: "saltnet song 131",
            extra: { note: 1 },
            cause,
        });
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("CliError");
        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(error.message).toBe("有歧义");
        expect(error.exitCode).toBe(3);
        expect(error.candidates).toEqual([{ ref: "131", title: "Link", type: "SD" }]);
        expect(error.fix).toBe("saltnet song 131");
        expect(error.extra).toEqual({ note: 1 });
        expect(error.cause).toBe(cause);
    });

    it("carries the meta and warnings of a failure that happened after some data was found", () => {
        const error = new CliError("UPSTREAM_ERROR", "上游出错", {
            meta: { dataAsOf: { catalog: "2026-11-10T09:12:03+08:00" } },
            warnings: [{ code: "STALE_METADATA", message: "用的是缓存" }],
        });
        expect(error.meta).toEqual({ dataAsOf: { catalog: "2026-11-10T09:12:03+08:00" } });
        expect(error.warnings).toEqual([{ code: "STALE_METADATA", message: "用的是缓存" }]);

        const plain = new CliError("NOT_FOUND", "没找到");
        expect(plain.meta).toBeUndefined();
        expect(plain.warnings).toBeUndefined();
    });

    it("is retryable only for network errors and busy resources, unless told otherwise", () => {
        for (const code of ERROR_CODES) {
            const expected =
                code === "NETWORK" || code === "SYNC_IN_PROGRESS" || code === "DB_LOCKED";
            expect(new CliError(code, "x").retryable).toBe(expected);
        }
        expect(new CliError("UPSTREAM_ERROR", "x", { retryable: true }).retryable).toBe(true);
        expect(new CliError("NETWORK", "x", { retryable: false }).retryable).toBe(false);
    });

    it("builds a usage error", () => {
        const error = usageError("不对", { fix: "saltnet --help" });
        expect(error.code).toBe("USAGE");
        expect(error.exitCode).toBe(2);
        expect(error.fix).toBe("saltnet --help");
    });
});
