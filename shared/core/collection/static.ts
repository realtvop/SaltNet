import type { Character, Partner } from "./type";
import additionalCollections from "./additionalCollections.json";
import { CollectionKind } from "./type";

/** Travel companions, from the repository's static data (not served by LXNS). */
export const characters: Character[] = additionalCollections.characters.map(character => ({
    id: character.id,
    name: character.name,
    genre: character.genre,
    updateTime: character.updateTime,
}));

export const characterGenres: readonly string[] = additionalCollections.genres.characters;

/** In-game partners, from the repository's static data (not served by LXNS). */
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
