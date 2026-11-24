import type { UserCharacter } from "../user/inGame";
import type { User } from "../user/type";
import type { Character, Collection } from "./type";
import { CollectionKind } from "./type";

export type OwnedCollectionIds = Record<number, number[]>;

export interface CharacterCollection extends Collection {
    userCharacter?: UserCharacter;
}

export function getOwnedCollectionIds(user: User | null | undefined): OwnedCollectionIds {
    const owned: OwnedCollectionIds = { 1: [], 2: [], 3: [], 9: [], 10: [], 11: [] };
    const items = user?.data?.items;
    const getItemsByKind = (kind: CollectionKind) =>
        Array.isArray(items?.[kind]) ? items[kind] : [];

    for (const collection of getItemsByKind(CollectionKind.Plate))
        owned[CollectionKind.Plate].push(collection.itemId);
    for (const collection of getItemsByKind(CollectionKind.Title))
        owned[CollectionKind.Title].push(collection.itemId);
    for (const collection of getItemsByKind(CollectionKind.Icon))
        owned[CollectionKind.Icon].push(collection.itemId);
    for (const collection of getItemsByKind(CollectionKind.Character))
        owned[CollectionKind.Character].push(collection.itemId);
    for (const collection of getItemsByKind(CollectionKind.Partner))
        owned[CollectionKind.Partner].push(collection.itemId);
    for (const collection of getItemsByKind(CollectionKind.Frame))
        owned[CollectionKind.Frame].push(collection.itemId);

    return owned;
}

export function toCharacterCollection(
    character: Character,
    user: User | null | undefined
): CharacterCollection {
    const userCharacter = user?.data?.characters?.find(uc => uc.characterId === character.id);
    return {
        type: CollectionKind.Character,
        id: character.id,
        name: character.name,
        genre: character.genre || "",
        description: character.genre || "",
        userCharacter,
    };
}

/**
 * `getOwned` is called only for a collection whose ownership depends on the user's items, so a
 * caller that computes the owned IDs on demand does not compute them for the default IDs or for
 * travel partners.
 */
export function isCollectionOwned(
    collection: Collection,
    getOwned: () => OwnedCollectionIds
): boolean | undefined {
    if (collection.id <= 3) return true;

    if (collection.type === CollectionKind.Character) {
        return !!(collection as CharacterCollection).userCharacter;
    }

    const owned = getOwned();
    return owned[collection.type] && owned[collection.type].includes(collection.id);
}
