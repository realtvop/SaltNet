import type { Warning } from "./output/warning";

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

/** Whether an error of this code may succeed when the command is run again, unless it says not. */
export function isRetryableByDefault(code: ErrorCode): boolean {
    return RETRYABLE_BY_DEFAULT.has(code);
}

/** What each exit code means, in the words of design 4.6; 0 is success. */
export const EXIT_CODE_MEANINGS: Readonly<Record<number, string>> = {
    0: "成功，可能带警告",
    1: "内部错误",
    2: "用法错误",
    3: "找不到或有歧义",
    4: "需要人来处理",
    5: "网络或上游出错",
    6: "需要确认",
    7: "资源被占用",
};

/** What each code means and what to do about it; `schema` and `guide` print these. */
export const ERROR_DESCRIPTIONS: Readonly<Record<ErrorCode, string>> = {
    INTERNAL:
        "意外的错误：saltnet 的缺陷，或者数据目录读写失败（没有权限、磁盘满、数据库损坏）；error.message 会说是哪一种",
    USAGE: "命令行写得不对（命令、参数、选项或取值有误，或者这样组合不行），或者设置有错；有最接近的写法时在 error.candidates 里，设置的问题在 error.problems 里",
    SQL_ERROR: "sql 的语句有错，或者用了不被允许的写法",
    INVALID_BACKUP: "备份文件读不了，或者格式不对",
    FILE_EXISTS: "要写的文件已经存在；加 --overwrite 才会覆盖",
    NOT_FOUND: "找不到指定的对象；error.candidates 里是最接近的几个",
    AMBIGUOUS_REF: "写的引用对应不止一个对象；error.candidates 里每个的 ref 都可以直接拿去重试",
    NO_USER: "还没有任何用户，要先添加用户或导入网页端的备份",
    NOT_BOUND: "这个用户还没有绑定要用的账号",
    QR_REQUIRED: "这个操作要二维码，需要用户提供",
    QR_INVALID: "二维码格式不对，或者已经失效",
    LXNS_REAUTH_REQUIRED: "落雪的授权已经失效，需要用户重新授权",
    NETWORK: "连不上网，或者请求超时；可以稍后重试",
    UPSTREAM_ERROR: "对方的服务返回了错误，或者返回的内容读不懂",
    OFFLINE_NO_CACHE: "用了 --offline，可是本地没有需要的数据",
    CONFIRMATION_REQUIRED:
        "这个操作要用户确认；error 里有即将执行的操作的预览和确认码，用户同意后带上 --yes <确认码> 重新运行",
    SYNC_IN_PROGRESS: "同一个用户的同步或者曲库的刷新正在别的进程里进行；稍后再试",
    DB_LOCKED: "本地数据库被别的命令占着；稍后再试",
};

/** Something the caller can retry with: a song, a chart, an option name. */
export interface ErrorCandidate {
    /** What to pass in place of the rejected input. */
    ref: string;
    title?: string;
    artist?: string;
    /** `SD`, `DX`, or `SD+DX` for a song that has both. */
    type?: string;
    /** For a chart: its difficulty (`MASTER`) and level (`13+`). */
    difficulty?: string;
    level?: string;
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
    /** What the envelope's `meta` holds when the failure happens after some data was found. */
    meta?: Readonly<Record<string, unknown>>;
    warnings?: readonly Warning[];
    cause?: unknown;
}

/** A failure the CLI reports to the caller, as opposed to a bug. */
export class CliError extends Error {
    readonly code: ErrorCode;
    readonly candidates?: readonly ErrorCandidate[];
    readonly fix?: string;
    readonly retryable: boolean;
    readonly extra?: Readonly<Record<string, unknown>>;
    readonly meta?: Readonly<Record<string, unknown>>;
    readonly warnings?: readonly Warning[];

    constructor(code: ErrorCode, message: string, options: CliErrorOptions = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "CliError";
        this.code = code;
        this.candidates = options.candidates;
        this.fix = options.fix;
        this.retryable = options.retryable ?? RETRYABLE_BY_DEFAULT.has(code);
        this.extra = options.extra;
        this.meta = options.meta;
        this.warnings = options.warnings;
    }

    get exitCode(): number {
        return exitCodeOf(this.code);
    }
}

export function usageError(message: string, options: CliErrorOptions = {}): CliError {
    return new CliError("USAGE", message, options);
}
