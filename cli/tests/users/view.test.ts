import type { UserCredentials } from "../../src/runtime/credentials";
import { describe, expect, it } from "vitest";
import { userCredentialState } from "../../src/users/view";

const DAY = 24 * 60 * 60 * 1000;
const SETTINGS = { refreshTokenDays: 30, expiringWarnDays: 3 };
const NOW = new Date("2026-11-20T04:00:00Z");

function lxnsEntry(issuedAt: number): UserCredentials {
    return {
        lxnsAccountId: 1001,
        lxnsIssuedAt: issuedAt,
        lxnsAuthorization: {
            accessToken: "FAKE-LXNS-ACCESS-0001",
            refreshToken: "FAKE-LXNS-REFRESH-0001",
            tokenType: "Bearer",
            expiresAt: NOW.getTime() + DAY,
        },
    };
}

function lxnsStateIssuedAt(issuedAt: number) {
    return userCredentialState(lxnsEntry(issuedAt), 1001, NOW, SETTINGS).lxns;
}

describe("userCredentialState", () => {
    it("counts a refresh token as expired from the very moment it runs out", () => {
        expect(lxnsStateIssuedAt(NOW.getTime() - 30 * DAY)).toBe("expired");
        expect(lxnsStateIssuedAt(NOW.getTime() - 30 * DAY + 1)).toBe("expiring");
    });

    it("warns only when less than the warning period is left", () => {
        // The refresh token runs out exactly three days from now: not yet expiring.
        expect(lxnsStateIssuedAt(NOW.getTime() - 27 * DAY)).toBe("valid");
        expect(lxnsStateIssuedAt(NOW.getTime() - 27 * DAY - 1)).toBe("expiring");
    });
});
