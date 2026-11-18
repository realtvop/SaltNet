import {
    postSaltNetAPI,
    postSaltNetAPIJSON,
    SaltAPIEndpoints,
    SaltNetError,
} from "@core/integrations/saltnet/client";

function restoreWebError(error: unknown): never {
    if (error instanceof SaltNetError) {
        throw new Error(error.message);
    }
    throw error;
}

export function postAPI(endpoint: SaltAPIEndpoints, body: object): Promise<Response> {
    return (
        postSaltNetAPI(endpoint, body, {
            config: {
                saltnetApiUrl: import.meta.env.VITE_API_URL,
                saltnetApiFallbackUrl: import.meta.env.VITE_API_FALLBACK_URL,
            },
            onRequestFailed: (ep, err) => {
                console.error("SaltNet request failed:", ep, err);
            },
        }) as unknown as Promise<Response>
    ).catch(restoreWebError);
}

export async function postAPIJSON<T = Awaited<ReturnType<Response["json"]>>>(
    endpoint: SaltAPIEndpoints,
    body: object
): Promise<T> {
    return postSaltNetAPIJSON<T>(endpoint, body, {
        config: {
            saltnetApiUrl: import.meta.env.VITE_API_URL,
            saltnetApiFallbackUrl: import.meta.env.VITE_API_FALLBACK_URL,
        },
        onRequestFailed: (ep, err) => {
            console.error("SaltNet request failed:", ep, err);
        },
        onInvalidJSON: (ep, err) => {
            console.error("Invalid SaltNet JSON response:", ep, err);
        },
    }).catch(restoreWebError);
}

export { SaltAPIEndpoints };
