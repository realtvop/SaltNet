import { Elysia, t } from "elysia";
import { eq, or } from "drizzle-orm";
import { db, schema } from "../db";
import * as jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "saltnet-secret-key";

// 验证 JWT 并返回用户
const verifyAuth = async (authorization: string | undefined) => {
    if (!authorization || !authorization.startsWith("Bearer ")) {
        return null;
    }

    const token = authorization.slice(7);
    try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
        const [user] = await db
            .select({
                id: schema.users.id,
                userName: schema.users.userName,
                email: schema.users.email,
                createdAt: schema.users.createdAt,
                maimaidxRegion: schema.users.maimaidxRegion,
                maimaidxRating: schema.users.maimaidxRating,
            })
            .from(schema.users)
            .where(eq(schema.users.id, payload.userId));

        return user || null;
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
                    return { error: "用户名或邮箱已存在" };
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

                return { message: "注册成功", user: newUser };
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
                    return { error: "用户名或密码错误" };
                }

                // 验证密码
                const isValid = await Bun.password.verify(password, user.password);
                if (!isValid) {
                    set.status = 401;
                    return { error: "用户名或密码错误" };
                }

                // 生成 JWT
                const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
                    expiresIn: "7d",
                });

                // 更新会话信息
                const sessions = (user.sessions as any[]) || [];
                const newSession = {
                    userAgent: headers["user-agent"] || "unknown",
                    ipAddress: headers["x-forwarded-for"] || headers["x-real-ip"] || "unknown",
                    lastActive: Date.now(),
                };
                sessions.push(newSession);

                await db.update(schema.users).set({ sessions }).where(eq(schema.users.id, user.id));

                return {
                    message: "登录成功",
                    token,
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
                return { error: "未认证或令牌无效" };
            }
            return { user };
        })
        // 用户登出
        .post("/logout", async ({ headers, set }) => {
            const user = await verifyAuth(headers["authorization"]);
            if (!user) {
                set.status = 401;
                return { error: "未认证或令牌无效" };
            }

            // 清空会话列表
            await db.update(schema.users).set({ sessions: [] }).where(eq(schema.users.id, user.id));

            return { message: "登出成功" };
        });
}
