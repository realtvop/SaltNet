import type { Chart } from "@core/music/type";
import type { User } from "@core/user/type";
import type { B50RenderChart, B50RenderPayload } from "../../../shared/rendering/b50-payload";
import type { CliFetch } from "../runtime/http";
import { Buffer } from "node:buffer";
import { sumChartRatings } from "@core/query/b50";
import { getUserDisplayName } from "@core/user/type";
import { parseB50Payload } from "../../../shared/rendering/b50-payload";
import { CliError } from "../errors";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const IHDR_HEADER = [0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52] as const;
const IEND_CHUNK = [
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
] as const;

export function isPng(bytes: Uint8Array): boolean {
    if (bytes.byteLength < 45) return false;
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (bytes[i] !== PNG_SIGNATURE[i]) return false;
    }
    for (let i = 0; i < IHDR_HEADER.length; i++) {
        if (bytes[8 + i] !== IHDR_HEADER[i]) return false;
    }
    const iendOffset = bytes.byteLength - IEND_CHUNK.length;
    for (let i = 0; i < IEND_CHUNK.length; i++) {
        if (bytes[iendOffset + i] !== IEND_CHUNK[i]) return false;
    }
    return true;
}

export function toRenderChartPayload(chart: Chart): B50RenderChart {
    const fitConstant = (chart.score as Record<string, unknown> | undefined)?.fitConstant;
    const ds =
        typeof fitConstant === "number" && !Number.isNaN(fitConstant)
            ? fitConstant
            : chart.info.constant;

    return {
        songId: chart.music.info.id,
        title: chart.music.info.title,
        type: chart.music.info.type,
        levelIndex: chart.info.grade,
        ds,
        achievements: chart.score?.achievements ?? null,
        fc: chart.score?.comboStatus ?? "",
        fs: chart.score?.syncStatus ?? "",
        rate: chart.score?.rankRate ?? "",
        ra: chart.score?.deluxeRating ?? 0,
        deluxeScore: chart.score?.deluxeScore,
        deluxeScoreMax: chart.info.deluxeScoreMax,
    };
}

export function getPlayerSecondaryName(user: User): string | null {
    if (!user.remark) return null;
    return user.data?.name ?? user.divingFish?.name ?? user.inGame?.name ?? null;
}

export function buildB50RenderPayload({
    user,
    modeLabel,
    showDxScore,
    sd,
    dx,
}: {
    user: User;
    modeLabel: string;
    showDxScore: boolean;
    sd: readonly Chart[];
    dx: readonly Chart[];
}): B50RenderPayload {
    const totalRating = sumChartRatings(sd as Chart[]) + sumChartRatings(dx as Chart[]);
    return {
        playerName: getUserDisplayName(user),
        playerSecondaryName: getPlayerSecondaryName(user),
        playerRating: totalRating || null,
        modeLabel,
        showDxScore,
        sd: sd.map(toRenderChartPayload),
        dx: dx.map(toRenderChartPayload),
    };
}

export async function requestB50Image({
    renderUrl,
    payload,
    http,
}: {
    renderUrl: string;
    payload: B50RenderPayload;
    http: CliFetch;
}): Promise<Buffer> {
    parseB50Payload(payload);

    const baseUrl = renderUrl.replace(/\/+$/, "");
    const targetUrl = `${baseUrl}/render/b50`;

    const response = await http(targetUrl, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        let serviceError: string | undefined;
        try {
            const body = await response.json();
            if (typeof body === "object" && body !== null && "error" in body) {
                const rawError = String((body as { error: unknown }).error).trim();
                if (rawError) {
                    serviceError =
                        rawError.length > 200 ? `${rawError.slice(0, 197)}...` : rawError;
                }
            }
        } catch {
            // Not JSON
        }
        const message = serviceError
            ? `渲染服务返回错误：${serviceError}`
            : `渲染服务返回 HTTP ${response.status}`;
        // As `upstreamStatusError`: a 5xx or 429 may pass by itself, anything else would not.
        throw new CliError("UPSTREAM_ERROR", message, {
            retryable: response.status >= 500 || response.status === 429,
            extra: { status: response.status },
        });
    }

    // The picture's bytes as they came: `text()` would decode them as UTF-8 and destroy them.
    const bytes = Buffer.from(await response.bytes());

    if (!isPng(bytes)) {
        throw new CliError("UPSTREAM_ERROR", "渲染服务返回的不是有效的 PNG 图片", {
            retryable: false,
        });
    }

    return bytes;
}
