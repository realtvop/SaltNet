import { expect } from "vitest";
import { CliError } from "../src/errors";

/** The `CliError` a call throws; fails the test when it throws something else or nothing. */
export function caught(call: () => unknown): CliError {
    try {
        call();
    } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        return error as CliError;
    }
    throw new Error("expected the call to throw a CliError");
}
