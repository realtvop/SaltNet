import type {
    DivingFishB50,
    DivingFishFullRecord,
} from "@/components/integrations/diving-fish/type";
import type { DetailedData } from "..";
import { getSaltNetMusicIdForChartType } from "../../music/saltmeta";

function getRecordKey(record: DivingFishFullRecord): string {
    const musicId = getSaltNetMusicIdForChartType(record.song_id, record.type);
    return `${musicId}-${record.level_index}`;
}

function migrateRecord(
    existing: DetailedData | undefined,
    incoming: DivingFishFullRecord
): DivingFishFullRecord {
    if (!existing) return incoming;
    const existingRecord = existing[getRecordKey(incoming)];
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

export function supplementRecordList(
    incomingList: DivingFishFullRecord[],
    supplement: DivingFishFullRecord[]
): DivingFishFullRecord[] {
    const supplementMap: DetailedData = {};
    for (const s of supplement) {
        supplementMap[getRecordKey(s)] = s;
    }
    return incomingList.map(incoming => {
        const key = getRecordKey(incoming);
        const sup = supplementMap[key];
        if (!sup) return incoming;
        return {
            achievements: incoming.achievements,
            ds: incoming.ds || sup.ds,
            dxScore: incoming.dxScore,
            fc: incoming.fc || sup.fc,
            fs: incoming.fs || sup.fs,
            level: incoming.level,
            level_index: incoming.level_index,
            level_label: incoming.level_label,
            play_count: incoming.play_count || sup.play_count,
            ra: incoming.ra,
            rate: incoming.rate,
            song_id: incoming.song_id,
            title: incoming.title,
            type: incoming.type,
        };
    });
}

export function supplementB50(
    b50: DivingFishB50,
    supplement: DivingFishFullRecord[]
): DivingFishB50 {
    return {
        dx: supplementRecordList(b50.dx, supplement),
        sd: supplementRecordList(b50.sd, supplement),
    };
}

export function migrateB50(existing: DetailedData | undefined, b50: DivingFishB50): DivingFishB50 {
    if (!existing) return b50;
    return {
        dx: migrateRecordList(existing, b50.dx),
        sd: migrateRecordList(existing, b50.sd),
    };
}
