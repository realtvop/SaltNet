/** Resolves the user reference described by design 3.1. */
import type { ErrorCandidate } from "../errors";
import type { UserListRow } from "../users/repository";
import { CliError } from "../errors";
import { closestItems } from "../util/closest";
import { echo } from "../util/echo";
import { foldName } from "../util/fold";
import { MAX_AMBIGUOUS_ITEMS, MAX_NEAREST_ITEMS } from "./named";

function candidate(user: UserListRow): ErrorCandidate {
    return { ref: user.uid, title: user.displayName };
}

function ambiguous(text: string, users: readonly UserListRow[]): never {
    const shown = users.slice(0, MAX_AMBIGUOUS_ITEMS);
    throw new CliError(
        "AMBIGUOUS_REF",
        `${echo(text) || "这个写法"}对应 ${users.length} 个用户；请用候选里的 uid`,
        { candidates: shown.map(candidate) }
    );
}

function notFound(users: readonly UserListRow[], text: string): never {
    const near = closestItems(
        foldName(text),
        users,
        user => [foldName(user.displayName)],
        MAX_NEAREST_ITEMS
    );
    throw new CliError("NOT_FOUND", `找不到用户${echo(text)}`, {
        candidates: near.map(candidate),
    });
}

/** No text selects position 0; text uses index, uid, exact name, then folded exact name. */
export function resolveUser(users: readonly UserListRow[], text?: string): UserListRow {
    if (text === undefined) {
        if (users.length === 0) throw new CliError("NO_USER", "还没有任何用户");
        return users.find(user => user.index === 0) ?? users[0];
    }

    const trimmed = text.trim();
    if (/^\d+$/.test(trimmed)) {
        const index = Number(trimmed);
        return users.find(user => user.index === index) ?? notFound(users, text);
    }

    const byUid = users.filter(user => user.uid === trimmed);
    if (byUid.length === 1) return byUid[0];
    if (byUid.length > 1) return ambiguous(text, byUid);

    const byName = users.filter(user => user.displayName === trimmed);
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) return ambiguous(text, byName);

    const folded = foldName(trimmed);
    const byFoldedName = users.filter(user => foldName(user.displayName) === folded);
    if (byFoldedName.length === 1) return byFoldedName[0];
    if (byFoldedName.length > 1) return ambiguous(text, byFoldedName);
    return notFound(users, text);
}
