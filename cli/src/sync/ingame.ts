import type { FetchResponse } from "@core/http";
import type { CommandContext } from "../commands/registry";
import { SaltAPIEndpoints } from "@core/integrations/saltnet/client";
import { normalizeQrCodeFromInput } from "@core/sync/qrCode";
import { CliError, usageError } from "../errors";

type QrEndpoint =
    | SaltAPIEndpoints.GetQRInfo
    | SaltAPIEndpoints.UpdateUser
    | SaltAPIEndpoints.CheckLogin;

export interface VerifiedQr {
    readonly input: string;
    readonly code: string;
    readonly userId: number;
}

function invalidQr(): CliError {
    return new CliError("QR_INVALID", "二维码无效或已过期");
}

/**
 * Core's SaltNet client tries the fallback after a primary failure. A QR request must only
 * be sent once, and neither a server error nor a transport error may echo the request body.
 */
export async function postQrGameApi(
    ctx: Pick<CommandContext, "config" | "http">,
    endpoint: QrEndpoint,
    body: object
): Promise<Record<string, unknown>> {
    const { api, network } = ctx.config.values;
    const base = api.url || api.fallbackUrl;
    const update = endpoint === SaltAPIEndpoints.UpdateUser;
    const fetch = ctx.http({
        retry: false,
        timeoutMs: update ? network.updateTimeoutMs : network.timeoutMs,
        timeoutKey: update ? "network.updateTimeoutMs" : "network.timeoutMs",
    });
    let response: FetchResponse;
    let data: unknown;
    try {
        // Following a 307 or 308 would send the QR in a second POST.
        const request = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            redirect: "manual" as const,
        };
        response = await fetch(`${base}/${endpoint}`, request);
        if (
            response.ok ||
            (response.status >= 400 && response.status < 500 && response.status !== 429)
        ) {
            data = await response.json();
        }
    } catch (error) {
        if (error instanceof CliError && error.code === "NETWORK") {
            throw new CliError("NETWORK", "连接舞萌服务失败或读取响应超时", {
                fix: error.fix,
                retryable: false,
            });
        }
        throw new CliError("UPSTREAM_ERROR", "舞萌服务返回了无法识别的数据");
    }

    const payload =
        data && typeof data === "object" && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : undefined;
    const error = payload?.error;
    if (
        (typeof payload?.errorID === "number" && payload.errorID !== 0) ||
        error === "QR_INVALID" ||
        (typeof error === "string" &&
            /二维码.{0,12}(?:无效|失效|过期)|(?:invalid|expired) qr|qr(?: code)? (?:is )?(?:invalid|expired)/i.test(
                error
            ))
    ) {
        throw invalidQr();
    }
    if (!response.ok) {
        throw new CliError("UPSTREAM_ERROR", `舞萌服务返回了 HTTP ${response.status}`);
    }
    if (!payload || error) {
        throw new CliError("UPSTREAM_ERROR", "舞萌服务返回了无法识别的数据");
    }
    return payload;
}

export async function readVerifiedQr(ctx: CommandContext): Promise<VerifiedQr> {
    const input = await ctx.io.readStdin();
    const code = normalizeQrCodeFromInput(input);
    if (code?.length !== 64) throw invalidQr();

    const data = await postQrGameApi(ctx, SaltAPIEndpoints.GetQRInfo, { qrCode: code });
    const id = data.userID;
    if (data.errorID !== 0 || typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
        throw new CliError("UPSTREAM_ERROR", "舞萌服务返回的用户 ID 无效");
    }
    return { input, code, userId: id };
}

export function assertQrAccount(storedId: number | null, qr: VerifiedQr): void {
    if (storedId && storedId !== qr.userId) {
        throw usageError("二维码属于另一个舞萌账号");
    }
}
