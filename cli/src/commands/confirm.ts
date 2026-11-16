/**
 * Shared confirmation for destructive commands. A command must build its preview before changing
 * anything and without reading stdin (except `user bind <user> ingame --qr -`). Its `state` must
 * contain everything the operation changes or depends on, so changed data produces a new code.
 */
import type { OptionSpec } from "./registry";
import { createHash } from "node:crypto";
import { CliError } from "../errors";
import { joinCommandLine } from "../util/shell";

export type JsonValue =
    | null
    | boolean
    | number
    | string
    | readonly JsonValue[]
    | Readonly<{ [key: string]: JsonValue | undefined }>;

export interface ConfirmationSubject {
    readonly operation: string;
    readonly target: string;
    readonly state: JsonValue;
}

export interface Confirmation extends ConfirmationSubject {
    readonly preview: Readonly<Record<string, JsonValue>>;
    readonly summary: string;
    /** Arguments after `saltnet`, without `--yes`; they may differ from the preview command. */
    readonly confirmArgs: readonly string[];
}

export const CONFIRM_OPTIONS = {
    yes: {
        kind: "string",
        valueName: "确认码",
        allowEmpty: true,
        description: "确认码来自不带 --yes 运行时打印的预览；仅在用户看过预览并同意后传入",
    },
} as const satisfies Readonly<Record<string, OptionSpec>>;

function canonicalJson(value: unknown, ancestors: Set<object>): string {
    if (value === null || typeof value === "boolean" || typeof value === "string") {
        return JSON.stringify(value);
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error("confirmation state has a non-finite number");
        return JSON.stringify(value);
    }
    if (typeof value !== "object") {
        throw new TypeError(`confirmation state has a non-JSON ${typeof value}`);
    }
    if (ancestors.has(value)) throw new Error("confirmation state is circular");

    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            const items: string[] = [];
            for (let index = 0; index < value.length; index++) {
                if (!Object.hasOwn(value, index) || value[index] === undefined) {
                    throw new Error("confirmation state has undefined in an array");
                }
                items.push(canonicalJson(value[index], ancestors));
            }
            return `[${items.join(",")}]`;
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new Error("confirmation state has a non-plain object");
        }
        const members: string[] = [];
        for (const key of Object.keys(value).sort()) {
            const member = (value as Record<string, unknown>)[key];
            if (member === undefined) continue;
            members.push(`${JSON.stringify(key)}:${canonicalJson(member, ancestors)}`);
        }
        return `{${members.join(",")}}`;
    } finally {
        ancestors.delete(value);
    }
}

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A stable 40-bit code bound to the operation, target and canonical JSON state. */
export function confirmationCode(subject: ConfirmationSubject): string {
    const canonical = canonicalJson(
        ["saltnet-confirm-v1", subject.operation, subject.target, subject.state],
        new Set()
    );
    const digest = createHash("sha256").update(canonical).digest();
    const value = digest.subarray(0, 5).reduce((bits, byte) => (bits << 8n) | BigInt(byte), 0n);
    return Array.from({ length: 8 }, (_, index) => {
        const shift = BigInt((7 - index) * 5);
        return CROCKFORD_BASE32[Number((value >> shift) & 31n)];
    }).join("");
}

/** `args` with `--yes <code>`, put before a `--` because everything after it is positional. */
function withConfirmationCode(args: readonly string[], code: string): string[] {
    const terminator = args.indexOf("--");
    const at = terminator < 0 ? args.length : terminator;
    return [...args.slice(0, at), "--yes", code, ...args.slice(at)];
}

/** Stops before mutation unless the supplied code matches this exact preview and state. */
export function requireConfirmation(given: string | undefined, confirmation: Confirmation): void {
    const code = confirmationCode(confirmation);
    if (given?.trim().toUpperCase() === code) return;

    // A code that does not match, an empty one included, gets a fresh preview like a missing one.
    const codeRejected = given !== undefined;
    const rejected = codeRejected
        ? "；确认码错误或已经过期，以下是按当前数据生成的新预览"
        : "；请先查看以下预览，用户同意后再运行确认命令";
    throw new CliError("CONFIRMATION_REQUIRED", `${confirmation.summary}${rejected}`, {
        retryable: false,
        fix: joinCommandLine(["saltnet", ...withConfirmationCode(confirmation.confirmArgs, code)]),
        extra: {
            preview: confirmation.preview,
            confirmationCode: code,
            codeRejected,
        },
    });
}
