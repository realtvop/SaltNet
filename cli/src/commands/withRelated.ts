/**
 * `--with` (design 3.2): extra parts of a result that cost more to work out, asked for by name.
 * Only `related` exists so far, the collections, dan courses and gates that use a song or a
 * chart; the parts that need a user's scores come with the scores. A command spreads the option
 * into its own `options`:
 *
 *     options: { ...withOptions() }
 *
 * and calls `loadRelated` once it knows the charts. Without `--with related` nothing about
 * collections is fetched, so the command still needs only the catalog.
 */
import type { Chart } from "@core/music/type";
import type { Related } from "../catalog/relatedView";
import type { CommandContext, GlobalOptions, OptionSpec } from "./registry";
import { relatedTo } from "../catalog/relatedView";
import { listCollections } from "../refs/collection";
import { useMetadata } from "./metadata";

export const WITH_VALUES = ["related"] as const;

export function withOptions() {
    return {
        with: {
            kind: "list",
            item: { kind: "enum", values: WITH_VALUES },
            valueName: "内容,内容",
            description:
                "多带上的内容，多个用逗号隔开；related 是用到它的收藏品、段位和门（要用落雪的收藏品列表，不写这个选项就不取）",
        },
    } as const satisfies Readonly<Record<string, OptionSpec>>;
}

/**
 * The part of the result `--with related` adds, with the times and warnings of the collections it
 * used; undefined when the option was not given. `charts` are the charts of the song asked about,
 * or the one chart.
 */
export async function loadRelated(
    args: {
        readonly global: GlobalOptions;
        readonly options: { readonly with?: readonly string[] };
    },
    ctx: CommandContext,
    charts: readonly Chart[]
) {
    if (!args.options.with?.includes("related")) return undefined;
    const metadata = await useMetadata(args, ctx, ["collections"]);
    const data: Related = relatedTo(charts, {
        collections: listCollections(metadata.collections.collections),
    });
    return { data, dataAsOf: metadata.dataAsOf, warnings: metadata.warnings };
}
