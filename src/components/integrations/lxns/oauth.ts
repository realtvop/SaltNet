import { useShared } from "@/components/app/shared";
import type { LXNSAuth } from "@core/integrations/lxns/type";
import {
    assertLXNSOAuthCallbackAddress,
    assertLXNSOAuthCallbackParameters,
    assertLXNSOAuthCallbackSucceeded,
    assertLXNSOAuthTokenUsable,
    createLXNSOAuthAuthorizeUrl,
    exchangeLXNSOAuthCode,
    generateCodeChallenge,
    generateCodeVerifier,
} from "@core/integrations/lxns/oauth";
import { applyLXNSAuth, LXNSTokenError } from "./token";
import { confirm, snackbar } from "mdui";
import { jwtDecode } from "jwt-decode";
import { markDialogClosed, markDialogOpen } from "@/components/app/router";
import {
    deleteScoreHistoryForUser,
    drainAndDiscardScoreHistoryForUser,
    resetUserForNewIdentity,
    createUserUid,
} from "@/components/data/user/scoreHistory";
import { cancelPendingUserUpdates } from "@/components/data/user/update/updateUser";
import {
    getLXNSOAuthTransaction,
    clearCapturedLXNSOAuthCallback,
    LXNS_OAUTH_LIFETIME,
    removeLXNSOAuthTransaction,
    storeLXNSOAuthTransaction,
    type LXNSOAuthCallback,
    type LXNSOAuthTransaction,
} from "./oauthSession";

export { refreshLXNSOAuthToken } from "./token";

export async function initLXNSOAuth(userIndex: number): Promise<string> {
    const shared = useShared();
    await shared.usersLoaded;
    const user = shared.users[userIndex];
    if (!user) throw new Error("找不到要绑定的用户");
    if (!user.uid) user.uid = createUserUid();
    const clientId = import.meta.env.VITE_LXNS_OAUTH_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_LXNS_OAUTH_REDIRECT_URI;
    if (!clientId || !redirectUri) throw new Error("落雪授权配置缺失");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateCodeVerifier();

    // The new user must survive navigation, including a cold PWA restart.
    await shared.persistUsers();
    storeLXNSOAuthTransaction(state, {
        userUid: user.uid,
        codeVerifier,
        clientId,
        redirectUri,
        expiresAt: Date.now() + LXNS_OAUTH_LIFETIME,
    });
    return createLXNSOAuthAuthorizeUrl(clientId, redirectUri, codeChallenge, state);
}

class LXNSOAuthCancelledError extends Error {}

export class LXNSOAuthRecoveryError extends Error {}

async function saveLXNSAuth(userUid: string, auth: LXNSAuth, expiresIn?: number): Promise<void> {
    const shared = useShared();
    const user = shared.users.find(user => user.uid === userUid);

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
        if (!confirmed) throw new LXNSOAuthCancelledError("已取消更换落雪帐号");
        if (!shared.users.includes(user)) throw new Error("要绑定的用户已被删除");
        const oldUid = user.uid;
        if (oldUid) {
            cancelPendingUserUpdates(oldUid);
            await drainAndDiscardScoreHistoryForUser(oldUid);
            await deleteScoreHistoryForUser(oldUid);
        }
        Object.assign(user, resetUserForNewIdentity(user));
        user.lxns = { auth: null, name: null, id: null };
    }
    if (!shared.users.includes(user)) throw new Error("要绑定的用户已被删除");
    applyLXNSAuth(user, auth, expiresIn);
    await shared.persistUsers();
    snackbar({
        message: "落雪绑定成功！",
        autoCloseDelay: 500,
    });
}

function getLegacyTransaction(state: string): LXNSOAuthTransaction | null {
    if (window.sessionStorage.getItem("lxns_oauth_state") !== state) return null;
    const index = window.sessionStorage.getItem("lxns_oauth_user_index");
    const verifier = window.sessionStorage.getItem("lxns_oauth_code_verifier");
    const user = index && /^\d+$/.test(index) ? useShared().users[Number(index)] : null;
    if (!user?.uid || !verifier) return null;
    return {
        userUid: user.uid,
        codeVerifier: verifier,
        clientId: import.meta.env.VITE_LXNS_OAUTH_CLIENT_ID,
        redirectUri: import.meta.env.VITE_LXNS_OAUTH_REDIRECT_URI,
        expiresAt: Date.now() + LXNS_OAUTH_LIFETIME,
    };
}

const pendingCallbacks = new Map<string, Promise<void>>();

export function handleLXNSOAuthCallback(callback: LXNSOAuthCallback): Promise<void> {
    const pending = pendingCallbacks.get(callback.state);
    if (pending) return pending;
    const promise = completeLXNSOAuthCallback(callback).finally(() => {
        pendingCallbacks.delete(callback.state);
    });
    pendingCallbacks.set(callback.state, promise);
    return promise;
}

async function completeLXNSOAuthCallback(callback: LXNSOAuthCallback): Promise<void> {
    const shared = useShared();
    await shared.usersLoaded;
    assertLXNSOAuthCallbackParameters(callback);
    const transaction =
        getLXNSOAuthTransaction(callback.state) || getLegacyTransaction(callback.state);
    if (!transaction) {
        throw new LXNSOAuthRecoveryError("此窗口没有对应的授权记录，或授权已过期");
    }

    assertLXNSOAuthCallbackAddress(callback, transaction);
    if (callback.error) {
        removeLXNSOAuthTransaction(callback.state);
        clearCapturedLXNSOAuthCallback(callback.state);
        clearLegacyTransaction(callback.state);
        assertLXNSOAuthCallbackSucceeded(callback);
    }

    if (!shared.users.some(user => user.uid === transaction.userUid)) {
        removeLXNSOAuthTransaction(callback.state);
        throw new Error("要绑定的用户已被删除，请重新添加用户后授权");
    }
    storeLXNSOAuthTransaction(callback.state, { ...transaction, callback });

    try {
        let token = transaction.token;
        if (!token) {
            token = await exchangeLXNSOAuthCode(callback.code, transaction);
            // Do not redeem the single-use code again if saving or confirmation is interrupted.
            storeLXNSOAuthTransaction(callback.state, { ...transaction, callback, token });
        }
        assertLXNSOAuthTokenUsable(token);
        await saveLXNSAuth(transaction.userUid, token.auth, (token.expiresAt - Date.now()) / 1000);
        removeLXNSOAuthTransaction(callback.state);
        clearCapturedLXNSOAuthCallback(callback.state);
        clearLegacyTransaction(callback.state);
    } catch (error) {
        if (
            error instanceof LXNSOAuthCancelledError ||
            (error instanceof LXNSTokenError && error.oauthError === "invalid_grant")
        ) {
            removeLXNSOAuthTransaction(callback.state);
            clearCapturedLXNSOAuthCallback(callback.state);
            clearLegacyTransaction(callback.state);
        }
        throw error;
    }
}

function clearLegacyTransaction(state: string): void {
    if (window.sessionStorage.getItem("lxns_oauth_state") !== state) return;
    window.sessionStorage.removeItem("lxns_oauth_user_index");
    window.sessionStorage.removeItem("lxns_oauth_code_verifier");
    window.sessionStorage.removeItem("lxns_oauth_state");
}
