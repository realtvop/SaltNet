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

/**
 * Login to SaltNet database
 */
export async function loginSaltNet(
    identifier: string,
    password: string
): Promise<SaltNetDatabaseLogin | null> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ identifier, password }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            const errorData = data as ErrorResponse;
            snackbar({
                message: errorData.error || "登录失败",
                autoCloseDelay: 3000,
            });
            return null;
        }

        const loginData = data as LoginResponse;

        // Calculate session expiry (7 days from now)
        const sessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

        snackbar({
            message: "SaltNet 登录成功！",
            autoCloseDelay: 2000,
        });

        return {
            id: loginData.user.id,
            username: loginData.user.userName,
            email: loginData.user.email,
            sessionToken: loginData.sessionToken,
            refreshToken: loginData.refreshToken,
            sessionExpiry,
            maimaidxRegion: loginData.user.maimaidxRegion,
        };
    } catch (error) {
        snackbar({
            message: "网络错误，请检查连接",
            autoCloseDelay: 3000,
        });
        return null;
    }
}

/**
 * Refresh session token using refresh token
 */
export async function refreshSaltNetToken(
    refreshToken: string
): Promise<{ sessionToken: string; sessionExpiry: number } | null> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user/refresh`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ refreshToken }),
        });

        if (!resp.ok) {
            return null;
        }

        const data = (await resp.json()) as RefreshResponse;

        return {
            sessionToken: data.sessionToken,
            sessionExpiry: Date.now() + 7 * 24 * 60 * 60 * 1000,
        };
    } catch {
        return null;
    }
}

/**
 * Get current user info
 */
export async function getSaltNetUser(sessionToken: string): Promise<SaltNetDatabaseUser | null> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${sessionToken}`,
            },
        });

        if (!resp.ok) {
            return null;
        }

        const data = (await resp.json()) as UserResponse;
        return data.user;
    } catch {
        return null;
    }
}

/**
 * Register a new SaltNet account and auto-login
 */
export async function registerSaltNet(
    userName: string,
    password: string,
    email?: string
): Promise<SaltNetDatabaseLogin | null> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                userName,
                password,
                ...(email && { email }),
            }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            const errorData = data as ErrorResponse;
            snackbar({
                message: errorData.error || "注册失败",
                autoCloseDelay: 3000,
            });
            return null;
        }

        snackbar({
            message: "注册成功！正在登录...",
            autoCloseDelay: 1500,
        });

        // Auto-login after registration
        const loginResult = await loginSaltNet(userName, password);
        return loginResult;
    } catch (error) {
        snackbar({
            message: "网络错误，请检查连接",
            autoCloseDelay: 3000,
        });
        return null;
    }
}

/**
 * Request password reset email
 */
export async function forgotPassword(email: string): Promise<boolean> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user/forgot-password`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
        });

        if (!resp.ok) {
            const data = await resp.json();
            const errorData = data as ErrorResponse;
            snackbar({
                message: errorData.error || "发送失败",
                autoCloseDelay: 3000,
            });
            return false;
        }

        snackbar({
            message: "如果该邮箱已注册，重置邮件将会发送",
            autoCloseDelay: 3000,
        });
        return true;
    } catch (error) {
        snackbar({
            message: "网络错误，请检查连接",
            autoCloseDelay: 3000,
        });
        return false;
    }
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
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/maimaidx/records`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${sessionToken}`,
            },
        });

        if (!resp.ok) {
            return null;
        }

        const data = (await resp.json()) as { records: SaltNetScoreResponse[] };
        return data.records;
    } catch {
        return null;
    }
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
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/maimaidx/records/b50`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${sessionToken}`,
            },
        });

        if (!resp.ok) {
            return null;
        }

        const data = (await resp.json()) as SaltNetB50Response;
        return data;
    } catch {
        return null;
    }
}

/**
 * Upload scores to SaltNet database
 */
export async function uploadToSaltNet(
    sessionToken: string,
    scores: SaltNetUploadScore[]
): Promise<UploadRecordsResponse | null> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/maimaidx/records`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify(scores),
        });

        if (!resp.ok) {
            const data = await resp.json();
            const errorData = data as ErrorResponse;
            snackbar({
                message: errorData.error || "上传失败",
                autoCloseDelay: 3000,
            });
            return null;
        }

        return (await resp.json()) as UploadRecordsResponse;
    } catch (error) {
        snackbar({
            message: "网络错误，请检查连接",
            autoCloseDelay: 3000,
        });
        return null;
    }
}

// ==================== User Account Management APIs ====================

import type { MaimaidxRegion } from "./type";

/**
 * Logout from SaltNet
 */
export async function logoutSaltNet(sessionToken: string): Promise<boolean> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user/logout`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${sessionToken}`,
            },
        });

        if (!resp.ok) {
            return false;
        }

        snackbar({
            message: "已退出登录",
            autoCloseDelay: 2000,
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Update user's maimai DX region
 */
export async function updateSaltNetRegion(
    sessionToken: string,
    region: MaimaidxRegion
): Promise<boolean> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user/update-region`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({ region }),
        });

        if (!resp.ok) {
            const data = await resp.json();
            snackbar({
                message: (data as ErrorResponse).error || "更新地区失败",
                autoCloseDelay: 3000,
            });
            return false;
        }

        snackbar({
            message: "地区更新成功",
            autoCloseDelay: 2000,
        });
        return true;
    } catch {
        snackbar({
            message: "网络错误，请检查连接",
            autoCloseDelay: 3000,
        });
        return false;
    }
}

/**
 * Change password (requires current password)
 */
export async function changePassword(
    sessionToken: string,
    currentPassword: string,
    newPassword: string
): Promise<boolean> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user/change-password`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({ currentPassword, newPassword }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            snackbar({
                message: (data as ErrorResponse).error || "修改密码失败",
                autoCloseDelay: 3000,
            });
            return false;
        }

        snackbar({
            message: "密码修改成功",
            autoCloseDelay: 2000,
        });
        return true;
    } catch {
        snackbar({
            message: "网络错误，请检查连接",
            autoCloseDelay: 3000,
        });
        return false;
    }
}

/**
 * Bind email to account (for users without email)
 */
export async function bindEmail(sessionToken: string, email: string): Promise<boolean> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user/bind-email`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({ email }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            snackbar({
                message: (data as ErrorResponse).error || "绑定邮箱失败",
                autoCloseDelay: 3000,
            });
            return false;
        }

        snackbar({
            message: "验证邮件已发送，请查收",
            autoCloseDelay: 3000,
        });
        return true;
    } catch {
        snackbar({
            message: "网络错误，请检查连接",
            autoCloseDelay: 3000,
        });
        return false;
    }
}

/**
 * Request email change (requires password verification)
 */
export async function changeEmail(
    sessionToken: string,
    newEmail: string,
    password: string
): Promise<boolean> {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user/change-email`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({ newEmail, password }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            snackbar({
                message: (data as ErrorResponse).error || "修改邮箱失败",
                autoCloseDelay: 3000,
            });
            return false;
        }

        snackbar({
            message: "验证邮件已发送到新邮箱，请查收",
            autoCloseDelay: 3000,
        });
        return true;
    } catch {
        snackbar({
            message: "网络错误，请检查连接",
            autoCloseDelay: 3000,
        });
        return false;
    }
}
