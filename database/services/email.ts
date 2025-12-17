import { Resend } from "resend";
import * as Brevo from "@getbrevo/brevo";

// Brevo (primary)
const brevoApiInstance = new Brevo.TransactionalEmailsApi();
brevoApiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY || "");

// Resend (backup)
const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@example.com";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "SaltNet";
const API_HOST = process.env.API_HOST || "http://localhost:3000/";

// Extract email address from "Name <email>" format
function parseFromEmail(from: string): { name: string; email: string } {
    const match = from.match(/^(.+?)\s*<(.+?)>$/);
    if (match) {
        return { name: match[1].trim(), email: match[2].trim() };
    }
    return { name: EMAIL_FROM_NAME, email: from };
}

async function sendEmailWithBrevo(to: string, subject: string, html: string): Promise<boolean> {
    try {
        const { name, email } = parseFromEmail(EMAIL_FROM);
        const sendSmtpEmail = new Brevo.SendSmtpEmail();
        sendSmtpEmail.sender = { name, email };
        sendSmtpEmail.to = [{ email: to }];
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = html;

        await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`[Brevo] Email sent to ${to}`);
        return true;
    } catch (error) {
        console.error("[Brevo] Failed to send email:", error);
        return false;
    }
}

async function sendEmailWithResend(to: string, subject: string, html: string): Promise<boolean> {
    try {
        await resend.emails.send({
            from: EMAIL_FROM,
            to,
            subject,
            html,
        });
        console.log(`[Resend] Email sent to ${to}`);
        return true;
    } catch (error) {
        console.error("[Resend] Failed to send email:", error);
        return false;
    }
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    // Try Brevo first, fallback to Resend
    const brevoSuccess = await sendEmailWithBrevo(to, subject, html);
    if (!brevoSuccess) {
        console.log("[Email] Brevo failed, trying Resend as backup...");
        const resendSuccess = await sendEmailWithResend(to, subject, html);
        if (!resendSuccess) {
            throw new Error("All email providers failed");
        }
    }
}

export async function sendVerificationEmail(email: string, token: string) {
    const verificationUrl = `${API_HOST}api/v0/user/verify-email?token=${token}`;

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Email Verification</h2>
            <p>Please click the button below to verify your email address:</p>
            <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">Verify Email</a>
            <p style="margin-top: 20px; color: #666;">This link will expire in 24 hours.</p>
            <p style="color: #666;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
    `;

    await sendEmail(email, "Verify your email - SaltNet", html);
}

export async function sendPasswordResetEmail(email: string, token: string) {
    const resetUrl = `${API_HOST}api/v0/user/reset-password?token=${token}`;

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset</h2>
            <p>Please click the button below to reset your password:</p>
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a>
            <p style="margin-top: 20px; color: #666;">This link will expire in 1 hour.</p>
            <p style="color: #666;">If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
    `;

    await sendEmail(email, "Reset your password - SaltNet", html);
}
