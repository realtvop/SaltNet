import { eq, and } from "drizzle-orm";
import { db, schema } from "../db";
import * as jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID as string;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET as string;
const OAUTH_REDIRECT_BASE = process.env.OAUTH_REDIRECT_BASE || "http://localhost:3000";

export type OAuthProvider = "google" | "github";

export interface OAuthUserInfo {
    provider: OAuthProvider;
    providerAccountId: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
}

// Generate OAuth authorization URL
export function getOAuthAuthUrl(provider: OAuthProvider, state: string): string {
    const redirectUri = `${OAUTH_REDIRECT_BASE}/api/v0/oauth/${provider}/callback`;

    if (provider === "google") {
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: "openid email profile",
            state,
            access_type: "offline",
            prompt: "consent",
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    if (provider === "github") {
        const params = new URLSearchParams({
            client_id: GITHUB_CLIENT_ID,
            redirect_uri: redirectUri,
            scope: "user:email read:user",
            state,
        });
        return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    throw new Error(`Unknown provider: ${provider}`);
}

// Exchange authorization code for tokens and get user info
export async function exchangeCodeForUserInfo(
    provider: OAuthProvider,
    code: string
): Promise<OAuthUserInfo | null> {
    const redirectUri = `${OAUTH_REDIRECT_BASE}/api/v0/oauth/${provider}/callback`;

    if (provider === "google") {
        return await exchangeGoogleCode(code, redirectUri);
    }

    if (provider === "github") {
        return await exchangeGitHubCode(code, redirectUri);
    }

    return null;
}

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthUserInfo | null> {
    try {
        // Exchange code for tokens
        const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                code,
                grant_type: "authorization_code",
                redirect_uri: redirectUri,
            }),
        });

        if (!tokenResp.ok) return null;

        const tokens = (await tokenResp.json()) as { access_token: string; id_token?: string };

        // Get user info
        const userResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!userResp.ok) return null;

        const userInfo = (await userResp.json()) as {
            id: string;
            email?: string;
            name?: string;
            picture?: string;
        };

        return {
            provider: "google",
            providerAccountId: userInfo.id,
            email: userInfo.email || null,
            name: userInfo.name || null,
            avatarUrl: userInfo.picture || null,
        };
    } catch {
        return null;
    }
}

async function exchangeGitHubCode(code: string, redirectUri: string): Promise<OAuthUserInfo | null> {
    try {
        // Exchange code for access token
        const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code,
                redirect_uri: redirectUri,
            }),
        });

        if (!tokenResp.ok) return null;

        const tokens = (await tokenResp.json()) as { access_token: string };

        // Get user info
        const userResp = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });

        if (!userResp.ok) return null;

        const userInfo = (await userResp.json()) as {
            id: number;
            login: string;
            name?: string;
            avatar_url?: string;
        };

        // Get primary email
        const emailResp = await fetch("https://api.github.com/user/emails", {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });

        let email: string | null = null;
        if (emailResp.ok) {
            const emails = (await emailResp.json()) as Array<{
                email: string;
                primary: boolean;
                verified: boolean;
            }>;
            const primaryEmail = emails.find((e) => e.primary && e.verified);
            email = primaryEmail?.email || null;
        }

        return {
            provider: "github",
            providerAccountId: String(userInfo.id),
            email,
            name: userInfo.name || userInfo.login,
            avatarUrl: userInfo.avatar_url || null,
        };
    } catch {
        return null;
    }
}

// Find existing OAuth account
export async function findOAuthAccount(
    provider: OAuthProvider,
    providerAccountId: string
): Promise<typeof schema.oauthAccounts.$inferSelect | null> {
    const [account] = await db
        .select()
        .from(schema.oauthAccounts)
        .where(
            and(
                eq(schema.oauthAccounts.provider, provider),
                eq(schema.oauthAccounts.providerAccountId, providerAccountId)
            )
        );
    return account || null;
}

// Get OAuth accounts for a user
export async function getUserOAuthAccounts(
    userId: number
): Promise<Array<typeof schema.oauthAccounts.$inferSelect>> {
    return await db
        .select()
        .from(schema.oauthAccounts)
        .where(eq(schema.oauthAccounts.user, userId));
}

// Link OAuth account to existing user
export async function linkOAuthAccount(
    userId: number,
    userInfo: OAuthUserInfo
): Promise<typeof schema.oauthAccounts.$inferSelect | null> {
    try {
        const [account] = await db
            .insert(schema.oauthAccounts)
            .values({
                user: userId,
                provider: userInfo.provider,
                providerAccountId: userInfo.providerAccountId,
                email: userInfo.email,
                name: userInfo.name,
                avatarUrl: userInfo.avatarUrl,
            })
            .returning();
        return account || null;
    } catch {
        return null;
    }
}

// Unlink OAuth account from user
export async function unlinkOAuthAccount(
    userId: number,
    provider: OAuthProvider
): Promise<boolean> {
    try {
        const result = await db
            .delete(schema.oauthAccounts)
            .where(
                and(
                    eq(schema.oauthAccounts.user, userId),
                    eq(schema.oauthAccounts.provider, provider)
                )
            );
        return true;
    } catch {
        return false;
    }
}

// Create session tokens for a user
export function createSessionTokens(
    userId: number,
    email: string | null
): { sessionToken: string; refreshToken: string } {
    const sessionToken = jwt.sign(
        { userId, email, type: "session" },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
    const refreshToken = jwt.sign(
        { userId, email, type: "refresh" },
        JWT_SECRET,
        { expiresIn: "30d" }
    );
    return { sessionToken, refreshToken };
}

// Generate a random username for OAuth users
export function generateRandomUsername(baseName: string | null): string {
    const base = baseName?.replace(/[^a-zA-Z0-9]/g, "") || "user";
    const suffix = Math.random().toString(36).substring(2, 8);
    return `${base.substring(0, 20)}_${suffix}`;
}

// Create OAuth state token (contains action info)
export interface OAuthState {
    action: "login" | "bind";
    userId?: number; // Only for bind action
    nonce: string;
}

export function createOAuthState(state: OAuthState): string {
    return jwt.sign(state, JWT_SECRET, { expiresIn: "10m" });
}

export function verifyOAuthState(token: string): OAuthState | null {
    try {
        return jwt.verify(token, JWT_SECRET) as OAuthState;
    } catch {
        return null;
    }
}
