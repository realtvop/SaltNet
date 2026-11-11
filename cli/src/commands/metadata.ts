/**
 * How a command gets the catalog: it names what it reads and receives it current, with the
 * `meta.dataAsOf` times and the `STALE_METADATA` warnings to put in its result (design 2.3).
 */
import type { EnsureDeps, EnsuredMetadata, MetadataKind } from "../catalog/ensure";
import type { Warning } from "../output/warning";
import type { CommandContext, GlobalOptions } from "./registry";
import { ensureMetadata, ensureStored } from "../catalog/ensure";

function ensureDeps(args: { readonly global: GlobalOptions }, ctx: CommandContext): EnsureDeps {
    return {
        store: ctx.store(),
        paths: ctx.paths,
        config: ctx.config.values,
        http: ctx.http({ timeoutMs: ctx.config.values.metadata.timeoutMs }),
        now: () => ctx.io.now(),
        log: ctx.log,
        offline: args.global.offline,
    };
}

export function useMetadata<const K extends MetadataKind>(
    args: { readonly global: GlobalOptions },
    ctx: CommandContext,
    kinds: readonly K[]
): Promise<EnsuredMetadata<K>> {
    return ensureMetadata(ensureDeps(args, ctx), kinds);
}

/**
 * The same, for a command that reads the rows itself instead of taking them as the web app keeps
 * them (`sql`): the sources are made current and stored, and only the warnings come back.
 */
export function useStoredMetadata(
    args: { readonly global: GlobalOptions },
    ctx: CommandContext,
    kinds: readonly MetadataKind[]
): Promise<readonly Warning[]> {
    return ensureStored(ensureDeps(args, ctx), kinds);
}
