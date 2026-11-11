import type { Course } from "@core/course";
import { describe, expect, it } from "vitest";
import { resolveCourse } from "../../src/refs/course";
import { caught } from "../caught";

describe("resolveCourse", () => {
    const courseTable: [number, string][] = [
        [551001, "初段"],
        [551002, "二段"],
        [551003, "三段"],
        [551004, "四段"],
        [551005, "五段"],
        [551006, "六段"],
        [551007, "七段"],
        [551008, "八段"],
        [551009, "九段"],
        [551010, "十段"],
        [551101, "真初段"],
        [551102, "真二段"],
        [551103, "真三段"],
        [551104, "真四段"],
        [551105, "真五段"],
        [551106, "真六段"],
        [551107, "真七段"],
        [551108, "真八段"],
        [551109, "真九段"],
        [551110, "真十段"],
        [551111, "真皆伝"],
        [551112, "裏皆伝"],
    ];

    it("finds each of the 22 courses by id string and by name", () => {
        for (const [id, name] of courseTable) {
            expect(resolveCourse(String(id)).id).toBe(id);
            expect(resolveCourse(name).id).toBe(id);
        }
    });

    it("prefers exact whole name over longer names that contain it", () => {
        expect(resolveCourse("十段").id).toBe(551010);
        expect(resolveCourse("真十段").id).toBe(551110);
        expect(resolveCourse("初段").id).toBe(551001);
        expect(resolveCourse("真初段").id).toBe(551101);
    });

    it("matches unique parts of names", () => {
        expect(resolveCourse("裏").id).toBe(551112);
        expect(resolveCourse("真九").id).toBe(551109);
    });

    it("fails with AMBIGUOUS_REF for ambiguous parts", () => {
        const errJie = caught(() => resolveCourse("皆伝"));
        expect(errJie.code).toBe("AMBIGUOUS_REF");
        expect(errJie.candidates).toEqual([
            { ref: "真皆伝", title: "真皆伝" },
            { ref: "裏皆伝", title: "裏皆伝" },
        ]);

        const errJiu = caught(() => resolveCourse("九"));
        expect(errJiu.code).toBe("AMBIGUOUS_REF");
        expect(errJiu.candidates?.map(c => c.ref)).toEqual(["九段", "真九段"]);
    });

    it("truncates candidates when ambiguous hits exceed 10", () => {
        const errDuan = caught(() => resolveCourse("段"));
        expect(errDuan.code).toBe("AMBIGUOUS_REF");
        expect(errDuan.message).toBe(
            "「段」对应 20 个段位，只列出前 10 个；请写得更完整一些，或者用候选里的 ref"
        );
        expect(errDuan.candidates?.map(c => c.ref)).toEqual([
            "初段",
            "二段",
            "三段",
            "四段",
            "五段",
            "六段",
            "七段",
            "八段",
            "九段",
            "十段",
        ]);

        const errZhen = caught(() => resolveCourse("真"));
        expect(errZhen.code).toBe("AMBIGUOUS_REF");
        expect(errZhen.message).toBe(
            "「真」对应 11 个段位，只列出前 10 个；请写得更完整一些，或者用候选里的 ref"
        );
        expect(errZhen.candidates?.map(c => c.ref)).toEqual([
            "真初段",
            "真二段",
            "真三段",
            "真四段",
            "真五段",
            "真六段",
            "真七段",
            "真八段",
            "真九段",
            "真十段",
        ]);
    });

    it("does not match parts of an id", () => {
        const error = caught(() => resolveCourse("5510"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.exitCode).toBe(3);
        expect(error.message).toBe("找不到段位「5510」");
        expect(error.candidates?.map(c => c.ref)).toEqual(["初段", "二段", "三段", "四段", "五段"]);
    });

    it("fails with NOT_FOUND and nearest candidates for 十一段", () => {
        const error = caught(() => resolveCourse("十一段"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.candidates).toHaveLength(5);
        expect(error.candidates?.[0].ref).toBe("十段");
    });

    it("supports custom course list", () => {
        const customCourses = [
            { id: 999001, name: "甲段" },
            { id: 999002, name: "乙段" },
        ] as unknown as Course[];

        expect(resolveCourse("甲段", customCourses).id).toBe(999001);
        const errNotFound = caught(() => resolveCourse("初段", customCourses));
        expect(errNotFound.code).toBe("NOT_FOUND");
    });
});
