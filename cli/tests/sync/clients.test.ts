import { DivingFishError } from "@core/integrations/diving-fish/client";
import { LXNSPlayerApiError } from "@core/integrations/lxns/client";
import { describe, expect, it } from "vitest";
import { mapSyncError } from "../../src/sync/clients";
import { printedCommands } from "../printedCommand";

describe("mapSyncError", () => {
    it("asks to bind again what Diving Fish refused, the token or the name", () => {
        const byToken = mapSyncError(
            new DivingFishError("导入token有误", 400),
            null,
            "df-token",
            "1"
        );
        expect(byToken.code).toBe("NOT_BOUND");
        expect(byToken.fix).toBe("saltnet user bind 1 df-token -");

        // By name, Diving Fish refuses a name it does not know or whose scores are private.
        const byName = mapSyncError(
            new DivingFishError("user not exists", 400),
            null,
            "df-name",
            "1"
        );
        expect(byName.code).toBe("NOT_BOUND");
        expect(byName.message).toContain("用户名");
        expect(byName.fix).toBe(
            "saltnet user bind 1 df-name <水鱼用户名>；或绑定 Import-Token：saltnet user bind 1 df-token -"
        );
    });

    it("prints commands that run as printed for a user that starts with -", () => {
        const user = "-dash user";
        const byToken = mapSyncError(
            new DivingFishError("导入token有误", 400),
            null,
            "df-token",
            user
        );
        expect(printedCommands(byToken.fix)).toMatchObject([
            { command: "user bind", positionals: { user, source: "df-token", value: "-" } },
        ]);
        const byName = mapSyncError(
            new DivingFishError("user not exists", 400),
            null,
            "df-name",
            user
        );
        expect(printedCommands(byName.fix)).toMatchObject([
            {
                command: "user bind",
                positionals: { user, source: "df-name", value: "<水鱼用户名>" },
            },
            { command: "user bind", positionals: { user, source: "df-token", value: "-" } },
        ]);
        const lxns = mapSyncError(new LXNSPlayerApiError("expired", 401), null, "lxns", user);
        expect(lxns.code).toBe("NOT_BOUND");
        expect(printedCommands(lxns.fix)).toMatchObject([
            { command: "user bind", positionals: { user, source: "lxns" } },
        ]);
    });
});
