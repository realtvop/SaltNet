import { describe, expect, it } from "vitest";
import { normalizeQrCodeFromInput } from "./qrCode";

describe("normalizeQrCodeFromInput", () => {
    const code64 = "1234567890123456789012345678901234567890123456789012345678901234";

    it("handles empty or whitespace-only input", () => {
        expect(normalizeQrCodeFromInput(undefined)).toBeNull();
        expect(normalizeQrCodeFromInput("")).toBeNull();
        expect(normalizeQrCodeFromInput("   \n\t  ")).toBeNull();
    });

    it("trims surrounding whitespace from input", () => {
        expect(normalizeQrCodeFromInput(`  \t ${code64} \n `)).toBe(code64);
    });

    it("handles SGWCMAID prefix at and above 64 characters", () => {
        // Exactly 64 chars starting with SGWCMAID
        const exact64 = `SGWCMAID${"A".repeat(56)}`;
        expect(normalizeQrCodeFromInput(exact64)).toBe(exact64);

        // More than 64 chars: returns last 64 characters
        const longCode = `SGWCMAID_EXTRA_HEADER_${code64}`;
        expect(normalizeQrCodeFromInput(longCode)).toBe(code64);
    });

    it("handles SGWCMAID prefix below 64 characters", () => {
        const shortWithPrefix = "SGWCMAID_SHORT_1234";
        expect(normalizeQrCodeFromInput(shortWithPrefix)).toBeNull();
    });

    it("handles http links with MAID pattern", () => {
        const urlWithMaid = `https://tgk-wcaime.wahlap.com/net/maid/qr?code=MAID${code64}`;
        expect(normalizeQrCodeFromInput(urlWithMaid)).toBe(code64);

        const httpUrlWithMaid = `http://example.com/scan?data=MAID_${code64}`;
        expect(normalizeQrCodeFromInput(httpUrlWithMaid)).toBe(code64);
    });

    it("handles http and https links with text after the code", () => {
        expect(
            normalizeQrCodeFromInput(`http://example.com/q?MAID${code64}${"Z".repeat(20)}`)
        ).toBe("3456789012345678901234567890123456789012345678901234ZZZZZZZZZZZZ");
        expect(
            normalizeQrCodeFromInput(`https://example.com/q?MAID${code64}${"Z".repeat(20)}`)
        ).toBe("3456789012345678901234567890123456789012345678901234ZZZZZZZZZZZZ");
    });

    it("handles http links without MAID pattern", () => {
        const urlWithoutMaid = "https://example.com/net/auth/qrcode?id=12345678";
        expect(normalizeQrCodeFromInput(urlWithoutMaid)).toBeNull();
    });

    it("handles plain text at and above 64 characters", () => {
        expect(normalizeQrCodeFromInput(code64)).toBe(code64);

        const text80 = `1234567890123456${code64}`;
        expect(normalizeQrCodeFromInput(text80)).toBe(code64);
    });

    it("handles plain text below 64 characters", () => {
        expect(normalizeQrCodeFromInput("A".repeat(63))).toBeNull();
        expect(normalizeQrCodeFromInput("short-text")).toBeNull();
    });
});
