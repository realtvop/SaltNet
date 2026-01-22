import type {
    DivingFishB50,
    DivingFishFullRecord,
} from "@/components/integrations/diving-fish/type";
import type { DetailedData } from "..";

function migrateRecord(
    existing: DetailedData | undefined,
    incoming: DivingFishFullRecord
): DivingFishFullRecord {
    if (!existing) return incoming;
    const existingRecord = existing[`${incoming.song_id}-${incoming.level_index}`];
    if (!existingRecord) return incoming;

    return {
        achievements: incoming.achievements,
        ds: incoming.ds,
        dxScore: incoming.dxScore,
        fc: incoming.fc || existingRecord?.fc,
        fs: incoming.fs || existingRecord?.fs,
        level: incoming.level,
        level_index: incoming.level_index,
        level_label: incoming.level_label,
        play_count: incoming.play_count || existingRecord?.play_count,
        ra: incoming.ra,
        rate: incoming.rate,
        song_id: incoming.song_id,
        title: incoming.title,
        type: incoming.type,
    };
}

export function migrateRecordList(
    existing: DetailedData | undefined,
    incomingList: DivingFishFullRecord[]
): DivingFishFullRecord[] {
    return incomingList.map(incoming => migrateRecord(existing, incoming));
}

export function migrateB50(existing: DetailedData | undefined, b50: DivingFishB50): DivingFishB50 {
    if (!existing) return b50;
    return {
        dx: migrateRecordList(existing, b50.dx),
        sd: migrateRecordList(existing, b50.sd),
    };
}
