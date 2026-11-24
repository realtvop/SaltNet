/**
 * The options every list command shares (design 3.4, 4.5): `--limit` and `--offset` to page,
 * `--fields` to keep only some columns. A command spreads them into its own `options`:
 *
 *     options: { ...listOptions(), level: { ... } }
 *
 * and pages its result with `paginate`. `--fields` is applied to `data.items` (or each group's
 * items) by the runner, so a command never reads it.
 */
import type { OptionSpec } from "./registry";

/** Large enough to take a whole catalog in one go, small enough to catch a slipped digit. */
export const MAX_LIMIT = 10000;

export const DEFAULT_LIMIT = 50;

export function listOptions(defaultLimit: number = DEFAULT_LIMIT) {
    return {
        limit: {
            kind: "integer",
            min: 1,
            max: MAX_LIMIT,
            default: defaultLimit,
            description: "最多返回几条",
        },
        offset: {
            kind: "integer",
            min: 0,
            default: 0,
            description: "跳过前几条，用来翻页",
        },
        fields: {
            kind: "list",
            item: { kind: "string" },
            valueName: "字段,字段",
            description:
                "只保留这些字段，用点号表示嵌套，例如 chartKey,score.rank；tsv 格式下它们就是列名",
        },
    } as const satisfies Readonly<Record<string, OptionSpec>>;
}
