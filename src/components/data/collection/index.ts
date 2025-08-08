import {
    type Icon,
    type Plate,
    type Frame,
    type Title,
    type Character,
    CollectionKind,
    TitleColor,
    type VersionPlate,
} from "@/components/data/collection/type";
import collections from "./collections.json";
import additionalCollections from "./additionalCollections.json";
import { ComboStatus, SyncStatus } from "../maiTypes";

interface LXPlate {
    id: number;
    name: string;
    description: string;
    genre: string;
    required?: {
        difficulties: number[];
        fc?: "fc" | "ap";
        fs?: "fsd";
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
            return {
                type: CollectionKind.Plate,
                id: plate.id,
                name: plate.name,
                description: plate.description,
                genre: plate.genre,
                difficulties: required?.difficulties ?? [],
                condition: {
                    fc: ComboStatus.FullCombo,
                    ap: ComboStatus.AllPerfect,
                    fsd: SyncStatus.FullSyncDX,
                }[(required?.fc || required?.fs) as "fc" | "ap" | "fsd"],
                songs: required?.songs?.map(song => song.id) ?? [],
            };
        });
}
export const versionPlates = {
    gokui: platesToVersionPlates(collections.plates as LXPlate[], "極"),
    shou: platesToVersionPlates(collections.plates as LXPlate[], "将"),
    shin: platesToVersionPlates(collections.plates as LXPlate[], "神"),
    maimai: platesToVersionPlates(collections.plates as LXPlate[], "舞舞"),
};
