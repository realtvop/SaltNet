import type { LXNSCollectionLists } from "../integrations/lxns/type";
import collections from "./lxns-collections.json";

/*
 * A trimmed copy of the four public LXNS collection lists
 * (`/api/v0/maimai/{trophy,icon,plate,frame}/list?required=true`), used as fixed test data by the
 * web app, shared/core and the CLI. Entries keep the upstream fields, including `release_date`,
 * which the app does not use. The version plates 真極 to 超舞舞 cover the plate tab merging (their
 * requirements differ only in the combo or sync level), and the requirement songs are cut down to a
 * few that exist in the SaltMeta fixture, plus songs that do not exist there (千本桜 has no CN
 * chart). 覇者 has two requirements.
 */

/** A fresh copy of the four lists, as the LXNS endpoints serve them. */
export function getFixtureLXNSCollections(): LXNSCollectionLists {
    return JSON.parse(JSON.stringify(collections)) as LXNSCollectionLists;
}
