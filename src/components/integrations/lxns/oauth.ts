export async function initLXNSOAuth(userIndex: number): Promise<string> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const url = `https://maimai.lxns.net/oauth/authorize?response_type=code&client_id=${import.meta.env.VITE_LXNS_OAUTH_CLIENT_ID
        }&redirect_uri=${encodeURIComponent(import.meta.env.VITE_LXNS_OAUTH_REDIRECT_URI)
        }&code_challenge=${codeChallenge
        }&state=${codeVerifier
        }&code_challenge_method=S256&response_type=code&scope=read_user_profile+read_player+write_player`;

    window.sessionStorage.setItem("lxns_oauth_user_index", userIndex.toString());
    window.sessionStorage.setItem("lxns_oauth_code_verifier", codeVerifier);

    return url;
}

interface LXNSTokenResponse {
    code: number,
    data: {
        access_token: string,
        token_type: string,
        expires_in: number,
        refresh_token: string,
        scope: string,
    },
    success: boolean,
};
export async function getLXNSOAuthToken(code: string): Promise<LXNSAuth> {
    const codeVerifier = window.sessionStorage.getItem("lxns_oauth_code_verifier");
    if (!codeVerifier) throw new Error("Code verifier not found in session storage");

    const resp = await fetch("https://maimai.lxns.net/api/v0/oauth/token", {
        method: "POST",
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: import.meta.env.VITE_LXNS_OAUTH_CLIENT_ID,
            redirect_uri: import.meta.env.VITE_LXNS_OAUTH_REDIRECT_URI,
            code_verifier: codeVerifier,
        }),
    });
    const data = await resp.json() as LXNSTokenResponse;

    return {
        accessToken: data.data.access_token,
        refreshToken: data.data.refresh_token,
        tokenType: data.data.token_type,
    };
}

export interface LXNSAuth {
    accessToken: string | null;
    refreshToken: string | null;
    tokenType: string | null;
};

function base64UrlEncode(arrayBuffer: ArrayBuffer): string {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function generateCodeVerifier(): string {
    const array = new Uint8Array(64);
    window.crypto.getRandomValues(array);
    return base64UrlEncode(array.buffer);
}
export async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(hash);
}