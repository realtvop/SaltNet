import type { SaltMetaMusicMetadataNextCompacted } from "../music/saltmeta";
import type { SavedMusicList } from "../music/type";
import {
    convertSaltMetaNextCompactedToNormal,
    convertSaltMetaNextToSavedMusicList,
} from "../music/saltmeta";
import compacted from "./saltmeta.compacted.json";

/*
 * A trimmed copy of the public SaltMeta compacted document (`meta.next.compacted.json`), used as
 * fixed test data by the web app, shared/core and the CLI. It keeps the upstream tuple layout and
 * the upstream order of entries, including the quirks the code has to cope with:
 *
 * - SD and DX charts of one song (`146` "39", a numeric title) and a DX-only song (`1726`).
 * - Two different songs titled "Link" (`131`, `383`) and titles differing only in case
 *   (`695` "TRUST", `1726` "Trust").
 * - Banquet (utage) songs, among them `100851` and `100998`, which upstream lists twice each (the
 *   converted music ids carry the DX offset, so they become `110851` and `110998`).
 * - Charts that exist only in other regions: `125` has no CN chart at all, `77` has no CN DX chart
 *   and `113` has no CN Re:MASTER chart.
 * - A locked DX song (`2025`, converted id `12025`) and at least one song for every CN version up to
 *   舞萌DX 2026.
 *
 * Only the songs `8`, `131`, `146` and `1726` keep their `fitDiffDF` statistics.
 */

/** SaltMeta ids that the fixture, like upstream, lists twice. */
export const FIXTURE_SALTMETA_DUPLICATE_UTAGE_IDS = [100851, 100998] as const;

/** A fresh copy of the compacted document, as the SaltMeta endpoint would return it. */
export function getFixtureSaltMetaCompacted(): SaltMetaMusicMetadataNextCompacted {
    return JSON.parse(JSON.stringify(compacted)) as SaltMetaMusicMetadataNextCompacted;
}

/** The fixture converted the way the web app and the CLI convert a fetched document (CN region). */
export function createFixtureMusicList(): SavedMusicList {
    return convertSaltMetaNextToSavedMusicList(
        convertSaltMetaNextCompactedToNormal(getFixtureSaltMetaCompacted())
    );
}
