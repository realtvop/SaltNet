/**
 * Splits a command line into words the way a POSIX shell would, without expanding anything:
 * whitespace separates words, single quotes are literal, double quotes allow a backslash before
 * `"`, `\`, `$` and a backtick, and a backslash elsewhere escapes the next character. It exists
 * so the examples written in the registry can be checked against the parser.
 */
export function splitCommandLine(line: string): string[] {
    const words: string[] = [];
    let current = "";
    let inWord = false;
    let quote: "'" | '"' | undefined;

    for (let index = 0; index < line.length; index++) {
        const char = line[index];

        if (quote === "'") {
            if (char === "'") quote = undefined;
            else current += char;
            continue;
        }

        if (quote === '"') {
            if (char === '"') {
                quote = undefined;
            } else if (char === "\\" && '"\\$`'.includes(line[index + 1] ?? "")) {
                current += line[index + 1];
                index++;
            } else {
                current += char;
            }
            continue;
        }

        if (char === "'" || char === '"') {
            quote = char;
            inWord = true;
        } else if (char === "\\") {
            if (index + 1 >= line.length) throw new Error("the command line ends with a backslash");
            current += line[index + 1];
            index++;
            inWord = true;
        } else if (/\s/.test(char)) {
            if (inWord) words.push(current);
            current = "";
            inWord = false;
        } else {
            current += char;
            inWord = true;
        }
    }

    if (quote) throw new Error("the command line has an unterminated quote");
    if (inWord) words.push(current);
    return words;
}
