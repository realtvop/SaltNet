import type { UserCharacter, UserItem } from "../user/inGame";
import type { User } from "../user/type";
import type { Character, Collection } from "./type";
import { describe, expect, it, vi } from "vitest";
import { getOwnedCollectionIds, isCollectionOwned, toCharacterCollection } from "./ownership";
import { CollectionKind } from "./type";

function makeUser(data: Partial<User["data"]>): User {
    return { data } as User;
}

function makeItem(itemKind: CollectionKind, itemId: number): UserItem {
    return { itemKind, itemId, stock: 1, isValid: true };
}

function makeCollection(type: CollectionKind, id: number): Collection {
    return { type, id, name: String(id), description: "" };
}

function makeUserCharacter(characterId: number): UserCharacter {
    return {
        characterId,
        point: 0,
        useCount: 0,
        level: 1,
        nextAwake: 0,
        nextAwakePercent: 0,
        awakening: 0,
    };
}

describe("collection ownership", () => {
    const emptyOwned = { 1: [], 2: [], 3: [], 9: [], 10: [], 11: [] };

    it.each([
        ["no user", undefined],
        ["a null user", null],
        ["a user without items", makeUser({})],
    ])("starts every supported kind empty for %s", (_label, user) => {
        expect(getOwnedCollectionIds(user)).toEqual(emptyOwned);
        expect(Object.keys(getOwnedCollectionIds(user))).toEqual(["1", "2", "3", "9", "10", "11"]);
    });

    it("collects every supported kind in the existing order", () => {
        const items: UserItem[][] = [];
        items[CollectionKind.Plate] = [makeItem(CollectionKind.Plate, 101)];
        items[CollectionKind.Title] = [makeItem(CollectionKind.Title, 201)];
        items[CollectionKind.Icon] = [makeItem(CollectionKind.Icon, 301)];
        items[CollectionKind.Character] = [makeItem(CollectionKind.Character, 901)];
        items[CollectionKind.Partner] = [makeItem(CollectionKind.Partner, 1001)];
        items[CollectionKind.Frame] = [makeItem(CollectionKind.Frame, 1101)];

        expect(getOwnedCollectionIds(makeUser({ items }))).toEqual({
            1: [101],
            2: [201],
            3: [301],
            9: [901],
            10: [1001],
            11: [1101],
        });
    });

    it("keeps the order of the items within each kind", () => {
        const kinds = [
            CollectionKind.Plate,
            CollectionKind.Title,
            CollectionKind.Icon,
            CollectionKind.Character,
            CollectionKind.Partner,
            CollectionKind.Frame,
        ];
        const items: UserItem[][] = [];
        for (const kind of kinds) items[kind] = [3, 1, 2].map(n => makeItem(kind, kind * 100 + n));

        const owned = getOwnedCollectionIds(makeUser({ items }));

        for (const kind of kinds) expect(owned[kind]).toEqual([3, 1, 2].map(n => kind * 100 + n));
    });

    it("treats holes and non-array kind entries as empty", () => {
        const items: unknown[] = [];
        items[CollectionKind.Plate] = [makeItem(CollectionKind.Plate, 101)];
        items[CollectionKind.Title] = { itemId: 201 };
        items[CollectionKind.Character] = [makeItem(CollectionKind.Character, 901)];

        expect(getOwnedCollectionIds(makeUser({ items: items as UserItem[][] }))).toEqual({
            1: [101],
            2: [],
            3: [],
            9: [901],
            10: [],
            11: [],
        });
    });

    it("keeps IDs up to 3 owned without item data", () => {
        for (const id of [1, 2, 3]) {
            expect(
                isCollectionOwned(makeCollection(CollectionKind.Frame, id), () => emptyOwned)
            ).toBe(true);
        }
        expect(isCollectionOwned(makeCollection(CollectionKind.Frame, 4), () => emptyOwned)).toBe(
            false
        );
    });

    it("turns characters into collections and marks only a matching user character owned", () => {
        const ownedCharacter = makeUserCharacter(7);
        const user = makeUser({ characters: [ownedCharacter] });
        const first: Character = { id: 7, name: "First", genre: "Genre", updateTime: 10 };
        const second: Character = { id: 8, name: "Second", genre: "", updateTime: 20 };

        const withUser = toCharacterCollection(first, user);
        const withoutUser = toCharacterCollection(second, user);
        expect(withUser).toEqual({
            type: CollectionKind.Character,
            id: 7,
            name: "First",
            genre: "Genre",
            description: "Genre",
            userCharacter: ownedCharacter,
        });
        expect(withoutUser).toEqual({
            type: CollectionKind.Character,
            id: 8,
            name: "Second",
            genre: "",
            description: "",
            userCharacter: undefined,
        });
        expect(withUser.userCharacter).toBe(ownedCharacter);
        expect(isCollectionOwned(withUser, () => emptyOwned)).toBe(true);
        expect(isCollectionOwned(withoutUser, () => emptyOwned)).toBe(false);
    });

    it("gives a character without a genre an empty genre and description", () => {
        // The shipped characters all have a genre; the fallback to "" is kept for one that has none.
        const character = { id: 9, name: "Third", updateTime: 30 } as Character;

        const collection = toCharacterCollection(character, makeUser({}));

        expect(collection.genre).toBe("");
        expect(collection.description).toBe("");
    });

    it("returns undefined when the owned map has no key for a non-character kind", () => {
        const unknownKind = 99 as CollectionKind;
        expect(isCollectionOwned(makeCollection(unknownKind, 4), () => emptyOwned)).toBeUndefined();
    });

    it("finds an ID only in the list of its own kind", () => {
        const owned = { ...emptyOwned, 2: [7], 3: [42, 43] };
        const owns = (type: CollectionKind, id: number) =>
            isCollectionOwned(makeCollection(type, id), () => owned);

        expect(owns(CollectionKind.Icon, 42)).toBe(true);
        expect(owns(CollectionKind.Icon, 43)).toBe(true);
        expect(owns(CollectionKind.Icon, 44)).toBe(false);
        expect(owns(CollectionKind.Title, 7)).toBe(true);
        expect(owns(CollectionKind.Title, 42)).toBe(false);
        expect(owns(CollectionKind.Frame, 7)).toBe(false);
    });

    it("reads the owned IDs only for a collection whose ownership depends on items", () => {
        const getOwned = vi.fn(() => emptyOwned);
        const character: Character = { id: 7, name: "First", genre: "Genre", updateTime: 10 };
        const partner = toCharacterCollection(character, makeUser({}));

        isCollectionOwned(makeCollection(CollectionKind.Frame, 3), getOwned);
        isCollectionOwned(partner, getOwned);
        expect(getOwned).not.toHaveBeenCalled();

        isCollectionOwned(makeCollection(CollectionKind.Frame, 4), getOwned);
        expect(getOwned).toHaveBeenCalledTimes(1);
    });

    it("does not change users, characters, collections or owned IDs", () => {
        const items: UserItem[][] = [];
        items[CollectionKind.Icon] = [makeItem(CollectionKind.Icon, 42)];
        const user = makeUser({ items, characters: [makeUserCharacter(7)] });
        const character: Character = { id: 7, name: "First", genre: "Genre", updateTime: 10 };
        const collection = makeCollection(CollectionKind.Icon, 42);
        const owned = getOwnedCollectionIds(user);
        const before = JSON.stringify({ user, character, collection, owned });

        getOwnedCollectionIds(user);
        toCharacterCollection(character, user);
        isCollectionOwned(collection, () => owned);

        expect(JSON.stringify({ user, character, collection, owned })).toBe(before);
    });
});
