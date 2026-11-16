import type { UserDataBackupV1 } from "@core/user/backup";
import type { ScoreHistoryEventV1 } from "@core/user/scoreHistory/type";
import type { User } from "@core/user/type";
import { encodeUserDataBackup } from "@core/user/backup";
import localForage from "localforage";
import {
    activateStagedScoreHistoryImport,
    exportScoreHistoryEvents,
    getPendingScoreHistoryImport,
    stageScoreHistoryImport,
} from "./repository";

export type { DecodedUserDataBackup } from "@core/user/backup";
export { decodeUserDataBackup } from "@core/user/backup";

export async function createUserDataBackup(users: User[]): Promise<UserDataBackupV1> {
    const events = await exportScoreHistoryEvents();
    return encodeUserDataBackup(users, events, Date.now());
}

export async function replaceImportedUserData(
    users: User[],
    events: ScoreHistoryEventV1[]
): Promise<void> {
    const usersJson = JSON.stringify(users);
    const pending = await stageScoreHistoryImport(events, usersJson);
    await localForage.setItem("users", users);
    await activateStagedScoreHistoryImport(pending.generationId);
}

export async function recoverPendingUserDataImport(): Promise<void> {
    const pending = await getPendingScoreHistoryImport();
    if (!pending) return;
    const users = JSON.parse(pending.usersJson) as User[];
    await localForage.setItem("users", users);
    await activateStagedScoreHistoryImport(pending.generationId);
}
