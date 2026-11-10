import type { RenderInput } from "../../src/output/render";
import { describe, expect, it } from "vitest";
import { CliError } from "../../src/errors";
import { serializeEnvelope, successEnvelope } from "../../src/output/envelope";
import { renderSuccess } from "../../src/output/render";

const items = [
    { chartKey: "834-4", title: "PANDORA PARADOXXX", score: { rank: "SSS", rating: 324 } },
    { chartKey: "131-3", title: "Link", score: null },
];

function input(rest: Partial<RenderInput> & Pick<RenderInput, "result">): RenderInput {
    return {
        command: "charts",
        output: "list",
        format: "json",
        pretty: false,
        ...rest,
    };
}

function thrown(run: () => unknown): unknown {
    try {
        run();
    } catch (error) {
        return error;
    }
    return undefined;
}

describe("json", () => {
    it("is the envelope on one line", () => {
        const result = {
            data: { items },
            meta: { page: { total: 2, offset: 0, limit: 50, nextOffset: null } },
        };
        const rendered = renderSuccess(input({ result }));
        expect(rendered.stderr).toBe("");
        expect(rendered.stdout).toBe(serializeEnvelope(successEnvelope("charts", result), false));
        expect(rendered.stdout.trimEnd().includes("\n")).toBe(false);
    });

    it("is indented with --pretty", () => {
        const rendered = renderSuccess(input({ result: { data: { items } }, pretty: true }));
        expect(rendered.stdout).toContain('\n    "ok": true');
    });

    it("applies --fields to the items", () => {
        const rendered = renderSuccess(
            input({ result: { data: { items } }, fields: ["chartKey", "score.rank"] })
        );
        expect(JSON.parse(rendered.stdout).data).toEqual({
            items: [
                { chartKey: "834-4", score: { rank: "SSS" } },
                { chartKey: "131-3", score: { rank: null } },
            ],
        });
    });

    it("applies --fields to every group and checks the names against all of them", () => {
        const groups = [
            { key: "15", count: 1, items: [items[0]] },
            { key: "13", count: 1, items: [items[1]] },
        ];
        const rendered = renderSuccess(
            input({ result: { data: { groups } }, fields: ["title", "score.rank"] })
        );
        expect(JSON.parse(rendered.stdout).data.groups).toEqual([
            {
                key: "15",
                count: 1,
                items: [{ title: "PANDORA PARADOXXX", score: { rank: "SSS" } }],
            },
            { key: "13", count: 1, items: [{ title: "Link", score: { rank: null } }] },
        ]);
        // `rating` exists in the first group only; it is still a valid name.
        expect(() =>
            renderSuccess(input({ result: { data: { groups } }, fields: ["score.rating"] }))
        ).not.toThrow();
    });

    it("rejects an unknown field before anything is printed", () => {
        const error = thrown(() =>
            renderSuccess(input({ result: { data: { items } }, fields: ["titel"] }))
        );
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe("USAGE");
    });

    it("leaves the data of an object command alone", () => {
        const rendered = renderSuccess(
            input({
                command: "song",
                output: "object",
                result: { data: { musicId: 1, title: "Link" } },
                fields: ["musicId"],
            })
        );
        expect(JSON.parse(rendered.stdout).data).toEqual({ musicId: 1, title: "Link" });
    });
});

describe("a command that returns text", () => {
    it("prints the text without an envelope and makes sure it ends in a newline", () => {
        for (const text of ["# 指南\n正文", "# 指南\n正文\n"]) {
            const rendered = renderSuccess(
                input({
                    command: "guide",
                    output: "text",
                    result: { data: text },
                    format: "json",
                })
            );
            expect(rendered).toEqual({ stdout: "# 指南\n正文\n", stderr: "" });
        }
    });

    it("is a bug when the command returns something else", () => {
        const error = thrown(() =>
            renderSuccess(input({ command: "guide", output: "text", result: { data: { a: 1 } } }))
        );
        expect(error).toBeInstanceOf(TypeError);
        expect((error as Error).message).toContain("命令 guide");
    });
});

