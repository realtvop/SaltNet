import { Elysia, t } from "elysia";
import { eq, or, isNull, and } from "drizzle-orm";
import { db, schema } from "../db";
import * as jwt from "jsonwebtoken";
import { sendVerificationEmail, sendPasswordResetEmail, sendEmailChangeVerification } from "../services/email";
import {
    saveEmailVerificationToken,
    getEmailVerificationUserId,
    deleteEmailVerificationToken,
    savePasswordResetToken,
    getPasswordResetUserId,
    deletePasswordResetToken,
    saveEmailChangeToken,
    getEmailChangeData,
    deleteEmailChangeToken,
} from "../services/redis";

// Type definitions for Elysia context
type ElysiaSet = {
    status?: number;
    headers: Record<string, string>;
};

type ElysiaHeaders = Record<string, string | undefined>;

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined");

// Password validation: 8-32 chars, uppercase, lowercase, digit
const validatePassword = (password: string): { valid: boolean; error?: string } => {
    if (password.length < 8 || password.length > 32) {
        return { valid: false, error: "Password must be 8-32 characters" };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, error: "Password must contain at least one uppercase letter" };
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, error: "Password must contain at least one lowercase letter" };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, error: "Password must contain at least one digit" };
    }
    return { valid: true };
};

// 验证 sessionToken 并返回用户
const verifyAuth = async (authorization: string | undefined) => {
    if (!authorization || !authorization.startsWith("Bearer ")) {
        return null;
    }

    const token = authorization.slice(7);
    try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId: number; email: string; type?: string };

        // 验证是否为 session token
        if (payload.type !== "session") {
            return null;
        }

        const [user] = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, payload.userId));

        if (!user) {
            return null;
        }

        // 验证 sessionToken 是否存在于用户的 sessions 中
        const sessions = (user.sessions as schema.UserLoginSession[]) || [];
        const sessionExists = sessions.some(s => s.sessionToken === token);
        if (!sessionExists) {
            return null;
        }

        return {
            id: user.id,
            userName: user.userName,
            email: user.email,
            createdAt: user.createdAt,
            maimaidxRegion: user.maimaidxRegion,
            maimaidxRating: user.maimaidxRating,
            currentSessionToken: token,
        };
    } catch {
        return null;
    }
};

