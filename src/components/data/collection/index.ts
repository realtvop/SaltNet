import {
    type Icon,
    type Plate,
    type Frame,
    type Title,
    type Character,
    CollectionKind,
    TitleColor,
    type VersionPlate,
    type Partner,
} from "@/components/data/collection/type";
import collections from "./collections.json";
import additionalCollections from "./additionalCollections.json";
import { ComboStatus, RankRate, SyncStatus } from "../maiTypes";
import { reactive } from "vue";
import type { MusicMetadataState, SavedMusicList } from "@/components/data/music/type";

type VersionPlateCategory = "極" | "将" | "神" | "舞舞";

type VersionPlateGroup = MusicMetadataState["cnVersions"][number] & {
    versionNames: string[];
};

type VersionPlateDraft = {
    group: VersionPlateGroup;
    index: number;
    songs: number[];
    difficulties: number[];
    id?: number;
    description?: string;
};

export const icons: Icon[] = collections.icons.map(icon => ({
    type: CollectionKind.Icon,
    id: icon.id,
    name: icon.name,
    genre: icon.genre,
    description: icon.description,
}));
export const plates: Plate[] = collections.plates.map(plate => ({
    type: CollectionKind.Plate,
    id: plate.id,
    name: plate.name,
    genre: plate.genre,
    description: plate.description,
}));
export const frames: Frame[] = collections.frames.map(frame => ({
    type: CollectionKind.Frame,
    id: frame.id,
    name: frame.name,
    genre: frame.genre,
    description: frame.description,
}));
export const titles: Title[] = collections.titles.map(title => ({
    type: CollectionKind.Title,
    id: title.id,
    name: title.name,
    genre: title.genre,
    description: title.description,
    color: title.color as TitleColor,
}));
export const characters: Character[] = additionalCollections.characters.map(character => ({
    id: character.id,
    name: character.name,
    genre: character.genre,
    updateTime: character.updateTime,
}));
export const genres = {
    ...collections.genres,
    ...additionalCollections.genres,
};
const versionPlateCategories = ["極", "将", "神", "舞舞"] as const;

const versionPlateConditions: Record<
    VersionPlateCategory,
    {
        idOffset: number;
        specialMaiPlateId: number;
        description: string;
        condition: ComboStatus | SyncStatus | RankRate;
    }
> = {
    極: {
        idOffset: 1000,
        specialMaiPlateId: 6149,
        description: "FULL COMBO",
        condition: ComboStatus.FullCombo,
    },
    将: {
        idOffset: 2000,
        specialMaiPlateId: 6150,
        description: "RANK SSS",
        condition: RankRate.sss,
    },
    神: {
        idOffset: 3000,
        specialMaiPlateId: 6151,
        description: "ALL PERFECT",
        condition: ComboStatus.AllPerfect,
    },
    舞舞: {
        idOffset: 4000,
        specialMaiPlateId: 6152,
        description: "FULL SYNC DX",
        condition: SyncStatus.FullSyncDX,
    },
};

export const versionPlates = reactive<Record<VersionPlateCategory, VersionPlate[]>>({
    極: [],
    将: [],
    神: [],
    舞舞: [],
});

function groupVersionsByWord(versions: MusicMetadataState["cnVersions"]): VersionPlateGroup[] {
    const groups: VersionPlateGroup[] = [];
    const byWord = new Map<string, VersionPlateGroup>();

    for (const version of versions) {
        let group = byWord.get(version.word);
        if (!group) {
            group = {
                ...version,
                versionNames: [],
            };
            byWord.set(version.word, group);
            groups.push(group);
        }
        group.versionNames.push(version.name);
    }

    return groups;
}

function getVersionPlateSongs(
    data: SavedMusicList,
    versionNames: string[],
    difficulties: number[] = [0, 1, 2, 3]
): number[] {
    const targetVersions = new Set(versionNames);
    const targetDifficulties = new Set(difficulties);
    const songs = new Set<number>();

    for (const music of Object.values(data.musicList)) {
        if (!targetVersions.has(music.info.from as unknown as string)) continue;
        if (!music.charts.some(chart => targetDifficulties.has(chart.info.grade))) continue;
        songs.add(music.id);
    }

    return [...songs];
}

function getVersionPlateDescription(group: VersionPlateGroup, condition: string): string {
    const versionLabel =
        group.versionNames.length > 1
            ? `${group.versionNames[group.versionNames.length - 1]}までの`
            : `${group.versionNames[0]} `;
    return `${versionLabel}全曲/BASIC～MASTER/${condition}`;
}

