/**
 * Collections as the commands read them (design 3.1): `类型:id` (`title:5108`) or a name. The
 * kinds are `plate` (including the version plates), `title`, `icon`, `frame`, `character` and
 * `partner`. Names repeat a lot, within a kind and across kinds, so a name that more than one
 * collection has is `AMBIGUOUS_REF` and its candidates are written as `类型:id`.
 */
import type { MappedCollections } from "@core/collection/map";
import type { Collection } from "@core/collection/type";
import { characters, partners } from "@core/collection/static";
import { CollectionKind } from "@core/collection/type";
import { CliError } from "../errors";
import { echo } from "../util/echo";
import { resolveNamed } from "./named";

/** The kinds in the order lists give them. */
export const COLLECTION_KINDS = [
    "plate",
    "title",
    "icon",
    "frame",
    "character",
    "partner",
] as const;
export type CollectionKindName = (typeof COLLECTION_KINDS)[number];

export interface CollectionEntry {
    readonly kind: CollectionKindName;
    readonly collection: Collection;
}

/** `title:5108`, the form every kind can be written in. */
export function collectionRef(entry: CollectionEntry): string {
    return `${entry.kind}:${entry.collection.id}`;
}

/** Every collection of every kind, the kinds in the order of `COLLECTION_KINDS`. */
export function listCollections(collections: MappedCollections): CollectionEntry[] {
    const kindOf = (kind: CollectionKindName) => (collection: Collection) => ({ kind, collection });
    return [
        ...collections.plates.map(kindOf("plate")),
        ...collections.titles.map(kindOf("title")),
        ...collections.icons.map(kindOf("icon")),
        ...collections.frames.map(kindOf("frame")),
        // Travel companions carry no description or conditions, only a name and a genre.
        ...characters
            .map(
                (character): Collection => ({
                    type: CollectionKind.Character,
                    id: character.id,
                    name: character.name,
                    genre: character.genre,
                    description: "",
                })
            )
            .map(kindOf("character")),
        ...partners.map(kindOf("partner")),
    ];
}

const KIND_REF = new RegExp(`^(${COLLECTION_KINDS.join("|")}):(\\d+)$`, "i");

export function resolveCollection(
    entries: readonly CollectionEntry[],
    text: string
): CollectionEntry {
    const match = KIND_REF.exec(text.trim());
    if (match) {
        const kind = match[1].toLowerCase();
        const id = Number(match[2]);
        const found = entries.find(entry => entry.kind === kind && entry.collection.id === id);
        if (found) return found;
        throw new CliError("NOT_FOUND", `没有这个收藏品${echo(`${kind}:${match[2]}`)}`);
    }
    return resolveNamed(entries, text, {
        noun: "收藏品",
        names: entry => [entry.collection.name],
        // Five thousand names: a part of one would name a crowd, not an item.
        partialNames: false,
        hint: `写成 类型:id（类型有 ${COLLECTION_KINDS.join("、")}）或完整的名称`,
        candidate: entry => ({ ref: collectionRef(entry), title: entry.collection.name }),
    });
}
