import { describe, expect, it } from "vitest";
import { paginate } from "../../src/output/paging";

const ten = Array.from({ length: 10 }, (_, index) => index);

describe("paginate", () => {
    it("returns the first page and where the next one starts", () => {
        expect(paginate(ten, { limit: 3, offset: 0 })).toEqual({
            items: [0, 1, 2],
            page: { total: 10, offset: 0, limit: 3, nextOffset: 3 },
        });
    });

    it("returns a page from the middle", () => {
        expect(paginate(ten, { limit: 3, offset: 3 })).toEqual({
            items: [3, 4, 5],
            page: { total: 10, offset: 3, limit: 3, nextOffset: 6 },
        });
    });

    it("has no next offset on a short last page", () => {
        expect(paginate(ten, { limit: 3, offset: 9 })).toEqual({
            items: [9],
            page: { total: 10, offset: 9, limit: 3, nextOffset: null },
        });
    });

    it("has no next offset when the page ends exactly at the end", () => {
        expect(paginate(ten, { limit: 3, offset: 7 }).page.nextOffset).toBeNull();
        expect(paginate(ten, { limit: 10, offset: 0 }).page.nextOffset).toBeNull();
    });

    it("gives an empty page past the end, still reporting the total", () => {
        expect(paginate(ten, { limit: 3, offset: 20 })).toEqual({
            items: [],
            page: { total: 10, offset: 20, limit: 3, nextOffset: null },
        });
    });

    it("handles an empty list", () => {
        expect(paginate([], { limit: 50, offset: 0 })).toEqual({
            items: [],
            page: { total: 0, offset: 0, limit: 50, nextOffset: null },
        });
    });

    it("matches the example in the design: three charts, one per page", () => {
        const charts = ["a", "b", "c"];
        expect(paginate(charts, { limit: 1, offset: 0 }).page).toEqual({
            total: 3,
            offset: 0,
            limit: 1,
            nextOffset: 1,
        });
    });

    it("does not change the list it was given", () => {
        const input = [1, 2, 3];
        paginate(input, { limit: 1, offset: 1 }).items.push(99);
        expect(input).toEqual([1, 2, 3]);
    });
});
