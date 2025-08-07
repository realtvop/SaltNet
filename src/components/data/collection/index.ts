import {
    type Icon,
    type Plate,
    type Frame,
    type Title,
    type Character,
    CollectionKind,
    TitleColor,
} from "@/components/data/collection/type";
import collections from "./collections.json";
import additionalCollections from "./additionalCollections.json";

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
