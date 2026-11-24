/**
 * Words for the commands the CLI prints, mostly as an error's or a warning's `fix`. A printed
 * command must run as printed, and the parser reads a word that starts with `-` as an option, so a
 * uid, a `--user` value or a file name that starts with `-` is written in a form it reads as a value.
 */
import { joinCommandLine } from "./shell";

/** A stored user as printed commands name it. */
export interface UserTarget {
    readonly index: number;
    readonly uid: string;
}

/** A stable uid as a user reference, escaped when it overlaps another reference form. */
export function userUidWord(uid: string): string {
    return /^\d+$/.test(uid) || uid.startsWith("uid:") ? `uid:${uid}` : uid;
}

/** How a printed command names a stored user: `0` for the default user, else its stable uid. */
export function userRefWord(user: UserTarget): string {
    return user.index === 0 ? "0" : userUidWord(user.uid);
}

/** `name value`, or `name=value` when the parser would read the value as an option. */
export function optionWords(name: string, value: string): string[] {
    return value.startsWith("-") ? [`${name}=${value}`] : [name, value];
}

/**
 * The words that select a user with `--user`: none for the default user, unless `pinDefault` asks
 * to name it anyway (a retry should reach the same user even if the default changes meanwhile).
 */
export function userOptionWords(user: UserTarget, pinDefault = false): string[] {
    if (user.index === 0 && !pinDefault) return [];
    return optionWords("--user", userUidWord(user.uid));
}

/** A file name as a positional word: `./<name>` when the parser would read it as an option. */
export function fileWord(file: string): string {
    return file.startsWith("-") ? `./${file}` : file;
}

/**
 * `saltnet user bind <user> <kind> [words…] [options…]`. A user word that starts with `-` must
 * follow `--`, after which nothing is read as an option, so the options move before it.
 */
export function userBindCommand(
    userRef: string,
    kind: string,
    words: readonly string[] = [],
    options: readonly string[] = []
): string {
    return joinCommandLine(
        userRef.startsWith("-")
            ? ["saltnet", "user", "bind", ...options, "--", userRef, kind, ...words]
            : ["saltnet", "user", "bind", userRef, kind, ...words, ...options]
    );
}

/** Binds a Diving Fish name, which the CLI cannot know: the name is left as a placeholder. */
export function dfNameBindCommand(userRef: string): string {
    return `${userBindCommand(userRef, "df-name")} <水鱼用户名>`;
}
