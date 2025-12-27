import { snackbar } from "mdui";
import type { SaltNetDatabaseLogin, SaltNetDatabaseUser } from "./type";

const DB_API_URL = import.meta.env.VITE_DB_URL;

// API Response Types
interface LoginResponse {
    message: string;
    sessionToken: string;
    refreshToken: string;
    user: SaltNetDatabaseUser;
}

interface RefreshResponse {
    message: string;
    sessionToken: string;
}

interface UserResponse {
    user: SaltNetDatabaseUser & { currentSessionToken: string };
}

interface ErrorResponse {
    error: string;
}

// ==================== API Request Helper ====================

interface ApiRequestOptions {
    url: string;
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    sessionToken?: string;
    successMessage?: string;
    errorMessage?: string;
    showNetworkError?: boolean;
}

/**
 * Generic API request helper that handles common patterns:
 * - JSON content type for POST requests with body
 * - Authorization header when sessionToken provided
 * - Error handling with snackbar notifications
 * - Network error handling
 */
async function apiRequest<T>(options: ApiRequestOptions): Promise<T | null> {
    const {
        url,
        method = "GET",
        body,
        sessionToken,
        successMessage,
        errorMessage,
        showNetworkError = true,
    } = options;

    try {
        const headers: Record<string, string> = {};
        if (body) headers["Content-Type"] = "application/json";
        if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;

        const fetchOptions: RequestInit = {
            method,
            headers,
        };
        if (body) {
            fetchOptions.body = JSON.stringify(body);
        }

        const resp = await fetch(url, fetchOptions);

        const data = await resp.json();

        if (!resp.ok) {
            if (errorMessage !== undefined) {
                snackbar({
                    message: (data as ErrorResponse).error || errorMessage,
                    autoCloseDelay: 3000,
                });
            }
            return null;
        }

        if (successMessage) {
            snackbar({ message: successMessage, autoCloseDelay: 2000 });
        }

        return data as T;
    } catch {
        if (showNetworkError) {
            snackbar({ message: "网络错误，请检查连接", autoCloseDelay: 3000 });
        }
        return null;
    }
}

// Session expiry duration: 7 days
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Login to SaltNet database
 */
export async function loginSaltNet(
    identifier: string,
    password: string
): Promise<SaltNetDatabaseLogin | null> {
    const data = await apiRequest<LoginResponse>({
        url: `${DB_API_URL}/api/v0/user/login`,
        method: "POST",
        body: { identifier, password },
        errorMessage: "登录失败",
        successMessage: "SaltNet 登录成功！",
    });

    if (!data) return null;

    return {
        id: data.user.id,
        username: data.user.userName,
        email: data.user.email,
        sessionToken: data.sessionToken,
        refreshToken: data.refreshToken,
        sessionExpiry: Date.now() + SESSION_EXPIRY_MS,
        maimaidxRegion: data.user.maimaidxRegion,
    };
}

/**
 * Refresh session token using refresh token
 */
export async function refreshSaltNetToken(
    refreshToken: string
): Promise<{ sessionToken: string; sessionExpiry: number } | null> {
    const data = await apiRequest<RefreshResponse>({
        url: `${DB_API_URL}/api/v0/user/refresh`,
        method: "POST",
        body: { refreshToken },
        showNetworkError: false,
    });

    if (!data) return null;

    return {
        sessionToken: data.sessionToken,
        sessionExpiry: Date.now() + SESSION_EXPIRY_MS,
    };
}

/**
 * Get current user info
 */
export async function getSaltNetUser(sessionToken: string): Promise<SaltNetDatabaseUser | null> {
    const data = await apiRequest<UserResponse>({
        url: `${DB_API_URL}/api/v0/user`,
        sessionToken,
        showNetworkError: false,
    });

    return data?.user ?? null;
}

/**
 * Register a new SaltNet account and auto-login
 */
export async function registerSaltNet(
    userName: string,
    password: string,
    email?: string
): Promise<SaltNetDatabaseLogin | null> {
    const data = await apiRequest<{ message: string }>({
        url: `${DB_API_URL}/api/v0/user/register`,
        method: "POST",
        body: { userName, password, ...(email && { email }) },
        errorMessage: "注册失败",
        successMessage: "注册成功！正在登录...",
    });

    if (!data) return null;

    // Auto-login after registration
    return loginSaltNet(userName, password);
}

