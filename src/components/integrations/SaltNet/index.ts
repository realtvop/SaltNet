export function postAPI(endpoint: SaltAPIEndpoints, body: Object) {
    return fetch(`${import.meta.env.VITE_API_URL}/${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    })
        .then(response => {
            if (!response.ok)
                return fetch(`${import.meta.env.VITE_API_FALLBACK_URL}/${endpoint}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                });
            return response;
        })
        .catch(() =>
            fetch(`${import.meta.env.VITE_API_FALLBACK_URL}/${endpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            })
        );
}

export enum SaltAPIEndpoints {
    GetQRInfo = "getQRInfo",
    UpdateUser = "updateUser",
    UpdateUserFromDivingFish = "updateUserFromDF",
    CheckLogin = "checkLogin",
    PreviewRivals = "previewRivals",
    ClearIllegalTickets = "clearIllegalTickets",
}
