import { describe, expect, it } from "vitest";
import { CliError } from "../../src/errors";
import {
    ENVELOPE_VERSION,
    failureEnvelope,
    serializeEnvelope,
    successEnvelope,
} from "../../src/output/envelope";

describe("successEnvelope", () => {
    it("has empty meta and warnings unless the command gave some", () => {
        expect(successEnvelope("song", { data: { musicId: 1 } })).toEqual({
            v: 1,
            ok: true,
            command: "song",
            data: { musicId: 1 },
            meta: {},
            warnings: [],
        });
    });

    it("keeps the order of keys, so the first line of output is stable", () => {
        const envelope = successEnvelope("song", {
            data: null,
            meta: { page: { total: 0 } },
            warnings: [{ code: "NO_SCORES", message: "还没有同步过" }],
        });
        expect(Object.keys(envelope)).toEqual(["v", "ok", "command", "data", "meta", "warnings"]);
        expect(envelope.v).toBe(ENVELOPE_VERSION);
    });
});

describe("failureEnvelope", () => {
    it("names the code and message, and whether to retry", () => {
        const envelope = failureEnvelope("song", new CliError("NOT_FOUND", "没找到"));
        expect(envelope).toEqual({
            v: 1,
            ok: false,
            command: "song",
            error: { code: "NOT_FOUND", message: "没找到", retryable: false },
        });
        expect(Object.keys(envelope)).toEqual(["v", "ok", "command", "error"]);
    });

    it("has no command when the command line never named one", () => {
        expect(failureEnvelope(null, new CliError("USAGE", "x")).command).toBeNull();
    });

    it("lists candidates and the fix after the message, and extra fields at the end", () => {
        const error = new CliError("AMBIGUOUS_REF", "有歧义", {
            candidates: [{ ref: "131", title: "Link" }],
            fix: "saltnet song 131",
            extra: { problems: [] },
        });
        expect(Object.keys(failureEnvelope("song", error).error)).toEqual([
            "code",
            "message",
            "candidates",
            "fix",
            "retryable",
            "problems",
        ]);
    });

    it("adds meta and warnings after error when the failure comes with them", () => {
        const error = new CliError("UPSTREAM_ERROR", "上游出错", {
            meta: { dataAsOf: { catalog: "2026-11-10T09:12:03+08:00" } },
            warnings: [{ code: "STALE_METADATA", message: "用的是缓存" }],
        });
        const envelope = failureEnvelope("charts", error);
        expect(Object.keys(envelope)).toEqual(["v", "ok", "command", "error", "meta", "warnings"]);
        expect(envelope.meta).toEqual({ dataAsOf: { catalog: "2026-11-10T09:12:03+08:00" } });
        expect(envelope.warnings).toEqual([{ code: "STALE_METADATA", message: "用的是缓存" }]);
    });

    it("leaves meta and warnings out when there are none", () => {
        const envelope = failureEnvelope("charts", new CliError("NETWORK", "断网了"));
        expect("meta" in envelope).toBe(false);
        expect("warnings" in envelope).toBe(false);
    });

    it("says an error is worth retrying only when it is", () => {
        expect(failureEnvelope("x", new CliError("NETWORK", "x")).error.retryable).toBe(true);
        expect(failureEnvelope("x", new CliError("USAGE", "x")).error.retryable).toBe(false);
    });
});

describe("serializeEnvelope", () => {
    const envelope = successEnvelope("song", { data: { title: "熊華極" } });

    it("is one line that ends with a newline", () => {
        const text = serializeEnvelope(envelope, false);
        expect(text.endsWith("\n")).toBe(true);
        expect(text.slice(0, -1).includes("\n")).toBe(false);
        expect(JSON.parse(text)).toEqual(envelope);
    });

    it("keeps Chinese as it is instead of escaping it", () => {
        expect(serializeEnvelope(envelope, false)).toContain("熊華極");
    });

    it("is indented by four spaces with --pretty", () => {
        const text = serializeEnvelope(envelope, true);
        expect(text).toBe(`${JSON.stringify(envelope, null, 4)}\n`);
        expect(text).toContain('\n    "ok": true');
    });
});
