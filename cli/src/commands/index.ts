import type { CommandDefinition, Registry } from "./registry";
import { buildRegistry } from "./registry";

/** Every command, in the order `--help` lists them within a category. */
export const COMMANDS: readonly CommandDefinition[] = [];

/** One line for each group of two-word commands, keyed by its first word. */
export const COMMAND_GROUPS: Readonly<Record<string, string>> = {};

export function createRegistry(): Registry {
    return buildRegistry({ commands: COMMANDS, groups: COMMAND_GROUPS });
}
