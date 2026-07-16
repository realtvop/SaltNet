const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001F\u007F]/g;

export interface B50DownloadFilenameOptions {
    modeLabel?: string | null;
    playerName?: string | null;
    timestamp?: Date;
}

export function createB50DownloadFilename({
    modeLabel,
    playerName,
    timestamp = new Date(),
}: B50DownloadFilenameOptions): string {
    const prefix = sanitizeFilenamePart(modeLabel, "B50", 32);
    const player = sanitizeFilenamePart(playerName, "player", 80);
    return `${prefix}_SaltNet_${player}_${formatTimestamp(timestamp)}.png`;
}

export function sanitizeFilenamePart(
    value: string | null | undefined,
    fallback: string,
    maxLength: number
): string {
    const sanitized = (value ?? "")
        .replace(INVALID_FILENAME_CHARACTERS, "_")
        .replace(/\s+/g, " ")
        .replace(/[. ]+$/g, "")
        .trim();
    const shortened = Array.from(sanitized).slice(0, maxLength).join("");
    return shortened || fallback;
}

function formatTimestamp(date: Date): string {
    const pad = (value: number) => value.toString().padStart(2, "0");
    const datePart = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
    const timePart = [pad(date.getHours()), pad(date.getMinutes())].join("-");
    return `${datePart}_${timePart}`;
}
