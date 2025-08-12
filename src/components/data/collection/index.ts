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

interface LXPlate {
    id: number;
    name: string;
    description: string;
    genre: string;
    required?: {
        difficulties: number[];
        fc?: "fc" | "ap";
        fs?: "fsd";
        rate?: "sss";
        songs: LXSong[];
    }[];
}
interface LXSong {
    id: number;
    title: string;
    type: "standard" | "dx";
}

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
function platesToVersionPlates(plates: LXPlate[], type: string): VersionPlate[] {
    return plates
        .filter(plate => plate.name.endsWith(type))
        .map(plate => {
            const required = plate.required?.[0];
            const difficulties = required?.difficulties ?? [];
            if (plate.required?.[1]) difficulties?.push(...plate.required[1].difficulties);

            return {
                type: CollectionKind.Plate,
                id: plate.id,
                name: plate.name,
                description: plate.description,
                genre: plate.genre,
                difficulties,
                condition: {
                    fc: ComboStatus.FullCombo,
                    ap: ComboStatus.AllPerfect,
                    fsd: SyncStatus.FullSyncDX,
                    sss: RankRate.sss,
                }[(required?.fc || required?.fs || required?.rate) as "fc" | "ap" | "fsd" | "sss"],
                songs:
                    required?.songs?.map(song =>
                        song.type === "dx" ? song.id + 10000 : song.id
                    ) ?? [],
            };
        });
}
export const versionPlates = {
    極: platesToVersionPlates(collections.plates as LXPlate[], "極"),
    将: platesToVersionPlates(collections.plates as LXPlate[], "将"),
    神: platesToVersionPlates(collections.plates as LXPlate[], "神"),
    舞舞: platesToVersionPlates(collections.plates as LXPlate[], "舞舞"),
};

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
