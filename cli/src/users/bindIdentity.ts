import type { User } from "@core/user/type";
import type { CredentialsFile } from "../runtime/credentials";
import type { StagedFile } from "../runtime/files";
import type { RuntimePaths } from "../runtime/paths";
import type { Store } from "../store/store";
import {
    hasStrongIdentityChanged,
    resetUserForNewIdentity,
} from "@core/user/scoreHistory/userIdentity";
import { requireConfirmation } from "../commands/confirm";
import { CliError, usageError } from "../errors";
import {
    lxnsAccountIdOf,
    matchingLxnsAuthorization,
    stageCredentials,
} from "../runtime/credentials";
import { userBindCommand, userUidWord } from "../util/printedCommand";
import { splitCommandLine } from "../util/shell";
import {
    listUsers,
    readUserCounts,
    readUserRemovalFingerprint,
    replaceUserIdentity,
    saveUser,
} from "./repository";
import { userDetail } from "./view";

type IdentitySource = "ingame" | "df-name" | "lxns";

function identityOf(user: User) {
    return {
        inGameId: user.inGame?.id ?? null,
        lxnsId: user.lxns?.id ?? null,
        lxnsName: user.lxns?.name ?? null,
        divingFishName: user.divingFish?.name ?? null,
    };
}

function confirmationArgs(uid: string, source: IdentitySource, user: User): string[] {
    const ref = userUidWord(uid);
    const name = user.divingFish?.name ?? "";
    const words = source === "df-name" ? [name] : [];
    if (source === "df-name" && name.startsWith("-") && !ref.startsWith("-")) {
        words.unshift("--");
    }
    const options = source === "ingame" ? ["--id", String(user.inGame?.id).padStart(8, "0")] : [];
    return splitCommandLine(userBindCommand(ref, source, words, options)).slice(1);
}

export function rejectUnneededConfirmation(given: string | undefined): void {
    if (given !== undefined) {
        throw usageError("此确认码已不适用；请核对目标用户后去掉 --yes 重新运行命令");
    }
}

/** Check the current rows and the intended identity in the caller's transaction. */
export function confirmIdentityChange(
    store: Store,
    uid: string,
    before: User,
    after: User,
    source: IdentitySource,
    given: string | undefined,
    authorizationExpiresAt?: number
): boolean {
    if (!hasStrongIdentityChanged(before, after)) {
        rejectUnneededConfirmation(given);
        return false;
    }

    const row = listUsers(store).find(user => user.uid === uid)!;
    const user = { uid, index: row.index, name: row.displayName };
    const newIdentity = identityOf(after);
    requireConfirmation(given, {
        operation: `user.bind.${source}`,
        target: `user:${uid}`,
        state: {
            user,
            contentFingerprint: readUserRemovalFingerprint(store, uid),
            newIdentity,
            authorizationExpiresAt,
        },
        preview: {
            user,
            before: identityOf(before),
            after: newIdentity,
            counts: { ...readUserCounts(store, uid) },
        },
        summary: `将更换用户「${user.name}」的玩家身份并清空其成绩和历史`,
        confirmArgs: confirmationArgs(uid, source, after),
    });
    return true;
}

function moveCredentials(
    current: CredentialsFile,
    oldUid: string,
    newUid: string,
    user: User
): CredentialsFile {
    const users = { ...current.users };
    const entry = Object.hasOwn(users, oldUid) ? { ...users[oldUid] } : {};
    delete users[oldUid];
    if (matchingLxnsAuthorization(entry, lxnsAccountIdOf(user)) === undefined) {
        delete entry.lxnsAuthorization;
        delete entry.lxnsAccountId;
        delete entry.lxnsIssuedAt;
    }
    const result = {
        ...current,
        users: Object.keys(entry).length > 0 ? { ...users, [newUid]: entry } : users,
    };
    if (current.pendingLxnsAuthorizations !== undefined) {
        result.pendingLxnsAuthorizations = Object.fromEntries(
            Object.entries(current.pendingLxnsAuthorizations).filter(
                ([, pending]) => pending.userUid !== oldUid
            )
        );
    }
    return result;
}

interface Binding {
    user: User;
    changed: boolean;
    reset: boolean;
    userChanged?: boolean;
    credentials?: CredentialsFile;
}

/** The credential lock spans the SQLite commit and the private file's final rename. */
export function writeBinding(
    paths: RuntimePaths,
    store: Store,
    uid: string,
    source: IdentitySource | "df-token",
    prepare: () => Binding
) {
    let staged: StagedFile | undefined;
    try {
        const result = store.transaction(() => {
            const { user, changed, reset, credentials, userChanged = changed } = prepare();
            const nextUser = reset ? resetUserForNewIdentity(user) : user;
            const nextUid = nextUser.uid!;
            if (credentials) {
                const next = reset
                    ? moveCredentials(credentials, uid, nextUid, nextUser)
                    : credentials;
                staged = stageCredentials(paths, next);
            }
            if (reset) replaceUserIdentity(store, uid, nextUser);
            else if (userChanged) saveUser(store, nextUser);

            const row = listUsers(store).find(item => item.uid === nextUid)!;
            return {
                ...userDetail(row, readUserCounts(store, nextUid)),
                source,
                changed,
                ...(reset ? { oldUid: uid, newUid: nextUid } : {}),
            };
        });
        try {
            staged?.commit();
        } catch (error) {
            throw new CliError("INTERNAL", "凭据文件未能更新；请修复文件权限后重试", {
                cause: error,
            });
        }
        return result;
    } finally {
        staged?.discard();
    }
}
