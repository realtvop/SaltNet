/** Resolves the user reference described by design 3.1. */
import type { ErrorCandidate } from "../errors";
import type { UserListRow } from "../users/repository";
import { CliError } from "../errors";
import { closestItems } from "../util/closest";
import { echo } from "../util/echo";
import { foldName } from "../util/fold";
import { userUidWord } from "../util/printedCommand";
import { MAX_AMBIGUOUS_ITEMS, MAX_NEAREST_ITEMS } from "./named";

function candidate(user: UserListRow): ErrorCandidate {
    return { ref: userUidWord(user.uid), title: user.displayName };
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

/** uid:<uid> matches only that exact uid. Otherwise use index, uid, then exact or folded name. */
export function resolveUser(users: readonly UserListRow[], text?: string): UserListRow {
    if (text?.startsWith("uid:")) {
        return users.find(user => user.uid === text.slice(4)) ?? notFound(users, text);
    }
    if (users.length === 0) throw new CliError("NO_USER", "还没有任何用户");
    if (text === undefined) {
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
