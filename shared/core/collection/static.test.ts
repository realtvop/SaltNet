import { describe, expect, it } from "vitest";
import { characterGenres, characters, partners } from "./static";
import { CollectionKind } from "./type";

describe("static collection data", () => {
    it("has unique character ids and lists every character genre", () => {
        expect(new Set(characters.map(character => character.id)).size).toBe(characters.length);
        const genres = new Set(characterGenres);
        expect(genres.size).toBe(characterGenres.length);
        expect(characters.every(character => genres.has(character.genre))).toBe(true);
    });

    it("has unique partner ids of the partner kind", () => {
        expect(new Set(partners.map(partner => partner.id)).size).toBe(partners.length);
        expect(partners.every(partner => partner.type === CollectionKind.Partner)).toBe(true);
    });
});
