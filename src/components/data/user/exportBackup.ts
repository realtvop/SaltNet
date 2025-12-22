import type { DivingFishFullRecord } from "@/components/integrations/diving-fish/type";
import { getUserDisplayName, type User } from "./type";
import { snackbar } from "mdui";
import { ComboStatus, RankRate, SyncStatus } from "../maiTypes";

export function exportUserBackup(user: User) {
    if (!user.inGame.id) return snackbar({ message: "你怎么进来的！", autoCloseDelay: 2000 });
    if (!user.data.updateTime)
        return snackbar({ message: "用户数据未更新，无法导出备份", autoCloseDelay: 2000 });

    const userMusicDetailList = [];
    if (user.data.detailed) {
        const detailed = user.data.detailed as Record<string, DivingFishFullRecord>;
        for (const music of Object.values(detailed)) {
            userMusicDetailList.push({
                musicId: music.song_id,
                level: music.level_index,
                playCount: music.play_count ?? 0,
                achievement: music.achievements * 1e4,
                comboStatus: [
                    ComboStatus.None,
                    ComboStatus.FullCombo,
                    ComboStatus.FullComboPlus,
                    ComboStatus.AllPerfect,
                    ComboStatus.AllPerfectPlus,
                ].indexOf(music.fc),
                syncStatus: [
                    SyncStatus.None,
                    SyncStatus.FullSync,
                    SyncStatus.FullSyncPlus,
                    SyncStatus.FullSyncDX,
                    SyncStatus.FullSyncDXPlus,
                    SyncStatus.Sync,
                ].indexOf(music.fs),
                deluxscoreMax: music.dxScore,
                scoreRank: [
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
                ].indexOf(music.rate),
                extNum1: music.achievements === 101 ? 1 : 0, // TODO
                extNum2: 0,
            });
        }
    }

    const userItemList = [];
    if (user.data.items) {
        for (const itemSetIndex in user.data.items) {
            for (const item of user.data.items[itemSetIndex]) {
                userItemList.push({
                    itemKind: itemSetIndex,
                    itemId: item.itemId,
                    stock: item.stock,
                    isValid: item.isValid,
                });
            }
        }
    }

    const userCharacterList = [];
    if (user.data.characters) {
        for (const char of user.data.characters) {
            userCharacterList.push({
                chatacterId: char.characterId,
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
    a.download = `SaltNet_游戏内数据备份_${userBackup.userName}_${getCurrentTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function getCurrentTime() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
