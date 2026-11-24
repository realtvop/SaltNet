import type { LXNSTokenData } from "@core/integrations/lxns/token";
import type { LXNSAuth } from "@core/integrations/lxns/type";
import type { User } from "@/components/data/user";
import {
    applyLXNSAuth,
    LXNSTokenError,
    refreshLXNSOAuthToken as refreshLXNSOAuthTokenCore,
    requestLXNSToken as requestLXNSTokenCore,
} from "@core/integrations/lxns/token";

export type { LXNSTokenData };
export { applyLXNSAuth, LXNSTokenError };

export async function requestLXNSToken(body: URLSearchParams): Promise<LXNSTokenData> {
    const params: Record<string, string> = {};
    body.forEach((value, key) => {
        params[key] = value;
    });
    return requestLXNSTokenCore(params);
}

export async function refreshLXNSOAuthToken(user: User): Promise<LXNSAuth> {
    return refreshLXNSOAuthTokenCore(user, {
        config: {
            lxnsClientId: import.meta.env.VITE_LXNS_OAUTH_CLIENT_ID,
        },
    });
}
