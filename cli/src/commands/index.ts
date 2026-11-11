import type { CommandDefinition, Registry } from "./registry";
import { chart } from "./chart";
import { charts } from "./charts";
import { refresh } from "./refresh";
import { buildRegistry } from "./registry";
import { search } from "./search";
import { song } from "./song";

/** Every command, in the order `--help` lists them within a category. */
export const COMMANDS: readonly CommandDefinition[] = [search, song, chart, charts, refresh];

/** One line for each group of two-word commands, keyed by its first word. */
export const COMMAND_GROUPS: Readonly<Record<string, string>> = {};

export function createRegistry(): Registry {
    return buildRegistry({ commands: COMMANDS, groups: COMMAND_GROUPS });
}
