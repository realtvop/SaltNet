import type { CommandDefinition, Registry } from "./registry";
import { chart } from "./chart";
import { charts } from "./charts";
import { collectionList, collectionShow } from "./collection";
import { courseList, courseShow } from "./course";
import { kaleidxscope } from "./kaleidxscope";
import { refresh } from "./refresh";
import { buildRegistry } from "./registry";
import { search } from "./search";
import { song } from "./song";

/** Every command, in the order `--help` lists them within a category. */
export const COMMANDS: readonly CommandDefinition[] = [
    search,
    song,
    chart,
    charts,
    collectionList,
    collectionShow,
    courseList,
    courseShow,
    kaleidxscope,
    refresh,
];

/** One line for each group of two-word commands, keyed by its first word. */
export const COMMAND_GROUPS: Readonly<Record<string, string>> = {
    collection: "收藏品：列表和详情",
    course: "段位：列表和详情",
};

export function createRegistry(): Registry {
    return buildRegistry({ commands: COMMANDS, groups: COMMAND_GROUPS });
}