export function user(app: Elysia | any) {
    return app
        // 用户注册
        .post(
            "/register",
            async ({ body, set }: { body: { userName: string; email?: string; password: string }; set: ElysiaSet }) => {
                const { userName, email, password } = body;

                // 验证密码复杂度
                const passwordValidation = validatePassword(password);
                if (!passwordValidation.valid) {
                    set.status = 400;
                    return { error: passwordValidation.error };
                }

                // 检查用户名是否已存在
                const [existingUserByName] = await db
                    .select()
                    .from(schema.users)
                    .where(eq(schema.users.userName, userName));

                // 如果邮箱已提供，检查是否已存在
                let existingUserByEmail = null;
                if (email) {
                    [existingUserByEmail] = await db
                        .select()
                        .from(schema.users)
                        .where(eq(schema.users.email, email));
                }

                // 如果用户名已存在且已验证邮箱，拒绝注册
                if (existingUserByName && existingUserByName.emailVerified) {
                    set.status = 400;
                    return { error: "Username already exists" };
                }

                // 如果邮箱已存在（无论是否验证），拒绝注册
                if (existingUserByEmail) {
                    set.status = 400;
                    return { error: "Email already exists" };
                }

                // 使用 Bun 内置的密码哈希
                const hashedPassword = await Bun.password.hash(password);

                let newUser;

                if (existingUserByName && !existingUserByName.emailVerified) {
                    // 覆盖未验证邮箱的同名用户
                    [newUser] = await db
                        .update(schema.users)
                        .set({
                            email: email || null,
                            password: hashedPassword,
                            createdAt: new Date(),
                            sessions: [],
                            emailVerified: false,
                        })
                        .where(eq(schema.users.id, existingUserByName.id))
                        .returning({
                            id: schema.users.id,
                            userName: schema.users.userName,
                            email: schema.users.email,
                            createdAt: schema.users.createdAt,
                        });
                } else {
                    // 创建新用户
                    [newUser] = await db
                        .insert(schema.users)
                        .values({
                            userName,
                            email: email || null,
                            password: hashedPassword,
                        })
                        .returning({
                            id: schema.users.id,
                            userName: schema.users.userName,
                            email: schema.users.email,
                            createdAt: schema.users.createdAt,
                        });
                }

                // 只有提供邮箱时才发送验证邮件
                if (email) {
                    const verificationToken = crypto.randomUUID();
                    await saveEmailVerificationToken(newUser!.id, verificationToken);
                    await sendVerificationEmail(email, verificationToken);
                    return { message: "Registration successful. Please check your email to verify.", user: newUser };
                }

                return { message: "Registration successful.", user: newUser };
            },

            {
                body: t.Object({
                    userName: t.String({ minLength: 2, maxLength: 32 }),
                    email: t.Optional(t.String({ format: "email" })),
                    password: t.String({ minLength: 8, maxLength: 32 }),
                }),
            }
        )

        // 用户登录
        .post(
            "/login",
            async ({ body, set, headers }: { body: { identifier: string; password: string }; set: ElysiaSet; headers: ElysiaHeaders }) => {
                const { identifier, password } = body;

                // 查询用户（支持用户名或邮箱登录）
                const [user] = await db
                    .select()
                    .from(schema.users)
                    .where(or(eq(schema.users.userName, identifier), eq(schema.users.email, identifier)));

                if (!user) {
                    set.status = 401;
                    return { error: "Invalid username or password" };
                }

                // 验证密码
                const isValid = await Bun.password.verify(password, user.password);
                if (!isValid) {
                    set.status = 401;
                    return { error: "Invalid username or password" };
                }


                // 生成 sessionToken 和 refreshToken
                const sessionToken = jwt.sign(
                    { userId: user.id, email: user.email, type: "session" },
                    JWT_SECRET,
                    { expiresIn: "7d" }
                );
                const refreshToken = jwt.sign(
                    { userId: user.id, email: user.email, type: "refresh" },
                    JWT_SECRET,
                    { expiresIn: "30d" }
                );

                // 更新会话信息
                const sessions = (user.sessions as schema.UserLoginSession[]) || [];
                const newSession: schema.UserLoginSession = {
                    application: null, // null 表示官方网站登录
                    userAgent: headers["user-agent"] || "unknown",
                    ipAddress: headers["x-forwarded-for"] || headers["x-real-ip"] || "unknown",
                    lastActive: Date.now(),
                    sessionToken,
                    refreshToken,
                };
                sessions.push(newSession);

                await db.update(schema.users).set({ sessions }).where(eq(schema.users.id, user.id));

                return {
                    message: "Login successful",
                    sessionToken,
                    refreshToken,
                    user: {
                        id: user.id,
                        userName: user.userName,
                        email: user.email,
                        createdAt: user.createdAt,
                        maimaidxRegion: user.maimaidxRegion,
                        maimaidxRating: user.maimaidxRating,
                    },
                };
            },
            {
                body: t.Object({
                    identifier: t.String(), // 用户名或邮箱
                    password: t.String(),
                }),
            }
        )
        // 获取当前用户信息
        .get("/", async ({ headers, set }: { headers: ElysiaHeaders; set: ElysiaSet }) => {
            const user = await verifyAuth(headers["authorization"]);
            if (!user) {
                set.status = 401;
                return { error: "Not authenticated or invalid token" };
            }
            return { user };
        })
        // 用户登出（仅移除当前 session）
        .post("/logout", async ({ headers, set }: { headers: ElysiaHeaders; set: ElysiaSet }) => {
            const user = await verifyAuth(headers["authorization"]);
            if (!user) {
                set.status = 401;
                return { error: "Not authenticated or invalid token" };
            }

            // 获取当前用户的所有 sessions 并移除当前 sessionToken
            const [dbUser] = await db
                .select({ sessions: schema.users.sessions })
                .from(schema.users)
                .where(eq(schema.users.id, user.id));

            const sessions = (dbUser?.sessions as schema.UserLoginSession[]) || [];
            const updatedSessions = sessions.filter(s => s.sessionToken !== user.currentSessionToken);

            await db.update(schema.users).set({ sessions: updatedSessions }).where(eq(schema.users.id, user.id));

            return { message: "Logout successful" };
        })
        // 刷新 sessionToken
        .post("/refresh", async ({ body, set }: { body: { refreshToken: string }; set: ElysiaSet }) => {
            const { refreshToken } = body;

            try {
                const payload = jwt.verify(refreshToken, JWT_SECRET) as { userId: number; email: string; type?: string };

                if (payload.type !== "refresh") {
                    set.status = 401;
                    return { error: "Invalid refresh token" };
                }

                const [user] = await db
                    .select()
                    .from(schema.users)
                    .where(eq(schema.users.id, payload.userId));

                if (!user) {
                    set.status = 401;
                    return { error: "User does not exist" };
                }

                // 验证 refreshToken 是否存在于用户的 sessions 中
                const sessions = (user.sessions as schema.UserLoginSession[]) || [];
                const sessionIndex = sessions.findIndex(s => s.refreshToken === refreshToken);
                if (sessionIndex === -1) {
                    set.status = 401;
                    return { error: "Invalid or expired refresh token" };
                }

                // 生成新的 sessionToken
                const newSessionToken = jwt.sign(
                    { userId: user.id, email: user.email, type: "session" },
                    JWT_SECRET,
                    { expiresIn: "7d" }
                );

                // 更新 session 中的 sessionToken 和 lastActive
                const currentSession = sessions[sessionIndex];
                if (currentSession) {
                    currentSession.sessionToken = newSessionToken;
                    currentSession.lastActive = Date.now();
                }

                await db.update(schema.users).set({ sessions }).where(eq(schema.users.id, user.id));

                return {
                    message: "Refresh successful",
                    sessionToken: newSessionToken,
                };
            } catch {
                set.status = 401;
                return { error: "Invalid or expired refresh token" };
            }
        }, {
            body: t.Object({
                refreshToken: t.String(),
            }),
        })
        // 验证邮箱
        .get("/verify-email", async ({ query, set }: { query: { token: string }; set: ElysiaSet }) => {
            const { token } = query;

            const userId = await getEmailVerificationUserId(token);
            if (!userId) {
                set.status = 400;
                return { error: "Invalid or expired verification token" };
            }

            // 更新用户邮箱验证状态
            await db.update(schema.users)
                .set({ emailVerified: true })
                .where(eq(schema.users.id, userId));

            // 删除已使用的 token
            await deleteEmailVerificationToken(token);

            return { message: "Email verified successfully" };
        }, {
            query: t.Object({ token: t.String() }),
        })
        // 重发验证邮件
        .post("/resend-verification", async ({ body, set }: { body: { email: string }; set: ElysiaSet }) => {
            const { email } = body;

            const [user] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, email));

            if (!user) {
                // 不透露用户是否存在
                return { message: "If the email exists, a verification email will be sent" };
            }

            if (user.emailVerified) {
                set.status = 400;
                return { error: "Email is already verified" };
            }

            // 生成新的验证 token
            const verificationToken = crypto.randomUUID();
            await saveEmailVerificationToken(user.id, verificationToken);
            await sendVerificationEmail(email, verificationToken);

            return { message: "If the email exists, a verification email will be sent" };
        }, {
            body: t.Object({ email: t.String({ format: "email" }) }),
        })
        // 忘记密码 - 发送重置邮件
        .post("/forgot-password", async ({ body }: { body: { email: string } }) => {
            const { email } = body;

            const [user] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, email));

            if (user) {
                const resetToken = crypto.randomUUID();
                await savePasswordResetToken(user.id, resetToken);
                await sendPasswordResetEmail(email, resetToken);
            }

            // 不透露用户是否存在
            return { message: "If the email exists, a password reset email will be sent" };
        }, {
            body: t.Object({ email: t.String({ format: "email" }) }),
        })
        // 重置密码页面
        .get("/reset-password", async ({ query, set }: { query: { token: string }; set: ElysiaSet }) => {
            const { token } = query;

            const userId = await getPasswordResetUserId(token);
            if (!userId) {
                set.status = 400;
                set.headers["Content-Type"] = "text/html";
                return `
                    <!DOCTYPE html>
                    <html>
                    <head><title>Invalid Link</title></head>
                    <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#1a1a2e;color:#fff;">
                        <div style="text-align:center;">
                            <h1>Invalid or Expired Link</h1>
                            <p>Please request a new password reset.</p>
                        </div>
                    </body>
                    </html>
                `;
            }

            // 返回重置密码页面
            set.headers["Content-Type"] = "text/html";
            return Bun.file("public/reset-password.html");
        }, {
            query: t.Object({ token: t.String() }),
        })
        // 处理密码重置
        .post("/reset-password", async ({ body, set }: { body: { token: string; password: string }; set: ElysiaSet }) => {
            const { token, password } = body;

            // 验证密码复杂度
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                set.status = 400;
                return { error: passwordValidation.error };
            }

            const userId = await getPasswordResetUserId(token);
            if (!userId) {
                set.status = 400;
                return { error: "Invalid or expired reset token" };
            }

            // 更新密码
            const hashedPassword = await Bun.password.hash(password);
            await db.update(schema.users)
                .set({ password: hashedPassword })
                .where(eq(schema.users.id, userId));

            // 删除已使用的 token
            await deletePasswordResetToken(token);

            return { message: "Password reset successful" };
        }, {
            body: t.Object({
                token: t.String(),
                password: t.String({ minLength: 8, maxLength: 32 }),
            }),
        })
        // 修改密码（需要登录）
        .post("/change-password", async ({ body, headers, set }: { body: { currentPassword: string; newPassword: string }; headers: ElysiaHeaders; set: ElysiaSet }) => {
            const user = await verifyAuth(headers["authorization"]);
            if (!user) {
                set.status = 401;
                return { error: "Not authenticated or invalid token" };
            }

            const { currentPassword, newPassword } = body;

            // 验证新密码复杂度
            const passwordValidation = validatePassword(newPassword);
            if (!passwordValidation.valid) {
                set.status = 400;
                return { error: passwordValidation.error };
            }

            // 获取用户完整信息以验证当前密码
            const [dbUser] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, user.id));

            if (!dbUser) {
                set.status = 404;
                return { error: "User not found" };
            }

            // 验证当前密码
            const isValid = await Bun.password.verify(currentPassword, dbUser.password);
            if (!isValid) {
                set.status = 400;
                return { error: "Current password is incorrect" };
            }

            // 更新密码
            const hashedPassword = await Bun.password.hash(newPassword);
            await db.update(schema.users)
                .set({ password: hashedPassword })
                .where(eq(schema.users.id, user.id));

            return { message: "Password changed successfully" };
        }, {
            body: t.Object({
                currentPassword: t.String(),
                newPassword: t.String({ minLength: 8, maxLength: 32 }),
            }),
        })
        // 修改邮箱（需要登录）
        .post("/change-email", async ({ body, headers, set }: { body: { newEmail: string; password: string }; headers: ElysiaHeaders; set: ElysiaSet }) => {
            const user = await verifyAuth(headers["authorization"]);
            if (!user) {
                set.status = 401;
                return { error: "Not authenticated or invalid token" };
            }

            const { newEmail, password } = body;

            // 获取用户完整信息以验证密码
            const [dbUser] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, user.id));

            if (!dbUser) {
                set.status = 404;
                return { error: "User not found" };
            }

            // 验证密码
            const isValid = await Bun.password.verify(password, dbUser.password);
            if (!isValid) {
                set.status = 400;
                return { error: "Password is incorrect" };
            }

            // 检查新邮箱是否已被使用
            const [existingUser] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, newEmail));

            if (existingUser) {
                set.status = 400;
                return { error: "Email already in use" };
            }

            // 生成邮箱变更 token 并发送验证邮件
            const changeToken = crypto.randomUUID();
            await saveEmailChangeToken(user.id, newEmail, changeToken);
            await sendEmailChangeVerification(newEmail, changeToken);

            return { message: "Verification email sent to new address. Please verify to complete the change." };
        }, {
            body: t.Object({
                newEmail: t.String({ format: "email" }),
                password: t.String(),
            }),
        })
        // 验证新邮箱
        .get("/verify-email-change", async ({ query, set }: { query: { token: string }; set: ElysiaSet }) => {
            const { token } = query;

            const data = await getEmailChangeData(token);
            if (!data) {
                set.status = 400;
                return { error: "Invalid or expired verification token" };
            }

            const { userId, newEmail } = data;

            // 再次检查邮箱是否被占用（防止 race condition）
            const [existingUser] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, newEmail));

            if (existingUser && existingUser.id !== userId) {
                set.status = 400;
                return { error: "Email already in use" };
            }

            // 更新邮箱并设为已验证
            await db.update(schema.users)
                .set({ email: newEmail, emailVerified: true })
                .where(eq(schema.users.id, userId));

            // 删除已使用的 token
            await deleteEmailChangeToken(token);

            return { message: "Email changed successfully" };
        }, {
            query: t.Object({ token: t.String() }),
        })
        // 绑定邮箱（针对无邮箱用户）
        .post("/bind-email", async ({ body, headers, set }: { body: { email: string }; headers: ElysiaHeaders; set: ElysiaSet }) => {
            const user = await verifyAuth(headers["authorization"]);
            if (!user) {
                set.status = 401;
                return { error: "Not authenticated or invalid token" };
            }

            const { email } = body;

            // 检查用户是否已有邮箱
            const [dbUser] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, user.id));

            if (!dbUser) {
                set.status = 404;
                return { error: "User not found" };
            }

            if (dbUser.email) {
                set.status = 400;
                return { error: "User already has an email. Use change-email instead." };
            }

            // 检查邮箱是否已被使用
            const [existingUser] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, email));

            if (existingUser) {
                set.status = 400;
                return { error: "Email already in use" };
            }

            // 生成验证 token 并发送验证邮件
            const verificationToken = crypto.randomUUID();
            await saveEmailChangeToken(user.id, email, verificationToken);
            await sendEmailChangeVerification(email, verificationToken);

            return { message: "Verification email sent. Please verify to bind the email." };
        }, {
            body: t.Object({
                email: t.String({ format: "email" }),
            }),
        });
}
