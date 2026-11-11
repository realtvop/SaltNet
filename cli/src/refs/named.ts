/**
 * The steps that gates, courses, plates and collections are looked up by (design 3.1). What was
 * typed names an item as a whole (an id, a name, a short name) or, when no item has it as a whole,
 * by a part of a name that only one item has. A step settles the matter as soon as it finds
 * anything, and what it finds must be exactly one item: several are `AMBIGUOUS_REF`, none at all
 * moves on to the next step, and none in the end is `NOT_FOUND` with the nearest names.
 */
import type { ErrorCandidate } from "../errors";
import { CliError } from "../errors";
import { closestItems } from "../util/closest";
import { echo } from "../util/echo";
import { foldName } from "../util/fold";

/** How many items an `AMBIGUOUS_REF` lists; the rest are only counted. */
export const MAX_AMBIGUOUS_ITEMS = 10;
/** How many near misses a `NOT_FOUND` lists. */
export const MAX_NEAREST_ITEMS = 5;

export interface NamedKind<T> {
    /** What the items are called in a message: `门`, `段位`, `牌子`, `收藏品`. */
    readonly noun: string;
    /** Every text that names one item as a whole: its id, its name, its short name. */
    readonly names: (item: T) => readonly string[];
    /**
     * The texts a part of which names the item when no other item has that part. Default: `names`;
     * `false` when only a whole name will do.
     */
    readonly partialNames?: ((item: T) => readonly string[]) | false;
    /** The item as an error lists it; its `ref` is what to write in place of the rejected text. */
    readonly candidate: (item: T) => ErrorCandidate;
    /** What a `NOT_FOUND` lists when nothing is near, such as every gate there is. */
    readonly fallback?: readonly T[];
    /** The end of a `NOT_FOUND` message: how else this kind of item can be written. */
    readonly hint?: string;
}

function ambiguous<T>(text: string, hits: readonly T[], kind: NamedKind<T>): CliError {
    const truncated = hits.length > MAX_AMBIGUOUS_ITEMS;
    const shown = hits.slice(0, MAX_AMBIGUOUS_ITEMS);
    return new CliError(
        "AMBIGUOUS_REF",
        `${echo(text) || "这个写法"}对应 ${hits.length} 个${kind.noun}${truncated ? `，只列出前 ${shown.length} 个` : ""}；请写得更完整一些，或者用候选里的 ref`,
        { candidates: shown.map(kind.candidate) }
    );
}

function notFound<T>(text: string, items: readonly T[], kind: NamedKind<T>): CliError {
    const shown = echo(text);
    const near = closestItems(
        foldName(text),
        items,
        item => kind.names(item).map(foldName),
        MAX_NEAREST_ITEMS
    );
    const hints = near.length > 0 ? near : (kind.fallback ?? []).slice(0, MAX_AMBIGUOUS_ITEMS);
    const base = shown ? `找不到${kind.noun}${shown}` : `找不到这个写法对应的${kind.noun}`;
    return new CliError("NOT_FOUND", kind.hint ? `${base}；${kind.hint}` : base, {
        candidates: hints.map(kind.candidate),
    });
}

/** The one item `text` names, or the `CliError` that says why there is none. */
export function resolveNamed<T>(items: readonly T[], text: string, kind: NamedKind<T>): T {
    const folded = foldName(text.trim());
    const hasAsWhole = (item: T) => kind.names(item).some(name => foldName(name) === folded);
    const whole = items.filter(hasAsWhole);
    if (whole.length === 1) return whole[0];
    if (whole.length > 1) throw ambiguous(text, whole, kind);

    if (kind.partialNames !== false && folded !== "") {
        const partialNames = kind.partialNames ?? kind.names;
        const part = items.filter(item =>
            partialNames(item).some(name => foldName(name).includes(folded))
        );
        if (part.length === 1) return part[0];
        if (part.length > 1) throw ambiguous(text, part, kind);
    }
    throw notFound(text, items, kind);
}
