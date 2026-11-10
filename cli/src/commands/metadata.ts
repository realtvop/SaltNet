/**
 * How a command gets the catalog: it names what it reads and receives it current, with the
 * `meta.dataAsOf` times and the `STALE_METADATA` warnings to put in its result (design 2.3).
 */
import type { EnsuredMetadata, MetadataKind } from "../catalog/ensure";
import type { CommandContext, GlobalOptions } from "./registry";
import { ensureMetadata } from "../catalog/ensure";

export function useMetadata<const K extends MetadataKind>(
    args: { readonly global: GlobalOptions },
    ctx: CommandContext,
    kinds: readonly K[]
): Promise<EnsuredMetadata<K>> {
    return ensureMetadata(
        {
            store: ctx.store(),
            paths: ctx.paths,
            config: ctx.config.values,
            http: ctx.http({ timeoutMs: ctx.config.values.metadata.timeoutMs }),
            now: () => ctx.io.now(),
            log: ctx.log,
            offline: args.global.offline,
        },
        kinds
    );
}
