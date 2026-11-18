import { DivingFishError } from "@core/integrations/diving-fish/client";
import { describe, expect, it } from "vitest";
import { mapSyncError } from "../../src/sync/clients";

describe("mapSyncError", () => {
    it("asks to bind again what Diving Fish refused, the token or the name", () => {
        const byToken = mapSyncError(
            new DivingFishError("导入token有误", 400),
            null,
            "df-token",
            "1"
        );
        expect(byToken.code).toBe("NOT_BOUND");
        expect(byToken.fix).toBe("saltnet user bind 1 df-token");

        // By name, Diving Fish refuses a name it does not know or whose scores are private.
        const byName = mapSyncError(
            new DivingFishError("user not exists", 400),
            null,
            "df-name",
            "1"
        );
        expect(byName.code).toBe("NOT_BOUND");
        expect(byName.message).toContain("用户名");
        expect(byName.fix).toBe("saltnet user bind 1 df-name");
    });
});
