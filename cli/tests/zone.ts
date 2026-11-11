import process from "node:process";
import { afterAll, beforeAll } from "vitest";

/**
 * Runs the tests of a file in a fixed time zone. The commands write every time with the machine's
 * own offset and read a time without a zone in the machine's zone, so a test that is to see the
 * difference between that and the zone the data is published in (UTC+8) or UTC cannot depend on
 * where it happens to run. `America/New_York` is at UTC-5 in winter and UTC-4 in summer, which
 * is also different from both.
 */
export function useTimeZone(zone: string): void {
    let before: string | undefined;

    beforeAll(() => {
        before = process.env.TZ;
        process.env.TZ = zone;
    });

    afterAll(() => {
        if (before === undefined) delete process.env.TZ;
        else process.env.TZ = before;
    });
}
