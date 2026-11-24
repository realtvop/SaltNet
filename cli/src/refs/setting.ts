/**
 * Settings as `config get`, `config set` and `config unset` take them (design 3.2): the whole
 * dotted name, such as `metadata.maxAgeHours`, without regard to case or width. A part of a name
 * is not enough, because two of the commands write to the file.
 */
import type { ConfigDefinition } from "../runtime/config";
import { CONFIG_DEFINITIONS } from "../runtime/config";
import { resolveNamed } from "./named";

export function resolveSetting(
    text: string,
    definitions: readonly ConfigDefinition[] = CONFIG_DEFINITIONS
): ConfigDefinition {
    return resolveNamed(definitions, text, {
        noun: "设置",
        names: definition => [definition.key],
        partialNames: false,
        candidate: definition => ({ ref: definition.key, title: definition.description }),
        fallback: definitions,
        hint: "config list 列出全部设置",
    });
}
