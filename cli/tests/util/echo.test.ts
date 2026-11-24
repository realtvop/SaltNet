import { describe, expect, it } from "vitest";
import { echo } from "../../src/util/echo";

describe("echo", () => {
    it("quotes a short plain word so a mistake is easy to spot", () => {
        expect(echo("mas")).toBe("「mas」");
        expect(echo("Re:MASTER")).toBe("「Re:MASTER」");
        expect(echo("b50.rating")).toBe("「b50.rating」");
        expect(echo("13+")).toBe("「13+」");
        expect(echo("a-b_c")).toBe("「a-b_c」");
    });

    it("quotes Chinese and other letters", () => {
        expect(echo("熊華極")).toBe("「熊華極」");
        expect(echo("ゆめゆめ")).toBe("「ゆめゆめ」");
    });

    it("keeps anything that is not a plain word out of the message", () => {
        for (const raw of [
            "",
            "two words",
            'say "hi"',
            "a/b",
            "a=b",
            "token=abc",
            "a,b",
            "a\nb",
            "a\tb",
            "a'b",
            "(x)",
        ]) {
            expect(echo(raw)).toBe("");
        }
    });

    it("stops at 40 characters, because a longer value could be a pasted secret", () => {
        expect(echo("x".repeat(40))).toBe(`「${"x".repeat(40)}」`);
        expect(echo("x".repeat(41))).toBe("");
        expect(echo("SGWCMAID".concat("abcdef0123456789".repeat(5)))).toBe("");
    });
});
