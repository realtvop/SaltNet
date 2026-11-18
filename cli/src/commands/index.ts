import type { CommandDefinition, Registry } from "./registry";
import { b50 } from "./b50";
import { exportBackup, importBackup } from "./backup";
import { userBind, userUnbind } from "./bind";
import { calc } from "./calc";
import { chart } from "./chart";
import { charts } from "./charts";
import { collectionList, collectionShow } from "./collection";
import { configGet, configList, configSet, configUnset } from "./config";
import { courseList, courseShow } from "./course";
import { favAdd, favCreate, favDelete, favList, favRemove, favRename } from "./fav";
import { guide } from "./guide";
import { history } from "./history";
import { kaleidxscope } from "./kaleidxscope";
import { rating } from "./rating";
import { refresh } from "./refresh";
import { buildRegistry } from "./registry";
import { schema } from "./schema";
import { search } from "./search";
import { song } from "./song";
import { sql } from "./sql";
import { status } from "./status";
import { sync } from "./sync";
import { userAdd, userDefault, userEdit, userList, userRemove, userShow } from "./user";

/** Every command, in the order `--help` lists them within a category. */
export const COMMANDS: readonly CommandDefinition[] = [
    search,
    song,
    chart,
    charts,
    b50,
    rating,
    calc,
    history,
    collectionList,
    collectionShow,
    courseList,
    courseShow,
    kaleidxscope,
    userList,
    userShow,
    userAdd,
    userEdit,
    userRemove,
    userDefault,
    userBind,
    userUnbind,
    sync,
    favList,
    favCreate,
    favRename,
    favDelete,
    favAdd,
    favRemove,
    exportBackup,
    importBackup,
    refresh,
    status,
    configList,
    configGet,
    configSet,
    configUnset,
    sql,
    schema,
    guide,
];

/** One line for each group of two-word commands, keyed by its first word. */
export const COMMAND_GROUPS: Readonly<Record<string, string>> = {
    collection: "收藏品：列表和详情",
    config: "设置：查看和修改 config.json",
    course: "段位：列表和详情",
    fav: "收藏夹：查看和管理本地收藏夹",
    user: "用户：查看和管理本地用户",
};

export function createRegistry(): Registry {
    return buildRegistry({ commands: COMMANDS, groups: COMMAND_GROUPS });
}
