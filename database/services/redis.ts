import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL!);

const EMAIL_VERIFY_PREFIX = "saltnet_email_verify:";
const PASSWORD_RESET_PREFIX = "saltnet_password_reset:";
const EMAIL_VERIFY_TTL = 24 * 60 * 60; // 24 hours
const PASSWORD_RESET_TTL = 60 * 60; // 1 hour

// Email Verification Token
export async function saveEmailVerificationToken(userId: number, token: string) {
    await redis.set(`${EMAIL_VERIFY_PREFIX}${token}`, userId.toString(), "EX", EMAIL_VERIFY_TTL);
}

export async function getEmailVerificationUserId(token: string): Promise<number | null> {
    const userId = await redis.get(`${EMAIL_VERIFY_PREFIX}${token}`);
    return userId ? parseInt(userId, 10) : null;
}

export async function deleteEmailVerificationToken(token: string) {
    await redis.del(`${EMAIL_VERIFY_PREFIX}${token}`);
}

// Password Reset Token
export async function savePasswordResetToken(userId: number, token: string) {
    await redis.set(`${PASSWORD_RESET_PREFIX}${token}`, userId.toString(), "EX", PASSWORD_RESET_TTL);
}

export async function getPasswordResetUserId(token: string): Promise<number | null> {
    const userId = await redis.get(`${PASSWORD_RESET_PREFIX}${token}`);
    return userId ? parseInt(userId, 10) : null;
}

export async function deletePasswordResetToken(token: string) {
    await redis.del(`${PASSWORD_RESET_PREFIX}${token}`);
}