describe("a list that is not shaped like one", () => {
    it("is a bug in the command", () => {
        for (const data of [null, "x", { rows: [] }, { items: "no" }, []]) {
            const error = thrown(() => renderSuccess(input({ result: { data } })));
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain("命令 charts");
        }
    });
});

describe("tsv", () => {
    it("puts the table on stdout and everything else on stderr as # comments", () => {
        const rendered = renderSuccess(
            input({
                format: "tsv",
                result: {
                    data: { items, stats: { sss: 1 } },
                    meta: { page: { total: 2, offset: 0, limit: 50, nextOffset: null } },
                    warnings: [{ code: "STALE_SCORES", message: "旧了", fix: "saltnet sync" }],
                },
            })
        );
        expect(rendered.stdout).toBe(
            [
                "chartKey\ttitle\tscore.rank\tscore.rating",
                "834-4\tPANDORA PARADOXXX\tSSS\t324",
                "131-3\tLink\t\t",
                "",
            ].join("\n")
        );
        expect(rendered.stderr.split("\n")).toEqual([
            '# meta {"page":{"total":2,"offset":0,"limit":50,"nextOffset":null}}',
            '# warning {"code":"STALE_SCORES","message":"旧了","fix":"saltnet sync"}',
            '# stats {"sss":1}',
            "",
        ]);
        expect(
            rendered.stderr
                .split("\n")
                .slice(0, -1)
                .every(line => line.startsWith("# "))
        ).toBe(true);
    });

    it("writes no comment for an empty meta", () => {
        const rendered = renderSuccess(input({ format: "tsv", result: { data: { items } } }));
        expect(rendered.stderr).toBe("");
    });

    it("applies --fields and uses them as the column names", () => {
        const rendered = renderSuccess(
            input({ format: "tsv", result: { data: { items } }, fields: ["title", "score.rank"] })
        );
        expect(rendered.stdout).toBe("title\tscore.rank\nPANDORA PARADOXXX\tSSS\nLink\t\n");
    });

    it("keeps the header for the fields that were asked for when nothing matched", () => {
        const rendered = renderSuccess(
            input({
                format: "tsv",
                result: { data: { items: [] } },
                fields: ["title", "score.rank"],
            })
        );
        expect(rendered.stdout).toBe("title\tscore.rank\n");
    });

    it("prints nothing for an empty list without --fields", () => {
        expect(
            renderSuccess(input({ format: "tsv", result: { data: { items: [] } } })).stdout
        ).toBe("");
    });

    it("turns groups into one table with the group's key in the first column", () => {
        const groups = [
            { key: "15", count: 1, items: [{ title: "A" }] },
            { key: "13", count: 2, items: [{ title: "B" }, { title: "C" }] },
        ];
        const rendered = renderSuccess(input({ format: "tsv", result: { data: { groups } } }));
        expect(rendered.stdout).toBe("group\ttitle\n15\tA\n13\tB\n13\tC\n");
    });
});

describe("text", () => {
    it("renders a table followed by the paging line", () => {
        const rendered = renderSuccess(
            input({
                format: "text",
                result: {
                    data: { items },
                    meta: { page: { total: 2, offset: 0, limit: 50, nextOffset: null } },
                },
            })
        );
        expect(rendered.stderr).toBe("");
        expect(rendered.stdout.split("\n")[0]).toBe(
            "chartKey  title              score.rank  score.rating"
        );
        expect(rendered.stdout).toContain("第 1–2 条，共 2 条");
    });

    it("renders an object as an outline", () => {
        const rendered = renderSuccess(
            input({ command: "song", output: "object", format: "text", result: { data: { a: 1 } } })
        );
        expect(rendered.stdout).toBe("a: 1\n");
    });
});
