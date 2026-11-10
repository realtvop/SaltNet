/**
 * Every error the CLI can report, with the exit code it maps to (design 4.6). The codes are
 * constants that agents match on, so they never change; only their messages are prose.
 */
const EXIT_CODE_OF = {
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
} as const;

export type ErrorCode = keyof typeof EXIT_CODE_OF;

export const ERROR_CODES = Object.keys(EXIT_CODE_OF) as readonly ErrorCode[];

export function exitCodeOf(code: ErrorCode): number {
    return EXIT_CODE_OF[code];
}

/** Errors that may succeed when the same command is run again. */
const RETRYABLE_BY_DEFAULT: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
    "NETWORK",
    "SYNC_IN_PROGRESS",
    "DB_LOCKED",
]);

/** Something the caller can retry with: a song, a chart, an option name. */
export interface ErrorCandidate {
    /** What to pass in place of the rejected input. */
    ref: string;
    title?: string;
    artist?: string;
    type?: string;
}

export interface CliErrorOptions {
    /** Choices to retry with, for an ambiguous or unknown reference. */
    candidates?: readonly ErrorCandidate[];
    /** A command that fixes the problem. */
    fix?: string;
    /** Overrides whether the same command may succeed if run again. */
    retryable?: boolean;
    /** More fields for the error object, such as the preview of a confirmation. */
    extra?: Readonly<Record<string, unknown>>;
    cause?: unknown;
}

/** A failure the CLI reports to the caller, as opposed to a bug. */
export class CliError extends Error {
    readonly code: ErrorCode;
    readonly candidates?: readonly ErrorCandidate[];
    readonly fix?: string;
    readonly retryable: boolean;
    readonly extra?: Readonly<Record<string, unknown>>;

    constructor(code: ErrorCode, message: string, options: CliErrorOptions = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "CliError";
        this.code = code;
        this.candidates = options.candidates;
        this.fix = options.fix;
        this.retryable = options.retryable ?? RETRYABLE_BY_DEFAULT.has(code);
        this.extra = options.extra;
    }

    get exitCode(): number {
        return exitCodeOf(this.code);
    }
}

export function usageError(message: string, options: CliErrorOptions = {}): CliError {
    return new CliError("USAGE", message, options);
}
