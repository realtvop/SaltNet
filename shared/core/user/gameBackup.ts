import type { DivingFishFullRecord } from "../integrations/diving-fish/type";
import type { User } from "./type";
import { ComboStatus, RankRate, SyncStatus } from "../mai/types";
import { getUserDisplayName } from "./type";

export interface BackupMusicDetail {
    musicId: number;
    level: number;
    playCount: number;
    achievement: number;
    comboStatus: number;
    syncStatus: number;
    deluxscoreMax: number;
    scoreRank: number;
    extNum1: number;
    extNum2: number;
}

export interface BackupItem {
    itemKind: number;
    itemId: number;
    stock: 0 | 1;
    isValid: boolean;
}

export interface BackupCharacter {
    characterId: number;
    point: number;
    level: number;
    awakening: number;
    useCount: number;
}

export interface GameBackup {
    userName: string;
    userRating: number | null;
    userMusicDetailList: BackupMusicDetail[];
    userItemList: BackupItem[];
    userCharacterList: BackupCharacter[];
}

export const COMBO_STATUS_ORDER = [
    ComboStatus.None,
    ComboStatus.FullCombo,
    ComboStatus.FullComboPlus,
    ComboStatus.AllPerfect,
    ComboStatus.AllPerfectPlus,
] as const;

export const SYNC_STATUS_ORDER = [
    SyncStatus.None,
    SyncStatus.Sync,
    SyncStatus.FullSync,
    SyncStatus.FullSyncPlus,
    SyncStatus.FullSyncDX,
    SyncStatus.FullSyncDXPlus,
] as const;

export const SCORE_RANK_ORDER = [
    RankRate.d,
    RankRate.c,
    RankRate.b,
    RankRate.bb,
    RankRate.bbb,
    RankRate.a,
    RankRate.aa,
    RankRate.aaa,
    RankRate.s,
    RankRate.sp,
    RankRate.ss,
    RankRate.ssp,
    RankRate.sss,
    RankRate.sssp,
] as const;

export function getIndexOrDefault<T>(order: readonly T[], value: T, fallback = 0) {
    const index = order.indexOf(value);
    return index === -1 ? fallback : index;
}

export function buildGameBackup(user: User): GameBackup {
    const userMusicDetailList: BackupMusicDetail[] = [];
    const detailed = (user.data.detailed ?? {}) as Record<string, DivingFishFullRecord>;
    for (const music of Object.values(detailed)) {
        userMusicDetailList.push({
            musicId: music.song_id,
            level: music.level_index,
            playCount: music.play_count ?? 0,
            achievement: Math.round(music.achievements * 1e4),
            comboStatus: getIndexOrDefault(COMBO_STATUS_ORDER, music.fc),
            syncStatus: getIndexOrDefault(SYNC_STATUS_ORDER, music.fs),
            deluxscoreMax: music.dxScore,
            scoreRank: getIndexOrDefault(SCORE_RANK_ORDER, music.rate),
            extNum1: music.achievements === 101 ? 1 : 0, // TODO
            extNum2: 0,
        });
    }

    const userItemList: BackupItem[] = [];
    if (user.data.items) {
        for (const itemSetIndex in user.data.items) {
            for (const item of user.data.items[itemSetIndex]) {
                userItemList.push({
                    itemKind: Number(itemSetIndex),
                    itemId: item.itemId,
                    stock: item.stock,
                    isValid: item.isValid,
                });
            }
        }
    }

    const userCharacterList: BackupCharacter[] = [];
    if (user.data.characters) {
        for (const char of user.data.characters) {
            userCharacterList.push({
                characterId: char.characterId,
                point: char.point,
                level: char.level,
                awakening: char.awakening,
                useCount: char.useCount,
            });
        }
    }

    return {
        userName: user.inGame.name ?? getUserDisplayName(user),
        userRating: user.data.rating ?? null,
        userMusicDetailList,
        userItemList,
        userCharacterList,
    };
}
