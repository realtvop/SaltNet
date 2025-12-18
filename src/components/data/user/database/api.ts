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
