import * as jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined");

// 认证类型
export type AuthType = "session" | "pat";

// 认证结果
export interface AuthResult {
    user: {
        id: number;
        userName: string;
        email: string | null;
        createdAt: Date | null;
        maimaidxRegion: "jp" | "ex" | "cn" | null;
        maimaidxRating: number | null;
    };
    authType: AuthType;
    currentSessionToken?: string; // 仅 session 认证时存在
}

/**
 * 统一用户认证函数
 * 支持 sessionToken (JWT) 和 PAT 两种认证方式
 *
 * @param authorization - Authorization header 值
 * @returns AuthResult 或 null（认证失败）
 */
export async function verifyUserAuth(
    authorization: string | undefined
): Promise<AuthResult | null> {
    if (!authorization || !authorization.startsWith("Bearer ")) {
        return null;
    }

    const token = authorization.slice(7);

    // 1. 尝试 JWT 验证 (sessionToken)
    try {
        const payload = jwt.verify(token, JWT_SECRET) as {
            userId: number;
            email: string;
            type?: string;
        };

        // 验证是否为 session token
        if (payload.type === "session") {
            const [user] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, payload.userId));

            if (!user) {
                return null;
            }

            // 验证 sessionToken 是否存在于用户的 sessions 中
            const sessions = (user.sessions as schema.UserLoginSession[]) || [];
            const sessionExists = sessions.some((s) => s.sessionToken === token);
            if (!sessionExists) {
                return null;
            }

            return {
                user: {
                    id: user.id,
                    userName: user.userName,
                    email: user.email,
                    createdAt: user.createdAt,
                    maimaidxRegion: user.maimaidxRegion,
                    maimaidxRating: user.maimaidxRating,
                },
                authType: "session",
                currentSessionToken: token,
            };
        }
    } catch {
        // JWT 验证失败，继续尝试 PAT 验证
    }

    // 2. 尝试 PAT 验证
    const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.pat, token));

    if (user) {
        return {
            user: {
                id: user.id,
                userName: user.userName,
                email: user.email,
                createdAt: user.createdAt,
                maimaidxRegion: user.maimaidxRegion,
                maimaidxRating: user.maimaidxRating,
            },
            authType: "pat",
        };
    }

    return null;
}

/**
 * 密码复杂度验证
 * 要求: 8-32 字符，包含大写、小写、数字
 *
 * @param password - 待验证的密码
 * @returns 验证结果
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
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
}
