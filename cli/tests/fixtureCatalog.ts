import type { SongCatalog } from "../src/catalog/songs";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { buildCatalog } from "../src/catalog/refresh";
import { buildSongCatalog } from "../src/catalog/songs";

let catalog: SongCatalog | undefined;

/**
 * The songs of the fixed SaltMeta fixture, built the way a refresh builds them (with the
 * duplicate banquet songs merged). Tests only read it, so one copy serves a whole test file.
 */
export function fixtureSongCatalog(): SongCatalog {
    catalog ??= buildSongCatalog(buildCatalog(getFixtureSaltMetaCompacted()).music);
    return catalog;
}
