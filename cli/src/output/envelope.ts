/**
 * The outer structure every result is wrapped in (design 4.3). Only the pieces that exist so far
 * are here; formats, field selection and paging come with the output module.
 */
import type { CliError } from "../errors";

/** Something to be aware of in a result that is otherwise fine. */
export interface Warning {
    readonly code: string;
    readonly message: string;
    /** A command that would remove the cause. */
    readonly fix?: string;
}

/** Bumped only when a field is renamed, removed or changes meaning. */
export const ENVELOPE_VERSION = 1;

export interface SuccessEnvelope {
    readonly v: typeof ENVELOPE_VERSION;
    readonly ok: true;
    readonly command: string;
    readonly data: unknown;
    readonly meta: Readonly<Record<string, unknown>>;
    readonly warnings: readonly Warning[];
}

export interface FailureEnvelope {
    readonly v: typeof ENVELOPE_VERSION;
    readonly ok: false;
    /** The command, or null when the command line did not get as far as naming one. */
    readonly command: string | null;
    readonly error: Readonly<Record<string, unknown>>;
    readonly meta?: Readonly<Record<string, unknown>>;
    readonly warnings?: readonly Warning[];
}

export type Envelope = SuccessEnvelope | FailureEnvelope;

export interface EnvelopeParts {
    readonly data: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
    readonly warnings?: readonly Warning[];
}

export function successEnvelope(command: string, parts: EnvelopeParts): SuccessEnvelope {
    return {
        v: ENVELOPE_VERSION,
        ok: true,
        command,
        data: parts.data,
        meta: parts.meta ?? {},
        warnings: parts.warnings ?? [],
    };
}

export function failureEnvelope(command: string | null, error: CliError): FailureEnvelope {
    return {
        v: ENVELOPE_VERSION,
        ok: false,
        command,
        error: {
            code: error.code,
            message: error.message,
            ...(error.candidates ? { candidates: error.candidates } : {}),
            ...(error.fix ? { fix: error.fix } : {}),
            retryable: error.retryable,
            ...error.extra,
        },
    };
}

/** One compact line, or indented with `--pretty`; always ends with a newline. */
export function serializeEnvelope(envelope: Envelope, pretty: boolean): string {
    return `${JSON.stringify(envelope, null, pretty ? 4 : undefined)}\n`;
}
