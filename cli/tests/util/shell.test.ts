import { describe, expect, it } from "vitest";
import { joinCommandLine, quoteArg, splitCommandLine } from "../../src/util/shell";

describe("splitCommandLine", () => {
    it("splits on whitespace", () => {
        expect(splitCommandLine("charts --level 15  --diff rem")).toEqual([
            "charts",
            "--level",
            "15",
            "--diff",
            "rem",
        ]);
        expect(splitCommandLine("  a\tb\nc ")).toEqual(["a", "b", "c"]);
        expect(splitCommandLine("")).toEqual([]);
        expect(splitCommandLine("   ")).toEqual([]);
    });

    it("keeps single-quoted text as it is", () => {
        expect(splitCommandLine("song 'two words' x")).toEqual(["song", "two words", "x"]);
        expect(splitCommandLine("'a\\b' '$HOME'")).toEqual(["a\\b", "$HOME"]);
        expect(splitCommandLine("a'b'c")).toEqual(["abc"]);
    });

    it("handles double quotes and their escapes", () => {
        expect(splitCommandLine('song "two words"')).toEqual(["song", "two words"]);
        expect(splitCommandLine('"say \\"hi\\""')).toEqual(['say "hi"']);
        expect(splitCommandLine('"a\\nb"')).toEqual(["a\\nb"]);
        expect(splitCommandLine('"it\'s"')).toEqual(["it's"]);
    });

    it("keeps an empty quoted word", () => {
        expect(splitCommandLine("a '' b")).toEqual(["a", "", "b"]);
        expect(splitCommandLine('a ""')).toEqual(["a", ""]);
    });

    it("lets a backslash escape the next character", () => {
        expect(splitCommandLine("a\\ b c")).toEqual(["a b", "c"]);
        expect(splitCommandLine("\\-x")).toEqual(["-x"]);
    });

    it("keeps Chinese text", () => {
        expect(splitCommandLine("charts --plate 熊極 --missing")).toEqual([
            "charts",
            "--plate",
            "熊極",
            "--missing",
        ]);
    });

    it("rejects an unterminated quote or a trailing backslash", () => {
        expect(() => splitCommandLine("a 'b")).toThrow("unterminated quote");
        expect(() => splitCommandLine('a "b')).toThrow("unterminated quote");
        expect(() => splitCommandLine("a\\")).toThrow("backslash");
    });
});

describe("command-line quoting", () => {
    it("leaves the documented safe characters unquoted", () => {
        expect(quoteArg("中文_Az09./:=@%+,-")).toBe("中文_Az09./:=@%+,-");
        expect(quoteArg("-option")).toBe("-option");
    });

    it("round-trips awkward words through the splitter", () => {
        const words = [
            "two words",
            `both 'single' and "double"`,
            "back\\slash",
            "$HOME",
            "`command`",
            "line one\nline two",
            "",
            "中文文字",
            "-starts-with-dash",
        ];
        expect(splitCommandLine(joinCommandLine(words))).toEqual(words);
    });

    it.each([
        "$HOME",
        "a*",
        "a?",
        "~",
        "~user",
        "[ab]",
        "{a,b}",
        "`x`",
        "!",
        "a;b",
        "a&b",
        "a|b",
        "a<b",
        "a>b",
        "(a)",
        "#a",
        "a b",
        "a\tb",
        "^a",
        "a\\b",
        '"a"',
        "'a'",
    ])("quotes %j, which a shell would read differently", word => {
        expect(quoteArg(word)).toMatch(/^'.*'$/s);
        expect(splitCommandLine(quoteArg(word))).toEqual([word]);
    });
});
