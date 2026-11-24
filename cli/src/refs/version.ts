/**
 * Versions as the commands read them (design 3.1): the name of a CN version (`舞萌DX 2024`,
 * `maimai PLUS`), or the plate character that goes with it (`熊`), which names every version that
 * has it. A name may be written without its `maimai ` or `舞萌` front (`murasaki plus`, `dx 2024`),
 * or by any part that only one version has (`2024`).
 */
import type { ErrorCandidate } from "../errors";
import { CliError } from "../errors";
import { closestItems } from "../util/closest";
import { echo } from "../util/echo";
import { foldName } from "../util/fold";

export interface Version {
    readonly name: string;
    /** The plate character of the version. */
    readonly word: string;
}

/** How many versions an `AMBIGUOUS_REF` or `NOT_FOUND` lists. */
const MAX_CANDIDATES = 8;

/** The fronts a version name can be written without. */
const FRONTS = ["maimai ", "舞萌"];

function shortName(folded: string): string {
    const front = FRONTS.find(prefix => folded.startsWith(prefix));
    return front ? folded.slice(front.length) : folded;
}

function candidate(version: Version): ErrorCandidate {
    return { ref: version.name, title: version.name };
}

/** The names of the versions a text means, in the order of `versions`. */
export function resolveVersions(versions: readonly Version[], text: string): string[] {
    const folded = foldName(text.trim());
    const namesWhere = (test: (version: Version) => boolean): string[] =>
        versions.filter(test).map(version => version.name);

    // The steps run from the most to the least exact; the first to find anything decides. A name
    // or a plate character may name several versions (`真` is both maimai and maimai PLUS), a
    // part of a name must name just one.
    for (const found of [
        namesWhere(version => foldName(version.name) === folded),
        namesWhere(version => shortName(foldName(version.name)) === folded),
        namesWhere(version => foldName(version.word) === folded),
    ]) {
        if (found.length > 0) return found;
    }

    const partial = versions.filter(version => foldName(version.name).includes(folded));
    const shown = echo(text);
    if (partial.length === 1) return [partial[0].name];
    if (partial.length > 1) {
        throw new CliError(
            "AMBIGUOUS_REF",
            `${shown || "这个写法"}对应 ${partial.length} 个版本；请写完整的版本名或牌子字`,
            { candidates: partial.slice(0, MAX_CANDIDATES).map(candidate) }
        );
    }
    const near = closestItems(
        folded,
        versions,
        version => [foldName(version.name), shortName(foldName(version.name))],
        MAX_CANDIDATES
    );
    throw new CliError("NOT_FOUND", shown ? `找不到版本${shown}` : "找不到这个写法对应的版本", {
        candidates: (near.length > 0 ? near : versions.slice(-MAX_CANDIDATES)).map(candidate),
    });
}
