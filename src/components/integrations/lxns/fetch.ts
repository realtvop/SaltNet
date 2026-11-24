import type { User } from "@/components/data/user";
import type { LXNSAuth } from "@core/integrations/lxns/type";
import { LXNSPlayerApiError, requestLXNSPlayerApi } from "@core/integrations/lxns/client";
import { refreshLXNSOAuthToken } from "./token";

const EXPIRY_BUFFER_MS = 60_000;
const refreshPromises = new WeakMap<User, Promise<LXNSAuth>>();

async function getValidAuth(user: User): Promise<{ accessToken: string; tokenType: string }> {
    if (!user.lxns?.auth?.accessToken) {
        throw new Error("User is not authenticated with LXNS");
    }

    if (Date.now() >= (user.lxns.auth.expiresAt || 0) - EXPIRY_BUFFER_MS) {
        let refreshPromise = refreshPromises.get(user);
        if (!refreshPromise) {
            refreshPromise = refreshLXNSOAuthToken(user).finally(() => {
                refreshPromises.delete(user);
            });
            refreshPromises.set(user, refreshPromise);
        }
        const auth = await refreshPromise;
        return { accessToken: auth.accessToken!, tokenType: auth.tokenType! };
    }

    return { accessToken: user.lxns.auth.accessToken, tokenType: user.lxns.auth.tokenType! };
}

function extractHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
    if (!headers) {
        return undefined;
    }
    if (headers instanceof Headers) {
        return Object.fromEntries(headers.entries());
    }
    if (Array.isArray(headers)) {
        return Object.fromEntries(headers);
    }
    return headers as Record<string, string>;
}

function toPlayerInit(init: RequestInit | undefined): Parameters<typeof requestLXNSPlayerApi>[2] {
    if (!init) {
        return undefined;
    }
    return {
        method: init.method,
        headers: extractHeaders(init.headers),
        body: typeof init.body === "string" ? init.body : undefined,
    };
}

export async function fetchLXNSApi<APIRespType>(
    user: User,
    endpoint?: string,
    init?: RequestInit
): Promise<APIRespType> {
    const { accessToken, tokenType } = await getValidAuth(user);
    const playerInit = toPlayerInit(init);
    return requestLXNSPlayerApi<APIRespType>(
        { accessToken, tokenType },
        endpoint,
        playerInit
    ).catch((error: unknown) => {
        if (error instanceof LXNSPlayerApiError) {
            throw new Error(error.message);
        }
        throw error;
    });
}
