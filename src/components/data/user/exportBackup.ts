import type { DivingFishFullRecord } from "@/components/integrations/diving-fish/type";
import { getUserDisplayName, type User } from "./type";
import { snackbar } from "mdui";
import { ComboStatus, RankRate, SyncStatus } from "../maiTypes";

interface BackupMusicDetail {
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

interface BackupItem {
    itemKind: number;
    itemId: number;
    stock: 0 | 1;
    isValid: boolean;
}

interface BackupCharacter {
    characterId: number;
    point: number;
    level: number;
    awakening: number;
    useCount: number;
}

const COMBO_STATUS_ORDER = [
    ComboStatus.None,
    ComboStatus.FullCombo,
    ComboStatus.FullComboPlus,
    ComboStatus.AllPerfect,
    ComboStatus.AllPerfectPlus,
] as const;

const SYNC_STATUS_ORDER = [
    SyncStatus.None,
    SyncStatus.Sync,
    SyncStatus.FullSync,
    SyncStatus.FullSyncPlus,
    SyncStatus.FullSyncDX,
    SyncStatus.FullSyncDXPlus,
] as const;

const SCORE_RANK_ORDER = [
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

export function exportUserBackup(user: User) {
    if (!user.inGame.id) return snackbar({ message: "你怎么进来的！", autoCloseDelay: 2000 });
    if (!user.data.updateTime)
        return snackbar({ message: "用户数据未更新，无法导出备份", autoCloseDelay: 2000 });
    if (!user.data.detailed || !Object.keys(user.data.detailed).length)
        return snackbar({ message: "缺少完整成绩数据，无法导出备份", autoCloseDelay: 2000 });

    const userMusicDetailList: BackupMusicDetail[] = [];
    const detailed = user.data.detailed as Record<string, DivingFishFullRecord>;
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

    const userBackup = {
        userName: user.inGame.name ?? getUserDisplayName(user),
        userRating: user.data.rating ?? null,
        userMusicDetailList,
        userItemList,
        userCharacterList,
    };

    const blob = new Blob([JSON.stringify(userBackup, null, 2)], {
        type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SaltNet_游戏内数据备份_${sanitizeFileName(userBackup.userName)}_${getCurrentTime()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getIndexOrDefault<T>(order: readonly T[], value: T, fallback = 0) {
    const index = order.indexOf(value);
    return index === -1 ? fallback : index;
}

function sanitizeFileName(fileName: string) {
    return fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "unknown";
}

function getCurrentTime() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}
