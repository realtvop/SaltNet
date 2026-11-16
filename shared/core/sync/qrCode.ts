export function normalizeQrCodeFromInput(raw?: string): string | null {
    const value = raw?.trim();
    if (!value) return null;
    if (value.startsWith("SGWCMAID") && value.length >= 64) return value.slice(-64);
    if (value.startsWith("http")) {
        const matches = value.match(/MAID.{0,76}/g);
        if (matches?.[0]) return matches[0].slice(-64);
        return null;
    }
    if (value.length >= 64) return value.slice(-64);
    return null;
}
