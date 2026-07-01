export type B50ModeLabel = "B50" | "拟合 B50" | "AP50" | "FC50" | "牛逼 50" | string;

export interface B50RenderChart {
    songId: number;
    title: string;
    type: "SD" | "DX" | string;
    levelIndex: number;
    ds: number;
    achievements: number | null;
    fc: string;
    fs: string;
    rate: string;
    ra: number;
    deluxeScore?: number;
    deluxeScoreMax?: number;
}

export interface B50RenderPayload {
    playerName: string;
    playerSecondaryName?: string | null;
    playerRating?: number | null;
    modeLabel?: B50ModeLabel | null;
    showDxScore: boolean;
    sd: B50RenderChart[];
    dx: B50RenderChart[];
}

export function parseB50Payload(value: unknown): B50RenderPayload {
    if (!isRecord(value)) throw new Error("Payload must be an object");

    const playerName = readString(value.playerName, "playerName", 64);
    const playerSecondaryName =
        value.playerSecondaryName == null
            ? null
            : readOptionalDisplayString(value.playerSecondaryName, "playerSecondaryName", 64);
    const playerRating =
        value.playerRating == null ? null : readFiniteNumber(value.playerRating, "playerRating");
    const modeLabel =
        value.modeLabel == null
            ? null
            : readOptionalDisplayString(value.modeLabel, "modeLabel", 24);
    const showDxScore = Boolean(value.showDxScore);
    const sd = readCharts(value.sd, "sd", 35);
    const dx = readCharts(value.dx, "dx", 15);

    if (sd.length + dx.length === 0) {
        throw new Error("Payload must include at least one chart");
    }

    return {
        playerName,
        playerSecondaryName,
        playerRating,
        modeLabel,
        showDxScore,
        sd,
        dx,
    };
}

function readCharts(value: unknown, field: string, limit: number): B50RenderChart[] {
    if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
    if (value.length > limit) throw new Error(`${field} must contain at most ${limit} charts`);
    return value.map((item, index) => readChart(item, `${field}[${index}]`));
}

function readChart(value: unknown, field: string): B50RenderChart {
    if (!isRecord(value)) throw new Error(`${field} must be an object`);

    return {
        songId: readInteger(value.songId, `${field}.songId`),
        title: readString(value.title, `${field}.title`, 120),
        type: readString(value.type, `${field}.type`, 8),
        levelIndex: readInteger(value.levelIndex, `${field}.levelIndex`),
        ds: readFiniteNumber(value.ds, `${field}.ds`),
        achievements:
            value.achievements == null
                ? null
                : readFiniteNumber(value.achievements, `${field}.achievements`),
        fc: value.fc == null ? "" : readOptionalString(value.fc, `${field}.fc`, 8),
        fs: value.fs == null ? "" : readOptionalString(value.fs, `${field}.fs`, 8),
        rate: value.rate == null ? "" : readOptionalString(value.rate, `${field}.rate`, 8),
        ra: readFiniteNumber(value.ra, `${field}.ra`),
        deluxeScore:
            value.deluxeScore == null
                ? undefined
                : readFiniteNumber(value.deluxeScore, `${field}.deluxeScore`),
        deluxeScoreMax:
            value.deluxeScoreMax == null
                ? undefined
                : readFiniteNumber(value.deluxeScoreMax, `${field}.deluxeScoreMax`),
    };
}

function readString(value: unknown, field: string, maxLength: number): string {
    if (typeof value !== "string") throw new Error(`${field} must be a string`);
    const trimmed = value.trim();
    if (!trimmed) throw new Error(`${field} cannot be empty`);
    if (trimmed.length > maxLength) throw new Error(`${field} is too long`);
    return trimmed;
}

function readOptionalString(value: unknown, field: string, maxLength: number): string {
    if (typeof value !== "string") throw new Error(`${field} must be a string`);
    const trimmed = value.trim();
    if (trimmed.length > maxLength) throw new Error(`${field} is too long`);
    return trimmed;
}

function readOptionalDisplayString(
    value: unknown,
    field: string,
    maxLength: number
): string | null {
    const trimmed = readOptionalString(value, field, maxLength);
    return trimmed || null;
}

function readFiniteNumber(value: unknown, field: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${field} must be a finite number`);
    }
    return value;
}

function readInteger(value: unknown, field: string): number {
    const number = readFiniteNumber(value, field);
    if (!Number.isInteger(number)) throw new Error(`${field} must be an integer`);
    return number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
