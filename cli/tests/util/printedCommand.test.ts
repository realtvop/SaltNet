import { describe, expect, it } from "vitest";
import {
    dfNameBindCommand,
    fileWord,
    optionWords,
    userBindCommand,
    userOptionWords,
    userRefWord,
} from "../../src/util/printedCommand";
import { joinCommandLine } from "../../src/util/shell";
import { parsePrintedCommand } from "../printedCommand";

const DEFAULT = { index: 0, uid: "-default user" };
const PLAIN = { index: 1, uid: "plain-user" };
const DASH = { index: 2, uid: "-dash user" };

function sync(words: readonly string[]) {
    return parsePrintedCommand(joinCommandLine(["saltnet", "sync", ...words]));
}

describe("printed command words", () => {
    it("names the default user 0 and every other user by its uid", () => {
        expect(userRefWord(DEFAULT)).toBe("0");
        expect(userRefWord(PLAIN)).toBe("plain-user");
        expect(userRefWord(DASH)).toBe("-dash user");
    });

    it("selects a user with --user in a form the parser reads as a value", () => {
        expect(userOptionWords(DEFAULT)).toEqual([]);
        expect(userOptionWords(PLAIN)).toEqual(["--user", "plain-user"]);
        expect(userOptionWords(DASH)).toEqual(["--user=-dash user"]);
        expect(userOptionWords(DEFAULT, true)).toEqual(["--user=-default user"]);
        expect(userOptionWords(PLAIN, true)).toEqual(["--user", "plain-user"]);

        expect(sync(userOptionWords(DEFAULT)).options.user).toBeUndefined();
        expect(sync(userOptionWords(PLAIN)).options.user).toBe("plain-user");
        expect(sync(userOptionWords(DASH)).options.user).toBe("-dash user");
        expect(sync(userOptionWords(DEFAULT, true)).options.user).toBe("-default user");
        expect(sync([...userOptionWords(DASH), ...optionWords("--source", "lxns")])).toMatchObject({
            command: "sync",
            options: { user: "-dash user", source: "lxns" },
        });
        expect(joinCommandLine(["saltnet", "sync", ...userOptionWords(DASH)])).toBe(
            "saltnet sync '--user=-dash user'"
        );
    });

    it("writes a file name that starts with - as a path the parser reads as a value", () => {
        expect(fileWord("-backup.json")).toBe("./-backup.json");
        expect(fileWord("backup.json")).toBe("backup.json");
        expect(fileWord("/tmp/-backup.json")).toBe("/tmp/-backup.json");
        expect(
            parsePrintedCommand(
                joinCommandLine(["saltnet", "export", fileWord("-backup.json"), "--overwrite"])
            )
        ).toMatchObject({
            command: "export",
            positionals: { file: "./-backup.json" },
            options: { overwrite: true },
        });
    });

    it("keeps the options of user bind before -- for a user that starts with -", () => {
        expect(userBindCommand("u2", "lxns")).toBe("saltnet user bind u2 lxns");
        expect(userBindCommand("u2", "ingame", [], ["--qr", "-"])).toBe(
            "saltnet user bind u2 ingame --qr -"
        );
        expect(userBindCommand("-dash user", "ingame", [], ["--qr", "-"])).toBe(
            "saltnet user bind --qr - -- '-dash user' ingame"
        );
        expect(dfNameBindCommand("0")).toBe("saltnet user bind 0 df-name <水鱼用户名>");
    });

    it.each(["0", "plain-user", "-dash user", "--", "-1"])(
        "binds every kind for the user %j as printed",
        user => {
            expect(parsePrintedCommand(userBindCommand(user, "lxns"))).toMatchObject({
                command: "user bind",
                positionals: { user, source: "lxns" },
            });
            expect(parsePrintedCommand(userBindCommand(user, "df-token", ["-"]))).toMatchObject({
                command: "user bind",
                positionals: { user, source: "df-token", value: "-" },
            });
            expect(
                parsePrintedCommand(userBindCommand(user, "ingame", [], ["--qr", "-"]))
            ).toMatchObject({
                command: "user bind",
                positionals: { user, source: "ingame" },
                options: { qr: "-" },
            });
            expect(parsePrintedCommand(dfNameBindCommand(user))).toMatchObject({
                command: "user bind",
                positionals: { user, source: "df-name", value: "<水鱼用户名>" },
            });
        }
    );
});
