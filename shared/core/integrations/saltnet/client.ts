import type { CoreConfig } from "../../config";
import type { FetchLike, FetchResponse } from "../../http";
import { resolveCoreConfig } from "../../config";

export const SALTNET_GAME_API_ERROR_MESSAGE = "请求游戏API失败，请稍候重试";

export enum SaltAPIEndpoints {
    GetQRInfo = "getQRInfo",
    UpdateUser = "updateUser",
    UpdateUserFromDivingFish = "updateUserFromDF",
    CheckLogin = "checkLogin",
    ClearIllegalTickets = "clearIllegalTickets2",
    GetStockedTickets = "getStockedTickets",
}

export type SaltNetErrorKind = "network" | "upstream" | "invalid-response";

export class SaltNetError extends Error {
    readonly kind: SaltNetErrorKind;
    readonly status?: number;

    constructor(message: string, kind: SaltNetErrorKind, status?: number) {
        super(message);
        this.kind = kind;
        this.status = status;
    }
}

export interface SaltNetRequestOptions {
    config?: Pick<Partial<CoreConfig>, "saltnetApiUrl" | "saltnetApiFallbackUrl">;
    fetch?: FetchLike;
    onRequestFailed?: (endpoint: SaltAPIEndpoints | string, error: unknown) => void;
    onInvalidJSON?: (endpoint: SaltAPIEndpoints | string, error: unknown) => void;
}

export async function postSaltNetAPI(
    endpoint: SaltAPIEndpoints | string,
    body: object,
    options: SaltNetRequestOptions = {}
): Promise<FetchResponse> {
    const { saltnetApiUrl, saltnetApiFallbackUrl } = resolveCoreConfig(options.config);
    const doFetch: FetchLike = options.fetch ?? fetch;

    async function request(baseUrl: string): Promise<FetchResponse> {
        const response = await doFetch(`${baseUrl}/${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        }).catch((error: unknown) => {
            options.onRequestFailed?.(endpoint, error);
            throw new SaltNetError(SALTNET_GAME_API_ERROR_MESSAGE, "network");
        });

        if (!response.ok) {
            const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
            const message =
                data !== null && typeof data === "object" && typeof data.error === "string"
                    ? data.error
                    : SALTNET_GAME_API_ERROR_MESSAGE;
            throw new SaltNetError(message, "upstream", response.status);
        }

        return response;
    }

    return request(saltnetApiUrl).catch(() => request(saltnetApiFallbackUrl));
}

export async function postSaltNetAPIJSON<T = unknown>(
    endpoint: SaltAPIEndpoints | string,
    body: object,
    options: SaltNetRequestOptions = {}
): Promise<T> {
    const response = await postSaltNetAPI(endpoint, body, options);
    const data = (await response.json().catch((error: unknown) => {
        options.onInvalidJSON?.(endpoint, error);
        throw new SaltNetError(SALTNET_GAME_API_ERROR_MESSAGE, "invalid-response");
    })) as unknown;

    if (data === null || typeof data !== "object") {
        throw new SaltNetError(SALTNET_GAME_API_ERROR_MESSAGE, "invalid-response");
    }

    if ((data as Record<string, unknown>).error) {
        const errorMember = (data as Record<string, unknown>).error;
        const message =
            typeof errorMember === "string" ? errorMember : SALTNET_GAME_API_ERROR_MESSAGE;
        throw new SaltNetError(message, "upstream");
    }

    return data as T;
}
