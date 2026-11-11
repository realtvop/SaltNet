import type { KaleidxscopeGate } from "@core/kaleidxscope";
import { describe, expect, it } from "vitest";
import { resolveGate } from "../../src/refs/gate";
import { caught } from "../caught";

describe("resolveGate", () => {
    it("finds each of the 10 gates by id, name and short name, with case variations", () => {
        const table = [
            { id: "blue", name: "蓝色之门", shortName: "蓝门" },
            { id: "white", name: "白色之门", shortName: "白门" },
            { id: "purple", name: "紫色之门", shortName: "紫门" },
            { id: "black", name: "黑色之门", shortName: "黑门" },
            { id: "yellow", name: "黄色之门", shortName: "黄门" },
            { id: "red", name: "红色之门", shortName: "红门" },
            { id: "prism", name: "棱镜塔", shortName: "棱镜塔" },
            { id: "noise", name: "乱码", shortName: "乱码" },
            { id: "hope", name: "希望之门", shortName: "希望之门" },
            { id: "final", name: "KALEIDXSCOPE", shortName: "KALEIDXSCOPE" },
        ];

        for (const item of table) {
            expect(resolveGate(item.id).id).toBe(item.id);
            expect(resolveGate(item.name).id).toBe(item.id);
            expect(resolveGate(item.shortName).id).toBe(item.id);
        }

        expect(resolveGate("BLUE").id).toBe("blue");
        expect(resolveGate("Blue").id).toBe("blue");
        expect(resolveGate("kaleidxscope").id).toBe("final");
    });

    it("matches unique parts of names", () => {
        expect(resolveGate("蓝").id).toBe("blue");
        expect(resolveGate("希望").id).toBe("hope");
        expect(resolveGate("棱镜").id).toBe("prism");
        expect(resolveGate("kaleid").id).toBe("final");
        expect(resolveGate("乱").id).toBe("noise");
    });

    it("fails with AMBIGUOUS_REF for ambiguous parts", () => {
        const errZhiMen = caught(() => resolveGate("之门"));
        expect(errZhiMen.code).toBe("AMBIGUOUS_REF");
        expect(errZhiMen.message).toBe("「之门」对应 7 个门；请写得更完整一些，或者用候选里的 ref");
        expect(errZhiMen.candidates).toEqual([
            { ref: "blue", title: "蓝色之门" },
            { ref: "white", title: "白色之门" },
            { ref: "purple", title: "紫色之门" },
            { ref: "black", title: "黑色之门" },
            { ref: "yellow", title: "黄色之门" },
            { ref: "red", title: "红色之门" },
            { ref: "hope", title: "希望之门" },
        ]);

        const errSeZhiMen = caught(() => resolveGate("色之门"));
        expect(errSeZhiMen.code).toBe("AMBIGUOUS_REF");
        expect(errSeZhiMen.candidates?.map(c => c.ref)).toEqual([
            "blue",
            "white",
            "purple",
            "black",
            "yellow",
            "red",
        ]);

        const errMen = caught(() => resolveGate("门"));
        expect(errMen.code).toBe("AMBIGUOUS_REF");
        expect(errMen.candidates?.map(c => c.ref)).toEqual([
            "blue",
            "white",
            "purple",
            "black",
            "yellow",
            "red",
            "hope",
        ]);
    });

    it("fails with NOT_FOUND and fallback candidates in data order for non-matching input", () => {
        const error = caught(() => resolveGate("zzzzzzzz"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.exitCode).toBe(3);
        expect(error.message).toBe("找不到门「zzzzzzzz」");
        expect(error.candidates).toHaveLength(10);
        expect(error.candidates?.map(c => c.ref)).toEqual([
            "blue",
            "white",
            "purple",
            "black",
            "yellow",
            "red",
            "prism",
            "noise",
            "hope",
            "final",
        ]);
        expect(error.candidates?.[0].title).toBe("蓝色之门");
    });

    it("fails with NOT_FOUND and nearest candidates for typo", () => {
        const error = caught(() => resolveGate("蓝色门"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.candidates?.map(c => c.ref)).toEqual([
            "blue",
            "white",
            "purple",
            "black",
            "yellow",
        ]);
    });

    it("supports custom gate list", () => {
        const customGates = [
            { id: "g1", name: "甲", shortName: "甲" },
            { id: "g2", name: "乙", shortName: "乙" },
        ] as unknown as KaleidxscopeGate[];

        expect(resolveGate("g2", customGates).id).toBe("g2");
        const errNotFound = caught(() => resolveGate("blue", customGates));
        expect(errNotFound.code).toBe("NOT_FOUND");
    });
});
