import { describe, expect, it } from "vitest";
import {
    createB50DownloadFilename,
    sanitizeFilenamePart,
} from "../../shared/rendering/b50-filename";

describe("B50 download filename", () => {
    it("uses a filesystem-safe deterministic timestamp", () => {
        const timestamp = new Date(2026, 6, 16, 15, 7);

        expect(
            createB50DownloadFilename({
                modeLabel: "拟合 B50",
                playerName: "Salt/User:01",
                timestamp,
            })
        ).toBe("拟合 B50_SaltNet_Salt_User_01_2026-07-16_15-07.png");
    });

    it("falls back for blank or unusable filename parts", () => {
        expect(sanitizeFilenamePart("  ...  ", "player", 80)).toBe("player");
        expect(sanitizeFilenamePart("a/b\\c", "player", 80)).toBe("a_b_c");
    });

    it("limits user-controlled filename parts by Unicode characters", () => {
        expect(sanitizeFilenamePart("玩家😀名称", "player", 3)).toBe("玩家😀");
    });
});