/**
 * Request password reset email
 */
export async function forgotPassword(email: string): Promise<boolean> {
    const data = await apiRequest<{ message: string }>({
        url: `${DB_API_URL}/api/v0/user/forgot-password`,
        method: "POST",
        body: { email },
        errorMessage: "发送失败",
        successMessage: "如果该邮箱已注册，重置邮件将会发送",
    });

    return data !== null;
}

// Score API Types
export interface SaltNetScoreResponse {
    id: number;
    title: string;
    type: "std" | "dx" | "utage";
    difficulty: string;
    level: string;
    internalLevel: number;
    achievements: number;
    dxScore: number;
    comboStat: string;
    syncStat: string;
    playCount: number | null;
    rating: number;
}

export interface SaltNetUploadScore {
    title: string;
    type: "std" | "dx" | "utage";
    difficulty: string;
    achievements: number;
    dxScore: number;
    comboStat: string;
    syncStat: string;
    playCount?: number | null;
}

interface UploadRecordsResponse {
    message: string;
    success: number;
    failed: number;
    errors?: string[];
}

/**
 * Get user scores from SaltNet database
 */
export async function getSaltNetRecords(
    sessionToken: string
): Promise<SaltNetScoreResponse[] | null> {
    const data = await apiRequest<{ records: SaltNetScoreResponse[] }>({
        url: `${DB_API_URL}/api/v0/maimaidx/records`,
        sessionToken,
        showNetworkError: false,
    });

    return data?.records ?? null;
}

// B50 API Response Types
export interface SaltNetB50Response {
    past: SaltNetScoreResponse[]; // Top 35 scores from older versions
    new: SaltNetScoreResponse[]; // Top 15 scores from current version
}

/**
 * Get user B50 data from SaltNet database
 */
export async function getSaltNetB50(sessionToken: string): Promise<SaltNetB50Response | null> {
    return apiRequest<SaltNetB50Response>({
        url: `${DB_API_URL}/api/v0/maimaidx/records/b50`,
        sessionToken,
        showNetworkError: false,
    });
}

/**
 * Get user B50 data by username (public API, no auth required)
 */
export async function getSaltNetB50ByUsername(
    username: string
): Promise<SaltNetB50Response | null> {
    return apiRequest<SaltNetB50Response>({
        url: `${DB_API_URL}/api/v0/maimaidx/records/b50?user=${encodeURIComponent(username)}`,
        showNetworkError: false,
    });
}

/**
 * Get user records by username (requires auth)
 */
export async function getSaltNetRecordsByUsername(
    sessionToken: string,
    username: string
): Promise<SaltNetScoreResponse[] | null> {
    const data = await apiRequest<{ records: SaltNetScoreResponse[] }>({
        url: `${DB_API_URL}/api/v0/maimaidx/records?user=${encodeURIComponent(username)}`,
        sessionToken,
        showNetworkError: false,
    });

    return data?.records ?? null;
}

/**
 * Upload scores to SaltNet database
 */
export async function uploadToSaltNet(
    sessionToken: string,
    scores: SaltNetUploadScore[]
): Promise<UploadRecordsResponse | null> {
    return apiRequest<UploadRecordsResponse>({
        url: `${DB_API_URL}/api/v0/maimaidx/records`,
        method: "POST",
        body: scores,
        sessionToken,
        errorMessage: "上传失败",
    });
}

// ==================== User Account Management APIs ====================

import type { MaimaidxRegion } from "./type";

/**
 * Logout from SaltNet
 */
export async function logoutSaltNet(sessionToken: string): Promise<boolean> {
    const data = await apiRequest<{ message: string }>({
        url: `${DB_API_URL}/api/v0/user/logout`,
        method: "POST",
        sessionToken,
        successMessage: "已退出登录",
        showNetworkError: false,
    });

    return data !== null;
}

/**
 * Update user's maimai DX region
 */
