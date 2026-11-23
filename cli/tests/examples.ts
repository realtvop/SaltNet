/**
 * Commands without a guide example. Every guide example runs offline in the end-to-end test, and
 * these commands only talk to accounts, so they have none; every other command needs at least one.
 */
export const COMMANDS_WITHOUT_EXAMPLES: ReadonlySet<string> = new Set([
    "sync",
    "ingame check-login",
]);
