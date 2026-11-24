import type { UserListRow } from "../../src/users/repository";
import { describe, expect, it } from "vitest";
import { resolveUser } from "../../src/refs/user";
import { caught } from "../caught";

function user(index: number, uid: string, displayName: string): UserListRow {
    return {
        index,
        uid,
        displayName,
        remark: null,
        divingFishName: null,
        hasLxns: false,
        lxnsId: null,
        lxnsName: null,
        inGameId: null,
        inGameName: null,
        inGameEnabled: false,
        inGameFastUpdate: false,
        manuallyUpdate: false,
        updatedAt: null,
        dataName: null,
        rating: null,
        hasDetailed: false,
        hasB50: false,
        hasItems: false,
        hasCharacters: false,
        hasRatingHistory: false,
    };
}

const users = [
    user(0, "default-uid", "Default"),
    user(1, "alpha-uid", "Alpha"),
    user(2, "wide-uid", "ＡＬＰＨＡ"),
    user(3, "42", "Numeric uid"),
    user(4, "other-uid", "Alpine"),
];

describe("resolveUser", () => {
    it("uses the default user when no text is given", () => {
        expect(resolveUser(users)).toBe(users[0]);
    });

    it("reports NO_USER for every reference when there are no users", () => {
        const error = caught(() => resolveUser([]));
        expect(error.code).toBe("NO_USER");
        expect(error.exitCode).toBe(4);
        expect(caught(() => resolveUser([], "someone")).code).toBe("NO_USER");
    });

    it("reads digits only as an index, including an all-digit uid", () => {
        expect(resolveUser(users, " 2 ")).toBe(users[2]);
        const error = caught(() => resolveUser(users, "42"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.candidates?.some(candidate => candidate.ref === "42")).toBe(false);
    });

    it("reports an index outside the list as NOT_FOUND", () => {
        const error = caught(() => resolveUser(users, "99"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.exitCode).toBe(3);
    });

    it("prefers an exact uid over display names", () => {
        const collision = [user(0, "uid", "Other"), user(1, "other", "uid")];
        expect(resolveUser(collision, "uid")).toBe(collision[0]);
    });

    it("then matches an exact display name", () => {
        expect(resolveUser(users, "Alpha")).toBe(users[1]);
        expect(resolveUser(users, "ＡＬＰＨＡ")).toBe(users[2]);
    });

    it("matches a folded display name and reports ambiguity at that step", () => {
        const error = caught(() => resolveUser(users, "alpha"));
        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(error.candidates).toEqual([
            { ref: "alpha-uid", title: "Alpha" },
            { ref: "wide-uid", title: "ＡＬＰＨＡ" },
        ]);
    });

    it("returns nearest display names with stable uid references", () => {
        const error = caught(() => resolveUser(users, "Alpin"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.candidates?.[0]).toEqual({ ref: "other-uid", title: "Alpine" });
        expect(error.candidates?.map(candidate => candidate.ref)).not.toContain("4");
    });
});
