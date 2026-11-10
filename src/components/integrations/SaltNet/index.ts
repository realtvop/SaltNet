const GAME_API_ERROR_MESSAGE = "请求游戏API失败，请稍候重试";

export function postAPI(endpoint: SaltAPIEndpoints, body: object): Promise<Response> {
    async function request(baseUrl: string): Promise<Response> {
        const response = await fetch(`${baseUrl}/${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        }).catch((error: unknown) => {
            console.error("SaltNet request failed:", endpoint, error);
            throw new Error(GAME_API_ERROR_MESSAGE);
        });
        if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(typeof data?.error === "string" ? data.error : GAME_API_ERROR_MESSAGE);
        }
        return response;
    }

    return request(import.meta.env.VITE_API_URL).catch(() =>
        request(import.meta.env.VITE_API_FALLBACK_URL)
    );
}

export async function postAPIJSON(endpoint: SaltAPIEndpoints, body: object) {
    const response = await postAPI(endpoint, body);
    const data = await response.json().catch((error: unknown) => {
        console.error("Invalid SaltNet JSON response:", endpoint, error);
        throw new Error(GAME_API_ERROR_MESSAGE);
    });
    if (data === null || typeof data !== "object") {
        throw new Error(GAME_API_ERROR_MESSAGE);
    }
    if (data?.error) {
        throw new Error(typeof data.error === "string" ? data.error : GAME_API_ERROR_MESSAGE);
    }
    return data;
}

export enum SaltAPIEndpoints {
    GetQRInfo = "getQRInfo",
    UpdateUser = "updateUser",
    UpdateUserFromDivingFish = "updateUserFromDF",
    CheckLogin = "checkLogin",
    ClearIllegalTickets = "clearIllegalTickets2",
    GetStockedTickets = "getStockedTickets",
}
