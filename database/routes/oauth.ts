import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import {
    getOAuthAuthUrl,
    exchangeCodeForUserInfo,
    findOAuthAccount,
    getUserOAuthAccounts,
    linkOAuthAccount,
    unlinkOAuthAccount,
    createSessionTokens,
    generateRandomUsername,
    createOAuthState,
    verifyOAuthState,
    type OAuthProvider,
    type OAuthState,
} from "../services/oauth";
import { verifyUserAuth } from "../services/auth";

type ElysiaSet = {
    status?: number;
    headers: Record<string, string>;
    redirect?: string;
};

type ElysiaHeaders = Record<string, string | undefined>;

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export function oauth(app: Elysia | any) {
    return (
        app
            // Initiate OAuth login flow
            .get(
                "/oauth/:provider/login",
                async ({ params, set }: { params: { provider: string }; set: ElysiaSet }) => {
                    const provider = params.provider as OAuthProvider;
                    if (provider !== "google" && provider !== "github") {
                        set.status = 400;
                        return { error: "Invalid provider" };
                    }

                    const state = createOAuthState({
                        action: "login",
                        nonce: crypto.randomUUID(),
                    });

                    const authUrl = getOAuthAuthUrl(provider, state);
                    set.redirect = authUrl;
                    set.status = 302;
                    return { url: authUrl };
                }
            )
            // Initiate OAuth bind flow (requires auth)
            .get(
                "/oauth/:provider/bind",
                async ({
                    params,
                    headers,
                    set,
                }: {
                    params: { provider: string };
                    headers: ElysiaHeaders;
                    set: ElysiaSet;
                }) => {
                    const provider = params.provider as OAuthProvider;
                    if (provider !== "google" && provider !== "github") {
                        set.status = 400;
                        return { error: "Invalid provider" };
                    }

                    const authResult = await verifyUserAuth(headers["authorization"]);
                    if (!authResult) {
                        set.status = 401;
                        return { error: "Not authenticated" };
                    }

                    const state = createOAuthState({
                        action: "bind",
                        userId: authResult.user.id,
                        nonce: crypto.randomUUID(),
                    });

                    const authUrl = getOAuthAuthUrl(provider, state);
                    set.redirect = authUrl;
                    set.status = 302;
                    return { url: authUrl };
                }
            )
            // OAuth callback handler
            .get(
                "/oauth/:provider/callback",
                async ({
                    params,
                    query,
                    headers,
                    set,
                }: {
                    params: { provider: string };
                    query: { code?: string; state?: string; error?: string };
                    headers: ElysiaHeaders;
                    set: ElysiaSet;
                }) => {
                    const provider = params.provider as OAuthProvider;
                    if (provider !== "google" && provider !== "github") {
                        return redirectWithError("invalid_provider");
                    }

                    if (query.error) {
                        return redirectWithError("oauth_denied");
                    }

                    if (!query.code || !query.state) {
                        return redirectWithError("missing_params");
                    }

                    // Verify state
                    const stateData = verifyOAuthState(query.state);
                    if (!stateData) {
                        return redirectWithError("invalid_state");
                    }

                    // Exchange code for user info
                    const userInfo = await exchangeCodeForUserInfo(provider, query.code);
                    if (!userInfo) {
                        return redirectWithError("oauth_failed");
                    }

                    // Check if this OAuth account is already linked
                    const existingOAuthAccount = await findOAuthAccount(
                        provider,
                        userInfo.providerAccountId
                    );

                    if (stateData.action === "bind") {
                        // Bind action - link OAuth to existing user
                        if (!stateData.userId) {
                            return redirectWithError("invalid_state");
                        }

                        if (existingOAuthAccount) {
                            if (existingOAuthAccount.user === stateData.userId) {
                                return redirectWithError("already_linked");
                            }
                            return redirectWithError("account_used_by_other");
                        }

                        const linked = await linkOAuthAccount(stateData.userId, userInfo);
                        if (!linked) {
                            return redirectWithError("link_failed");
                        }

                        return redirectWithSuccess("bind_success");
                    }

                    // Login action
                    if (existingOAuthAccount) {
                        // User exists - create session
                        const [user] = await db
                            .select()
                            .from(schema.users)
                            .where(eq(schema.users.id, existingOAuthAccount.user));

                        if (!user) {
                            return redirectWithError("user_not_found");
                        }

                        const { sessionToken, refreshToken } = createSessionTokens(
                            user.id,
                            user.email
                        );

                        // Update sessions
                        const sessions = (user.sessions as schema.UserLoginSession[]) || [];
                        const newSession: schema.UserLoginSession = {
                            application: null,
                            userAgent: headers["user-agent"] || "unknown",
                            ipAddress:
                                headers["x-forwarded-for"] || headers["x-real-ip"] || "unknown",
                            lastActive: Date.now(),
                            sessionToken,
                            refreshToken,
                        };
                        sessions.push(newSession);

                        await db
                            .update(schema.users)
                            .set({ sessions })
                            .where(eq(schema.users.id, user.id));

                        return redirectWithTokens(sessionToken, refreshToken, user.userName);
                    }

                    // New user - create account
                    const userName = generateRandomUsername(userInfo.name);

                    const [newUser] = await db
                        .insert(schema.users)
                        .values({
                            userName,
                            email: userInfo.email,
                            password: null, // OAuth users have no password
                            emailVerified: !!userInfo.email, // If email is from OAuth, consider it verified
                        })
                        .returning();

                    if (!newUser) {
                        return redirectWithError("create_user_failed");
                    }

                    // Link OAuth account
                    await linkOAuthAccount(newUser.id, userInfo);

                    // Create session
                    const { sessionToken, refreshToken } = createSessionTokens(
                        newUser.id,
                        newUser.email
                    );

                    const newSession: schema.UserLoginSession = {
                        application: null,
                        userAgent: headers["user-agent"] || "unknown",
                        ipAddress: headers["x-forwarded-for"] || headers["x-real-ip"] || "unknown",
                        lastActive: Date.now(),
                        sessionToken,
                        refreshToken,
                    };

                    await db
                        .update(schema.users)
                        .set({ sessions: [newSession] })
                        .where(eq(schema.users.id, newUser.id));

                    return redirectWithTokens(sessionToken, refreshToken, newUser.userName, true);
                },
                {
                    query: t.Object({
                        code: t.Optional(t.String()),
                        state: t.Optional(t.String()),
                        error: t.Optional(t.String()),
                    }),
                }
            )
            // Get linked OAuth accounts for current user
            .get(
                "/oauth/accounts",
                async ({ headers, set }: { headers: ElysiaHeaders; set: ElysiaSet }) => {
                    const authResult = await verifyUserAuth(headers["authorization"]);
                    if (!authResult) {
                        set.status = 401;
                        return { error: "Not authenticated" };
                    }

                    const accounts = await getUserOAuthAccounts(authResult.user.id);
                    return {
                        accounts: accounts.map(a => ({
                            provider: a.provider,
                            email: a.email,
                            name: a.name,
                            avatarUrl: a.avatarUrl,
                            linkedAt: a.createdAt,
                        })),
                    };
                }
            )
            // Unlink OAuth account
            .delete(
                "/oauth/:provider",
                async ({
                    params,
                    headers,
                    set,
                }: {
                    params: { provider: string };
                    headers: ElysiaHeaders;
                    set: ElysiaSet;
                }) => {
                    const provider = params.provider as OAuthProvider;
                    if (provider !== "google" && provider !== "github") {
                        set.status = 400;
                        return { error: "Invalid provider" };
                    }

                    const authResult = await verifyUserAuth(headers["authorization"]);
                    if (!authResult) {
                        set.status = 401;
                        return { error: "Not authenticated" };
                    }

                    // Check if user has password or other OAuth accounts
                    const [user] = await db
                        .select()
                        .from(schema.users)
                        .where(eq(schema.users.id, authResult.user.id));

                    if (!user) {
                        set.status = 404;
                        return { error: "User not found" };
                    }

                    const oauthAccounts = await getUserOAuthAccounts(authResult.user.id);

                    // Prevent unlinking if it's the only login method
                    if (!user.password && oauthAccounts.length <= 1) {
                        set.status = 400;
                        return {
                            error: "Cannot unlink the only login method. Please set a password first.",
                        };
                    }

                    const success = await unlinkOAuthAccount(authResult.user.id, provider);
                    if (!success) {
                        set.status = 500;
                        return { error: "Failed to unlink account" };
                    }

                    return { message: "Account unlinked successfully" };
                }
            )
    );
}

// Helper functions for redirects
function redirectWithError(error: string): Response {
    return Response.redirect(`${FRONTEND_URL}/oauth/callback?error=${error}`, 302);
}

function redirectWithSuccess(action: string): Response {
    return Response.redirect(`${FRONTEND_URL}/oauth/callback?success=${action}`, 302);
}

function redirectWithTokens(
    sessionToken: string,
    refreshToken: string,
    userName: string,
    isNew = false
): Response {
    const params = new URLSearchParams({
        sessionToken,
        refreshToken,
        userName,
        ...(isNew && { isNew: "true" }),
    });
    return Response.redirect(`${FRONTEND_URL}/oauth/callback?${params.toString()}`, 302);
}
