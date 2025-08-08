import { ComboStatus, RankRate, SyncStatus } from "../maiTypes";
import type { ChartScore } from "../music/type";
import type { VersionPlate } from "./type";

export function checkChartFinish(plate: VersionPlate, score: ChartScore): boolean {
    if (plate.condition === ComboStatus.FullCombo)
        return [
            ComboStatus.FullCombo,
            ComboStatus.FullComboPlus,
            ComboStatus.AllPerfect,
            ComboStatus.AllPerfectPlus,
        ].includes(score.comboStatus);
    if (plate.condition === RankRate.sss)
        return [RankRate.sss, RankRate.sssp].includes(score.rankRate);
    if (plate.condition === ComboStatus.AllPerfect)
        return [ComboStatus.AllPerfect, ComboStatus.AllPerfectPlus].includes(score.comboStatus);
    if (plate.condition === SyncStatus.FullSyncDX)
        return [SyncStatus.FullSyncDX, SyncStatus.FullSyncDXPlus].includes(score.syncStatus);
    return false;
}
