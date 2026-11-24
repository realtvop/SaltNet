/**
 * KALEIDXSCOPE gates as the commands read them (design 3.1): the id (`blue`), the name
 * (`蓝色之门`) or the short name (`蓝门`), or a part of a name that only one gate has (`蓝`). Every
 * gate in the data counts, opened or not.
 */
import type { KaleidxscopeGate } from "@core/kaleidxscope";
import { kaleidxscopeGates } from "@core/kaleidxscope";
import { resolveNamed } from "./named";

export function resolveGate(
    text: string,
    gates: readonly KaleidxscopeGate[] = kaleidxscopeGates
): KaleidxscopeGate {
    return resolveNamed(gates, text, {
        noun: "门",
        names: gate => [gate.id, gate.name, gate.shortName],
        candidate: gate => ({ ref: gate.id, title: gate.name }),
        fallback: gates,
    });
}
