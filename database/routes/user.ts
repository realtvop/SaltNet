import { Elysia, t } from "elysia";
import { eq, or } from "drizzle-orm";
import { db, schema } from "../db";
import * as jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "saltnet-secret-key";

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

export function user(app: Elysia) {
    return app
        // 用户注册
        .post(
            "/register",
            async ({ body, set }) => {
                const { userName, email, password } = body;

                // 检查用户名或邮箱是否已存在
                const existingUser = await db
                    .select({ id: schema.users.id })
                    .from(schema.users)
                    .where(or(eq(schema.users.userName, userName), eq(schema.users.email, email)));

                if (existingUser.length > 0) {
                    set.status = 400;
                    return { error: "Username or email already exists" };
                }

                // 使用 Bun 内置的密码哈希
                const hashedPassword = await Bun.password.hash(password);

                // 创建用户
                const [newUser] = await db
                    .insert(schema.users)
                    .values({
                        userName,
                        email,
                        password: hashedPassword,
                    })
                    .returning({
                        id: schema.users.id,
                        userName: schema.users.userName,
                        email: schema.users.email,
                        createdAt: schema.users.createdAt,
                    });

                return { message: "Registration successful", user: newUser };
            },
            {
                body: t.Object({
                    userName: t.String({ minLength: 2, maxLength: 32 }),
                    email: t.String({ format: "email" }),
                    password: t.String({ minLength: 6 }),
                }),
            }
        )
        // 用户登录
        .post(
            "/login",
            async ({ body, set, headers }) => {
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
        .get("/", async ({ headers, set }) => {
            const user = await verifyAuth(headers["authorization"]);
            if (!user) {
                set.status = 401;
                return { error: "Not authenticated or invalid token" };
            }
            return { user };
        })
        // 用户登出（仅移除当前 session）
        .post("/logout", async ({ headers, set }) => {
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
        .post("/refresh", async ({ body, set }) => {
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
        });
}