function insertSpecialMaiVersionPlateDraft(
    drafts: VersionPlateDraft[],
    data: SavedMusicList
): VersionPlateDraft[] {
    const insertAfterIndex = drafts.findIndex(({ group }) => group.word === "輝");
    if (insertAfterIndex === -1) return drafts;

    const versionNames = drafts
        .slice(0, insertAfterIndex + 1)
        .flatMap(({ group }) => group.versionNames);
    const songs = getVersionPlateSongs(data, versionNames, [0, 1, 2, 3, 4]);
    if (songs.length === 0) return drafts;

    return [
        ...drafts.slice(0, insertAfterIndex + 1),
        {
            group: {
                name: "舞",
                word: "舞",
                versionNames,
            },
            index: insertAfterIndex + 1,
            songs,
            difficulties: [0, 1, 2, 3, 4],
            description: "全曲/BASIC～Re:MASTER",
        },
        ...drafts.slice(insertAfterIndex + 1).map(draft => ({
            ...draft,
            index: draft.index + 1,
        })),
    ];
}

export function updateSaltMetaVersionPlates(
    versions: MusicMetadataState["cnVersions"],
    data: SavedMusicList
): void {
    const groups = groupVersionsByWord(versions);

    for (const category of versionPlateCategories) {
        const condition = versionPlateConditions[category];
        const drafts = insertSpecialMaiVersionPlateDraft(
            groups.map((group, index) => ({
                group,
                index,
                songs: getVersionPlateSongs(data, group.versionNames),
                difficulties: [0, 1, 2, 3],
            })),
            data
        );
        versionPlates[category].splice(
            0,
            versionPlates[category].length,
            ...drafts
                .filter(({ group, index, songs }) => {
                    if (songs.length === 0) return false;
                    return !(category === "将" && index === 0 && group.word === "真");
                })
                .map(({ group, index, songs, difficulties, id, description }) => ({
                    type: CollectionKind.Plate,
                    id:
                        group.word === "舞"
                            ? condition.specialMaiPlateId
                            : (id ?? condition.idOffset + index),
                    name: `${group.word}${category}`,
                    description: description
                        ? `${description}/${condition.description}`
                        : getVersionPlateDescription(group, condition.description),
                    genre: "実績",
                    difficulties,
                    condition: condition.condition,
                    songs,
                }))
        );
    }
}

export const partners: Partner[] = [
    { id: 1, name: "でらっくま", description: "", type: CollectionKind.Partner },
    { id: 11, name: "乙姫", description: "", type: CollectionKind.Partner },
    { id: 12, name: "ラズ", description: "", type: CollectionKind.Partner },
    { id: 13, name: "シフォン", description: "", type: CollectionKind.Partner },
    { id: 14, name: "ソルト", description: "", type: CollectionKind.Partner },
    { id: 15, name: "しゃま", description: "", type: CollectionKind.Partner },
    { id: 16, name: "みるく", description: "", type: CollectionKind.Partner },
    { id: 17, name: "らいむっくま＆れもんっくま", description: "", type: CollectionKind.Partner },
    { id: 18, name: "乙姫（すぷらっしゅ）", description: "", type: CollectionKind.Partner },
    { id: 19, name: "しゃま（ゆにばーす）", description: "", type: CollectionKind.Partner },
    { id: 20, name: "みるく（ゆにばーす）", description: "", type: CollectionKind.Partner },
    { id: 21, name: "ちびみるく", description: "", type: CollectionKind.Partner },
    { id: 22, name: "百合咲ミカ", description: "", type: CollectionKind.Partner },
    { id: 23, name: "ラズ（ふぇすてぃばる）", description: "", type: CollectionKind.Partner },
    { id: 24, name: "シフォン（ふぇすてぃばる）", description: "", type: CollectionKind.Partner },
    { id: 25, name: "ソルト（ふぇすてぃばる）", description: "", type: CollectionKind.Partner },
    { id: 26, name: "黒姫", description: "", type: CollectionKind.Partner },
    { id: 27, name: "ずんだもん", description: "", type: CollectionKind.Partner },
    { id: 28, name: "乙姫（ばでぃーず）", description: "", type: CollectionKind.Partner },
    {
        id: 29,
        name: "らいむっくま＆れもんっくま（ばでぃーず）",
        description: "",
        type: CollectionKind.Partner,
    },
    { id: 30, name: "ラズ（ばでぃーず）", description: "", type: CollectionKind.Partner },
    { id: 31, name: "ソルト（ぷりずむ）", description: "", type: CollectionKind.Partner },
];
