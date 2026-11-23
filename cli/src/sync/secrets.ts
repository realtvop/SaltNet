import type { User } from "@core/user/type";
import type { CommandContext } from "../commands/registry";
import { createHttp } from "../runtime/http";

export function protectSyncSecrets(ctx: CommandContext, user: User, qrCode?: string) {
    const secrets = new Set<string>();
    function add(...values: unknown[]): void {
        for (const value of values) {
            if (typeof value === "string" && value) secrets.add(value);
        }
    }
    add(
        qrCode,
        user.divingFish.importToken,
        user.lxns?.auth?.accessToken,
        user.lxns?.auth?.refreshToken
    );

    function redact(message: string): string {
        for (const secret of secrets) message = message.replaceAll(secret, "<已隐藏>");
        return message;
    }
    const log = (message: string) => ctx.log(redact(message));
    const scopedContext: CommandContext = {
        ...ctx,
        log,
        http: options =>
            createHttp({
                ...options,
                fetch: ctx.io.fetch,
                userAgent: ctx.config.values.network.userAgent,
                timeoutMs: options?.timeoutMs ?? ctx.config.values.network.timeoutMs,
                timeoutKey: options?.timeoutKey ?? "network.timeoutMs",
                log,
            }),
    };

    function contains(value: object): boolean {
        const encoded = JSON.stringify(value);
        return [...secrets].some(secret => encoded.includes(JSON.stringify(secret).slice(1, -1)));
    }

    function withoutCause(error: unknown): unknown {
        if (secrets.size === 0) return error;
        const message = error instanceof Error ? error.message : String(error);
        return new Error(redact(message));
    }

    return { add, redact, contains, withoutCause, ctx: scopedContext };
}
