import { useShared } from "@/components/app/shared";
import type { LXNSAuth, LXNSResponse } from "./type";
import { applyLXNSAuth } from "./token";
import { confirm, snackbar } from "mdui";
import { jwtDecode } from "jwt-decode";
import { markDialogClosed, markDialogOpen } from "@/components/app/router";
import {
    deleteScoreHistoryForUser,
    drainAndDiscardScoreHistoryForUser,
    resetUserForNewIdentity,
} from "@/components/data/user/scoreHistory";
import { cancelPendingUserUpdates } from "@/components/data/user/update";

export { refreshLXNSOAuthToken } from "./token";

export async function initLXNSOAuth(userIndex: number): Promise<string> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateCodeVerifier();

    const url = `https://maimai.lxns.net/oauth/authorize?response_type=code&client_id=${
        import.meta.env.VITE_LXNS_OAUTH_CLIENT_ID
    }&redirect_uri=${encodeURIComponent(
        import.meta.env.VITE_LXNS_OAUTH_REDIRECT_URI
    )}&code_challenge=${codeChallenge}&state=${state}&code_challenge_method=S256&scope=read_user_profile+read_player+write_player`;

    window.sessionStorage.setItem("lxns_oauth_user_index", userIndex.toString());
    window.sessionStorage.setItem("lxns_oauth_code_verifier", codeVerifier);
    window.sessionStorage.setItem("lxns_oauth_state", state);

    return url;
}

interface LXNSTokenData {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
}

interface LXNSTokenResult {
    auth: LXNSAuth;
    expiresIn: number;
}

async function getLXNSOAuthToken(code: string): Promise<LXNSTokenResult> {
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

    if (!resp.ok) {
        throw new Error(`LXNS token exchange failed (HTTP ${resp.status})`);
    }

    const data = (await resp.json()) as LXNSResponse<LXNSTokenData>;
    if (!data.success || !data.data?.access_token) {
        throw new Error(`LXNS token exchange failed (code: ${data.code})`);
    }

    return {
        auth: {
            accessToken: data.data.access_token,
            refreshToken: data.data.refresh_token,
            tokenType: data.data.token_type,
        },
        expiresIn: data.data.expires_in,
    };
}

async function saveLXNSAuth(userIndex: number, auth: LXNSAuth, expiresIn?: number): Promise<void> {
    const shared = useShared();
    const user = shared.users[userIndex];

    if (!user) throw new Error("User not found");
    if (!auth.accessToken) throw new Error("No access token available");
    const nextLXNSId = jwtDecode<{ id: number }>(auth.accessToken).id;
    if (user.lxns?.id && user.lxns.id !== nextLXNSId) {
        const confirmed = await confirm({
            headline: "将落雪绑定改为新的用户？",
            description: "确认后会清除当前成绩与历史，并作为新的本地用户开始记录。",
            confirmText: "创建新身份",
            cancelText: "取消",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
        })
            .then(() => true)
            .catch(() => false);
        if (!confirmed) throw new Error("已取消更换落雪帐号");
        const oldUid = user.uid;
        if (oldUid) {
            cancelPendingUserUpdates(oldUid);
            await drainAndDiscardScoreHistoryForUser(oldUid);
            await deleteScoreHistoryForUser(oldUid);
        }
        Object.assign(user, resetUserForNewIdentity(user));
        user.lxns = { auth: null, name: null, id: null };
    }
    applyLXNSAuth(user, auth, expiresIn);
    snackbar({
        message: "落雪绑定成功！",
        autoCloseDelay: 500,
    });
}

export async function handleLXNSOAuthCallback(code: string, state: string): Promise<void> {
    const storedState = window.sessionStorage.getItem("lxns_oauth_state");
    if (!storedState || storedState !== state) {
        clearOAuthSessionStorage();
        throw new Error("OAuth state mismatch — possible CSRF attack");
    }

    const userIndexStr = window.sessionStorage.getItem("lxns_oauth_user_index");
    if (!userIndexStr) throw new Error("User index not found in session storage");
    const userIndex = parseInt(userIndexStr, 10);

    try {
        const { auth, expiresIn } = await getLXNSOAuthToken(code);
        await saveLXNSAuth(userIndex, auth, expiresIn);
    } finally {
        clearOAuthSessionStorage();
    }
}

function clearOAuthSessionStorage(): void {
    window.sessionStorage.removeItem("lxns_oauth_user_index");
    window.sessionStorage.removeItem("lxns_oauth_code_verifier");
    window.sessionStorage.removeItem("lxns_oauth_state");
}

function base64UrlEncode(arrayBuffer: ArrayBuffer): string {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
    const array = new Uint8Array(64);
    window.crypto.getRandomValues(array);
    return base64UrlEncode(array.buffer);
}
export async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await window.crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(hash);
}
