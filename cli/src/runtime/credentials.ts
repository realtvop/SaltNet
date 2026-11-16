/** Private credentials kept outside SQLite so the public SQL surface can never reach them. */
import type { StagedFile } from "./files";
import type { RuntimePaths } from "./paths";
import { readFileSync } from "node:fs";
import { stageFileAtomic } from "./files";
import { ensureRuntimeDirs } from "./paths";

export interface UserCredentials {
    divingFishImportToken?: unknown;
    lxnsAuthorization?: unknown;
}

export interface CredentialsFile {
    version: 1;
    users: Record<string, UserCredentials>;
}

function object(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function failure(action: string, file: string, error: unknown): Error {
    const code = (error as NodeJS.ErrnoException).code;
    const reason = typeof code === "string" ? `（${code}）` : "";
    return new Error(`${action}凭据文件 ${file}${reason}；文件没有改动`, { cause: error });
}

/** A missing file is empty; every other read or shape failure is explicit and non-destructive. */
export function readCredentials(paths: Pick<RuntimePaths, "credentials">): CredentialsFile {
    let text: string;
    try {
        text = readFileSync(paths.credentials, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, users: {} };
        throw failure("无法读取", paths.credentials, error);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw failure("无法解析", paths.credentials, error);
    }
    const root = object(parsed);
    const users = object(root?.users);
    if (root?.version !== 1 || !users) {
        throw failure("无法解析", paths.credentials, new Error("invalid credentials shape"));
    }
    for (const value of Object.values(users)) {
        if (!object(value)) {
            throw failure("无法解析", paths.credentials, new Error("invalid user credentials"));
        }
    }
    return parsed as CredentialsFile;
}

/** Writes the private file now and returns the final rename for a caller-controlled commit point. */
export function stageCredentials(paths: RuntimePaths, content: CredentialsFile): StagedFile {
    ensureRuntimeDirs(paths);
    return stageFileAtomic(paths.credentials, `${JSON.stringify(content, null, 2)}\n`, 0o600);
}