export async function updateSaltNetRegion(
    sessionToken: string,
    region: MaimaidxRegion
): Promise<boolean> {
    const data = await apiRequest<{ message: string }>({
        url: `${DB_API_URL}/api/v0/user/update-region`,
        method: "POST",
        body: { region },
        sessionToken,
        errorMessage: "更新地区失败",
        successMessage: "地区更新成功",
    });

    return data !== null;
}

/**
 * Change password (requires current password)
 */
export async function changePassword(
    sessionToken: string,
    currentPassword: string,
    newPassword: string
): Promise<boolean> {
    const data = await apiRequest<{ message: string }>({
        url: `${DB_API_URL}/api/v0/user/change-password`,
        method: "POST",
        body: { currentPassword, newPassword },
        sessionToken,
        errorMessage: "修改密码失败",
        successMessage: "密码修改成功",
    });

    return data !== null;
}

/**
 * Bind email to account (for users without email)
 */
export async function bindEmail(sessionToken: string, email: string): Promise<boolean> {
    const data = await apiRequest<{ message: string }>({
        url: `${DB_API_URL}/api/v0/user/bind-email`,
        method: "POST",
        body: { email },
        sessionToken,
        errorMessage: "绑定邮箱失败",
        successMessage: "验证邮件已发送，请查收",
    });

    return data !== null;
}

/**
 * Request email change (requires password verification)
 */
export async function changeEmail(
    sessionToken: string,
    newEmail: string,
    password: string
): Promise<boolean> {
    const data = await apiRequest<{ message: string }>({
        url: `${DB_API_URL}/api/v0/user/change-email`,
        method: "POST",
        body: { newEmail, password },
        sessionToken,
        errorMessage: "修改邮箱失败",
        successMessage: "验证邮件已发送到新邮箱，请查收",
    });

    return data !== null;
}

// ==================== OAuth APIs ====================

import type { OAuthProvider, OAuthAccount } from "./type";

/**
 * Get OAuth authorization URL for login
 */
export function getOAuthLoginUrl(provider: OAuthProvider): string {
    return `${DB_API_URL}/api/v0/oauth/${provider}/login`;
}

/**
 * Get OAuth authorization URL for binding (requires session token in header)
 * Since this is a redirect, we need to handle it differently
 */
export function getOAuthBindUrl(provider: OAuthProvider): string {
    return `${DB_API_URL}/api/v0/oauth/${provider}/bind`;
}

/**
 * Get linked OAuth accounts for current user
 */
export async function getOAuthAccounts(sessionToken: string): Promise<OAuthAccount[]> {
    const data = await apiRequest<{ accounts: OAuthAccount[] }>({
        url: `${DB_API_URL}/api/v0/oauth/accounts`,
        sessionToken,
        showNetworkError: false,
    });

    return data?.accounts ?? [];
}

/**
 * Unlink OAuth account
 */
export async function unlinkOAuthAccount(
    sessionToken: string,
    provider: OAuthProvider
): Promise<boolean> {
    const data = await apiRequest<{ message: string }>({
        url: `${DB_API_URL}/api/v0/oauth/${provider}`,
        method: "DELETE",
        sessionToken,
        errorMessage: "解绑失败",
        successMessage: "已解除绑定",
    });

    return data !== null;
}

/**
 * Handle OAuth callback - process tokens from URL
 */
export function handleOAuthCallback(): {
    success: boolean;
    data?: SaltNetDatabaseLogin;
    error?: string;
    action?: string;
    isNew?: boolean;
} {
    const params = new URLSearchParams(window.location.search);

    // Check for error
    const error = params.get("error");
    if (error) {
        return { success: false, error };
    }

    // Check for success action (bind)
    const successAction = params.get("success");
    if (successAction) {
        return { success: true, action: successAction };
    }

    // Check for login tokens
    const sessionToken = params.get("sessionToken");
    const refreshToken = params.get("refreshToken");
    const userName = params.get("userName");
    const isNew = params.get("isNew") === "true";

    if (sessionToken && refreshToken && userName) {
        return {
            success: true,
            isNew,
            data: {
                id: 0, // Will be fetched later
                username: userName,
                email: null,
                sessionToken,
                refreshToken,
                sessionExpiry: Date.now() + SESSION_EXPIRY_MS,
                maimaidxRegion: null,
            },
        };
    }

    return { success: false, error: "invalid_callback" };
}
