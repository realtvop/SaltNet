import type { FetchLike } from "@core/http";
import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { LXNSAuth } from "@core/integrations/lxns/type";
import type { CommandContext } from "../commands/registry";
import type { Warning } from "../output/warning";
import type { Store } from "../store/store";
import type { SyncLockHandle } from "./lock";
import type { SyncUploadResult, UploadTarget } from "./types";
import { uploadDivingFishRecords } from "@core/integrations/diving-fish/client";
import { convertToLXNSUploadScore, requestLXNSPlayerApi } from "@core/integrations/lxns/client";
import { CliError } from "../errors";
import { upstreamStatusError } from "../runtime/http";
import { userBindCommand } from "../util/printedCommand";
import { beginRun, finishRun } from "./journal";
import { LxnsRefreshSkippedError } from "./lxnsToken";

export type PendingUpload = { readonly records: DivingFishFullRecord[] } & (
    | { readonly target: "diving-fish"; readonly importToken: string }
    | { readonly target: "lxns" }
);

function uploadError(target: UploadTarget, cause: unknown, userRef: string): CliError {
    const service = target === "diving-fish" ? "水鱼" : "落雪";
    if (cause instanceof LxnsRefreshSkippedError) {
        return new CliError(cause.code, `上传到${service}失败，${cause.message}`, {
            fix: cause.fix,
        });
    }
    const status = cause instanceof CliError ? cause.extra?.status : undefined;
    // Only copy structured codes and HTTP status, never messages, bodies or causes.
    if (
        status === 401 ||
        status === 403 ||
        (cause instanceof CliError && ["NOT_BOUND", "LXNS_REAUTH_REQUIRED"].includes(cause.code))
    ) {
        return new CliError(
            target === "diving-fish" ? "NOT_BOUND" : "LXNS_REAUTH_REQUIRED",
            `上传到${service}失败，需要重新授权`,
            {
                fix:
                    target === "diving-fish"
                        ? userBindCommand(userRef, "df-token", ["-"])
                        : userBindCommand(userRef, "lxns"),
            }
        );
    }
    if (typeof status === "number") {
        return new CliError("UPSTREAM_ERROR", `上传到${service}失败（HTTP ${status}）`);
    }
    if (cause instanceof CliError && cause.code === "NETWORK") {
        return new CliError("NETWORK", `上传到${service}时连接失败或超时`);
    }
    return new CliError(
        cause instanceof CliError ? cause.code : "UPSTREAM_ERROR",
        `上传到${service}失败`
    );
}

/** Send queued game records after the local sync commits, under its existing lock. */
export async function runSyncUploads(
    ctx: CommandContext,
    store: Store,
    handle: SyncLockHandle,
    accessLxns: () => Promise<LXNSAuth>,
    userRef: string,
    pending: readonly PendingUpload[]
): Promise<{ uploads: SyncUploadResult[]; warnings: Warning[] }> {
    const uploads: SyncUploadResult[] = [];
    const warnings: Warning[] = [];
    const http = ctx.http({ retry: false });
    const fetchUpload: FetchLike = async (url, init) => {
        handle.assertHeld();
        const response = await http(url, init);
        if (!response.ok) throw upstreamStatusError(url, response.status);
        return response;
    };

    for (const upload of pending) {
        const { target, records } = upload;
        const run = beginRun(
            store,
            {
                kind: "upload",
                userUid: handle.user.uid,
                userName: handle.user.name,
                source: target,
            },
            handle
        );
        const summary = { records: records.length };
        let error: CliError | null = null;
        try {
            if (target === "diving-fish") {
                await uploadDivingFishRecords(upload.importToken, records, { fetch: fetchUpload });
            } else {
                const auth = await accessLxns();
                if (!auth.accessToken || !auth.tokenType) {
                    throw new CliError("LXNS_REAUTH_REQUIRED", "缺少落雪访问凭据");
                }
                await requestLXNSPlayerApi(
                    { accessToken: auth.accessToken, tokenType: auth.tokenType },
                    "scores",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ scores: records.map(convertToLXNSUploadScore) }),
                    },
                    { config: { lxnsBaseUrl: ctx.config.values.lxns.baseUrl }, fetch: fetchUpload }
                );
            }
        } catch (cause) {
            error = uploadError(target, cause, userRef);
        }

        handle.assertHeld();
        if (error) {
            const { code, message, fix } = error;
            finishRun(store, run, {
                outcome: "failed",
                errorCode: code,
                errorMessage: message,
                summary,
            });
            uploads.push({ target, ok: false, error: { code, message } });
            warnings.push({ code: "UPLOAD_FAILED", message, ...(fix ? { fix } : {}) });
        } else {
            finishRun(store, run, { outcome: "ok", summary });
            uploads.push({ target, ok: true, error: null });
        }
    }
    return { uploads, warnings };
}
