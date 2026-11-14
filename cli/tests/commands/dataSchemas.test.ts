/**
 * `schema <command>` publishes a JSON Schema for each command's `data` (design 4.7). These tests
 * run the commands on the fixed fixture data and check what they print against that schema, so a
 * result and its description cannot drift apart: a field that is printed but not described, one
 * that is described but no longer printed, and a wrong type all fail here.
 */
import type { KaleidxscopeGate } from "@core/kaleidxscope";
import type { JsonSchema } from "../../src/commands/registry";
import { mkdirSync, writeFileSync } from "node:fs";
import { courses } from "@core/course";
import { kaleidxscopeGates } from "@core/kaleidxscope";
import { describe, expect, it } from "vitest";
import { allChartEntries } from "../../src/catalog/chartQuery";
import { courseInfo } from "../../src/catalog/courseView";
import { gateDetail } from "../../src/catalog/gateView";
import { courseInfoSchema } from "../../src/catalog/schemas";
import { createRegistry } from "../../src/commands";
import { openStore } from "../../src/store/store";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, NOW } from "../commandRun";
import { expectConforms, expectValidSchema } from "../dataSchema";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const registry = createRegistry();

function schemaOf(name: string): JsonSchema {
    const schema = registry.find(name)?.spec.dataSchema;
    if (!schema) throw new Error(`命令 ${name} 没有 dataSchema`);
    return schema;
}

function lintSchema(commandName: string, schema: JsonSchema): void {
    function walk(node: unknown, path: string): void {
        if (typeof node !== "object" || node === null) return;
        const obj = node as Record<string, unknown>;

        // Check if node is exactly { type: "null" }
        const isExactNull = obj.type === "null" && Object.keys(obj).every(k => k === "type");

        if (!isExactNull) {
            if (typeof obj.description !== "string" || obj.description.trim() === "") {
                throw new Error(`${commandName} at ${path}: missing or empty description`);
            }
        }

        if (obj.properties !== undefined) {
            if (obj.additionalProperties !== false) {
                throw new Error(
                    `${commandName} at ${path}: properties node must have additionalProperties: false`
                );
            }
            if (obj.type === undefined) {
                throw new Error(
                    `${commandName} at ${path}: object node with properties is missing type`
                );
            }
            const propKeys = new Set(Object.keys(obj.properties as object));
            if (obj.required !== undefined) {
                if (!Array.isArray(obj.required)) {
                    throw new TypeError(`${commandName} at ${path}: required must be an array`);
                }
                for (const req of obj.required as string[]) {
                    if (!propKeys.has(req)) {
                        throw new Error(
                            `${commandName} at ${path}: required key '${req}' is not in properties`
                        );
                    }
                }
            }
        }

        if (obj.additionalProperties !== undefined && obj.type === undefined) {
            throw new Error(
                `${commandName} at ${path}: object node with additionalProperties is missing type`
            );
        }

        if (typeof obj.properties === "object" && obj.properties !== null) {
            for (const [key, val] of Object.entries(obj.properties)) {
                walk(val, `${path}.${key}`);
            }
        }

        if (obj.items !== undefined) {
            if (Array.isArray(obj.items)) {
                (obj.items as unknown[]).forEach((item: unknown, i: number) =>
                    walk(item, `${path}.items[${i}]`)
                );
            } else {
                walk(obj.items, `${path}.items`);
            }
        }

        if (Array.isArray(obj.anyOf)) {
            (obj.anyOf as unknown[]).forEach((alt: unknown, i: number) =>
                walk(alt, `${path}.anyOf[${i}]`)
            );
        }

        if (typeof obj.additionalProperties === "object" && obj.additionalProperties !== null) {
            walk(obj.additionalProperties, `${path}.additionalProperties`);
        }
    }

    walk(schema, "(root)");
}

describe("the data schemas of the registry", () => {
    it("every command of the registry has a dataSchema", () => {
        for (const { spec } of registry.commands) {
            expect(spec.dataSchema, `Command ${spec.name} is missing dataSchema`).toBeDefined();
        }
    });

    it("are valid JSON Schema documents", () => {
        for (const { spec } of registry.commands) {
            if (spec.dataSchema) expectValidSchema(spec.dataSchema);
        }
    });

    it("passes the schema linter", () => {
        for (const { spec } of registry.commands) {
            if (spec.dataSchema) lintSchema(spec.name, spec.dataSchema);
        }
    });
});

describe("the schema linter", () => {
    const described = { type: "string", description: "说明" };

    it("accepts a well-formed schema, a null alternative needing no description included", () => {
        const schema = {
            type: "object",
            description: "对象",
            properties: {
                a: described,
                b: { description: "可空", anyOf: [described, { type: "null" }] },
                c: { type: "array", description: "列表", items: described },
                d: { type: "object", description: "字典", additionalProperties: described },
            },
            required: ["a"],
            additionalProperties: false,
        };
        expect(() => lintSchema("x", schema)).not.toThrow();
    });

    it("rejects a node without a description, wherever it is", () => {
        expect(() => lintSchema("x", { type: "string" })).toThrow("description");
        expect(() => lintSchema("x", { ...described, description: "  " })).toThrow("description");
        const inside = (node: Record<string, unknown>) => ({
            type: "object",
            description: "对象",
            additionalProperties: false,
            ...node,
        });
        expect(() => lintSchema("x", inside({ properties: { a: { type: "string" } } }))).toThrow(
            "description"
        );
        expect(() =>
            lintSchema("x", { type: "array", description: "列表", items: { type: "string" } })
        ).toThrow("description");
        expect(() =>
            lintSchema("x", { description: "联合", anyOf: [described, { type: "string" }] })
        ).toThrow("description");
        expect(() =>
            lintSchema("x", {
                type: "object",
                description: "字典",
                additionalProperties: { type: "string" },
            })
        ).toThrow("description");
    });

    it("rejects an object that is not closed, or whose required key is not described", () => {
        const open = { type: "object", description: "对象", properties: { a: described } };
        expect(() => lintSchema("x", open)).toThrow("additionalProperties");
        expect(() => lintSchema("x", { ...open, additionalProperties: true })).toThrow(
            "additionalProperties"
        );
        expect(() =>
            lintSchema("x", { ...open, additionalProperties: false, required: ["a", "b"] })
        ).toThrow("'b'");
    });

    it("rejects an object or a dictionary that does not say it is a type", () => {
        expect(() =>
            lintSchema("x", {
                description: "对象",
                properties: { a: described },
                additionalProperties: false,
            })
        ).toThrow("type");
        expect(() =>
            lintSchema("x", { description: "字典", additionalProperties: described })
        ).toThrow("type");
    });
});

describe("search", () => {
    it("describes a list of songs", async () => {
        const { json } = await commandIn(makeHome(), "search", ["love"]);
        expect(json.data.items.length).toBeGreaterThan(0);
        expectConforms(schemaOf("search"), json.data);
    });

    it("describes a search that finds nothing", async () => {
        const { json } = await commandIn(makeHome(), "search", ["zzzzzzzzzz-no-such-song"]);
        expect(json.data.items).toEqual([]);
        expectConforms(schemaOf("search"), json.data);
    });

    it("rejects a result with a field it does not describe, or without one it does", async () => {
        const { json } = await commandIn(makeHome(), "search", ["love"]);
        const [first] = json.data.items;
        const schema = schemaOf("search");
        expect(() => expectConforms(schema, { items: [{ ...first, extra: 1 }] })).toThrow();
        const { title: _title, ...without } = first;
        expect(() => expectConforms(schema, { items: [without] })).toThrow();
        expect(() => expectConforms(schema, { items: [{ ...first, musicId: "8" }] })).toThrow();
    });
});

describe("song", () => {
    it("describes a plain song", async () => {
        const { json } = await commandIn(makeHome(), "song", ["146"]);
        expect(json.data.musicId).toBe(146);
        expect(json.data.charts.length).toBeGreaterThan(0);
        expectConforms(schemaOf("song"), json.data);
    });

    it("describes a song with --with related (collections and courses populated; gates sample validated)", async () => {
        const { json } = await commandIn(makeHome(), "song", ["256", "--with", "related"]);
        expect(json.data.related.collections.length).toBeGreaterThan(0);
        expect(json.data.related.courses.length).toBeGreaterThan(0);
        expectConforms(schemaOf("song"), json.data);

        // Fixture catalog contains no gate songs, so validate non-empty related.gates with sample
        const withGates = {
            ...json.data,
            related: {
                ...json.data.related,
                gates: [
                    {
                        id: "blue",
                        name: "蓝色之门",
                        shortName: "蓝门",
                        region: "东方Project",
                        key: true,
                        pools: [
                            { track: 1, label: null },
                            { track: 2, label: "BONUS TRACK" },
                        ],
                    },
                ],
            },
        };
        expectConforms(schemaOf("song"), withGates);
    });

    it("describes a song with bpm null (banquet song)", async () => {
        const { json } = await commandIn(makeHome(), "song", ["110227"]);
        expect(json.data.bpm).toBeNull();
        expectConforms(schemaOf("song"), json.data);
    });
});

describe("chart", () => {
    it("describes a chart with statistics and fitConstant", async () => {
        const { json } = await commandIn(makeHome(), "chart", ["146-3"]);
        expect(json.data.stats).not.toBeNull();
        expect(json.data.fitConstant).not.toBeNull();
        expect(json.data.charter).not.toBeNull();
        expectConforms(schemaOf("chart"), json.data);
    });

    it("describes a chart without statistics, fitConstant, constant, charter or notes (banquet chart)", async () => {
        const { json } = await commandIn(makeHome(), "chart", ["110227-10"]);
        expect(json.data.stats).toBeNull();
        expect(json.data.fitConstant).toBeNull();
        expect(json.data.constant).toBeNull();
        expect(json.data.charter).toBeNull();
        expect(json.data.notes.tap).toBeNull();
        expect(json.data.notes.total).toBeNull();
        expectConforms(schemaOf("chart"), json.data);
    });

    it("describes a chart with --with related (collections and courses populated)", async () => {
        const { json } = await commandIn(makeHome(), "chart", ["10256-0", "--with", "related"]);
        expect(json.data.related.collections.length).toBeGreaterThan(0);
        expect(json.data.related.courses.length).toBeGreaterThan(0);
        expectConforms(schemaOf("chart"), json.data);
    });
});

describe("charts", () => {
    it("describes the default charts list", async () => {
        const { json } = await commandIn(makeHome(), "charts", []);
        expect(json.data.items.length).toBeGreaterThan(0);
        expectConforms(schemaOf("charts"), json.data);
    });

    it("describes charts grouped by constant, including the null key group for banquet charts", async () => {
        const { json } = await commandIn(makeHome(), "charts", [
            "--group-by",
            "constant",
            "--diff",
            "mas,utage",
        ]);
        expect(json.data.groups.length).toBeGreaterThan(0);
        const nullGroup = json.data.groups.find(
            (g: { key: string | null; count: number }) => g.key === null
        );
        expect(nullGroup).toBeDefined();
        expect(nullGroup.count).toBeGreaterThan(0);
        expectConforms(schemaOf("charts"), json.data);
    });

    it("describes charts grouped by version", async () => {
        const { json } = await commandIn(makeHome(), "charts", ["--group-by", "version"]);
        expect(json.data.groups.length).toBeGreaterThan(0);
        expectConforms(schemaOf("charts"), json.data);
    });

    it("describes charts grouped by level", async () => {
        const { json } = await commandIn(makeHome(), "charts", ["--group-by", "level"]);
        expect(json.data.groups.length).toBeGreaterThan(0);
        expectConforms(schemaOf("charts"), json.data);
    });

    it("describes charts grouped by difficulty", async () => {
        const { json } = await commandIn(makeHome(), "charts", ["--group-by", "difficulty"]);
        expect(json.data.groups.length).toBeGreaterThan(0);
        expectConforms(schemaOf("charts"), json.data);
    });

    it("describes charts with --limit 1", async () => {
        const { json } = await commandIn(makeHome(), "charts", ["--limit", "1"]);
        expect(json.data.items.length).toBe(1);
        expectConforms(schemaOf("charts"), json.data);
    });

    it("rejects an extra key, a missing key, or a wrong type in a chart row", async () => {
        const { json } = await commandIn(makeHome(), "charts", ["--limit", "1"]);
        const [first] = json.data.items;
        const schema = schemaOf("charts");
        expect(() => expectConforms(schema, { items: [{ ...first, extra: 1 }] })).toThrow();
        const { title: _title, ...without } = first;
        expect(() => expectConforms(schema, { items: [without] })).toThrow();
        expect(() => expectConforms(schema, { items: [{ ...first, musicId: "146" }] })).toThrow();
    });
});

describe("collection list", () => {
    it("describes collection list", async () => {
        const { json } = await commandIn(makeHome(), "collection", ["list", "--limit", "5"]);
        expect(json.data.items.length).toBe(5);
        expectConforms(schemaOf("collection list"), json.data);
    });
});

describe("collection show", () => {
    it("describes a collection with requirements and non-empty items (version plate)", async () => {
        const { json } = await commandIn(makeHome(), "collection", ["show", "plate:6101"]);
        expect(json.data.collection.requirements.length).toBeGreaterThan(0);
        expect(json.data.items.length).toBeGreaterThan(0);
        expectConforms(schemaOf("collection show"), json.data);
    });

    it("describes a collection whose conditions name missing songs", async () => {
        const { json } = await commandIn(makeHome(), "collection", ["show", "plate:409506"]);
        expect(json.data.missing.length).toBeGreaterThan(0);
        expectConforms(schemaOf("collection show"), json.data);
    });

    it("describes a collection without any song conditions", async () => {
        const { json } = await commandIn(makeHome(), "collection", ["show", "plate:1"]);
        expect(json.data.items).toEqual([]);
        expect(json.data.collection.requirements).toEqual([]);
        expectConforms(schemaOf("collection show"), json.data);
    });
});

describe("course list", () => {
    it("describes course list, with both unlocked and locked courses", async () => {
        const { json } = await commandIn(makeHome(), "course", ["list"]);
        expect(json.data.items.length).toBeGreaterThan(0);
        const unlocked = json.data.items.find(
            (c: { unlockCourse: unknown }) => c.unlockCourse === null
        );
        const locked = json.data.items.find(
            (c: { unlockCourse: unknown }) => c.unlockCourse !== null
        );
        expect(unlocked).toBeDefined();
        expect(locked).toBeDefined();
        expectConforms(schemaOf("course list"), json.data);
    });
});

describe("course show", () => {
    it("describes a course with tracks and missing songs", async () => {
        const { json } = await commandIn(makeHome(), "course", ["show", "初段"]);
        expect(json.data.tracks.length).toBeGreaterThan(0);
        expect(json.data.missing.length).toBeGreaterThan(0);
        expectConforms(schemaOf("course show"), json.data);
    });

    it("describes a locked course with unlockCourse populated", async () => {
        const { json } = await commandIn(makeHome(), "course", ["show", "真初段"]);
        expect(json.data.unlockCourse).not.toBeNull();
        expectConforms(schemaOf("course show"), json.data);
    });
});

describe("kaleidxscope", () => {
    it("describes the overview at default time", async () => {
        const { json } = await commandIn(makeHome(), "kaleidxscope", []);
        expect(json.data.gates.length).toBeGreaterThan(0);
        expectConforms(schemaOf("kaleidxscope"), json.data);
    });

    it("describes the overview at --at times exercising all opened / phase combinations", async () => {
        const { json } = await commandIn(makeHome(), "kaleidxscope", [
            "--at",
            "2026-10-01T07:00:00",
        ]);
        const openedNoNext = json.data.gates.find(
            (g: { opened: boolean; currentPhase: unknown; nextPhase: unknown }) =>
                g.opened && g.currentPhase !== null && g.nextPhase === null
        );
        const openedWithNext = json.data.gates.find(
            (g: { opened: boolean; currentPhase: unknown; nextPhase: unknown }) =>
                g.opened && g.currentPhase !== null && g.nextPhase !== null
        );
        const notOpened = json.data.gates.find(
            (g: { opened: boolean; currentPhase: unknown; nextPhase: unknown }) =>
                !g.opened && g.currentPhase === null && g.nextPhase !== null
        );
        expect(openedNoNext).toBeDefined();
        expect(openedWithNext).toBeDefined();
        expect(notOpened).toBeDefined();
        expectConforms(schemaOf("kaleidxscope"), json.data);
    });

    it("describes one gate with non-empty pending songs and --diff", async () => {
        const { json } = await commandIn(makeHome(), "kaleidxscope", ["blue", "--diff", "mas"]);
        expect(json.data.keyCondition.pending.length).toBeGreaterThan(0);
        expectConforms(schemaOf("kaleidxscope"), json.data);
    });

    it("describes the final gate whose life has two bars ({first, second})", async () => {
        const { json } = await commandIn(makeHome(), "kaleidxscope", ["final"]);
        const twoBarPhase = json.data.phases.find(
            (p: { life: unknown }) => typeof p.life === "object" && p.life !== null
        );
        expect(twoBarPhase).toBeDefined();
        expect(typeof twoBarPhase.life.first).toBe("number");
        expect(typeof twoBarPhase.life.second).toBe("number");
        expectConforms(schemaOf("kaleidxscope"), json.data);
    });

    it("describes a gate with a single number life", async () => {
        const { json } = await commandIn(makeHome(), "kaleidxscope", ["blue"]);
        const singleBarPhase = json.data.phases.find(
            (p: { life: unknown }) => typeof p.life === "number"
        );
        expect(singleBarPhase).toBeDefined();
        expectConforms(schemaOf("kaleidxscope"), json.data);
    });

    it("describes a gate with a pool whose unlistedDescription is not null", async () => {
        const { json } = await commandIn(makeHome(), "kaleidxscope", ["noise"]);
        const unlistedPool = json.data.pools.find(
            (p: { unlistedDescription: string | null }) => p.unlistedDescription !== null
        );
        expect(unlistedPool).toBeDefined();
        expect(unlistedPool.unlistedDescription).not.toBeNull();
        expectConforms(schemaOf("kaleidxscope"), json.data);
    });
});

describe("refresh", () => {
    it("describes successful refresh output", async () => {
        const { json } = await commandIn(makeHome(), "refresh", []);
        expect(json.data.sources.length).toBe(2);
        expectConforms(schemaOf("refresh"), json.data);
    });
});

describe("status", () => {
    it("describes status in an empty home", async () => {
        const emptyHome = makeHome();
        const { json } = await commandIn(emptyHome, "status", []);
        expect(json.data.database.exists).toBe(false);
        expect(json.data.database.schemaVersion).toBeNull();
        expect(json.data.metadata.catalog.state).toBe("missing");
        expect(json.data.metadata.catalog.counts).toBeNull();
        expect(json.data.metadata.catalog.fetchedAt).toBeNull();
        expectConforms(schemaOf("status"), json.data);
    });

    it("describes status after download (fresh) with non-empty mergedDuplicates", async () => {
        const home = makeHome();
        await commandIn(home, "charts", ["--limit", "1"]);
        const { json } = await commandIn(home, "status", []);
        expect(json.data.database.exists).toBe(true);
        expect(json.data.metadata.catalog.state).toBe("fresh");
        expect(json.data.metadata.catalog.fetchedAt).not.toBeNull();
        expect(json.data.mergedDuplicates.length).toBeGreaterThan(0);
        expectConforms(schemaOf("status"), json.data);
    });

    it("describes status when metadata is stale", async () => {
        const home = makeHome();
        await commandIn(home, "charts", ["--limit", "1"]);
        const later = new Date(NOW.getTime() + 48 * 3600 * 1000);
        const { json } = await commandIn(home, "status", [], { now: later, network: {} });
        expect(json.data.metadata.catalog.state).toBe("stale");
        expectConforms(schemaOf("status"), json.data);
    });

    it("validates mergedDuplicates items against a literal sample in status", async () => {
        const home = makeHome();
        const { json } = await commandIn(home, "status", []);
        const sampleStatus = {
            ...json.data,
            mergedDuplicates: [
                {
                    id: 100851,
                    title: "[幸]犬日和。(はっぴー歌唱Ver)",
                    mergedTitles: ["犬日和。(はっぴー歌唱Ver)"],
                },
            ],
        };
        expectConforms(schemaOf("status"), sampleStatus);
    });
});

describe("config list", () => {
    it("describes config list with populated items", async () => {
        const { json } = await commandIn(makeHome(), "config", ["list"]);
        expect(json.data.items.length).toBeGreaterThan(0);
        expectConforms(schemaOf("config list"), json.data);
    });

    it("describes config list when problems is not empty", async () => {
        const { json } = await commandIn(makeHome(), "config", ["list"], {
            env: { SALTNET_METADATA_MAX_AGE_HOURS: "not-a-number" },
        });
        expect(json.data.problems.length).toBeGreaterThan(0);
        expectConforms(schemaOf("config list"), json.data);
    });
});

describe("config get", () => {
    it("describes a text setting", async () => {
        const { json } = await commandIn(makeHome(), "config", ["get", "api.url"]);
        expect(typeof json.data.value).toBe("string");
        expectConforms(schemaOf("config get"), json.data);
    });

    it("describes a number setting", async () => {
        const { json } = await commandIn(makeHome(), "config", ["get", "metadata.maxAgeHours"]);
        expect(typeof json.data.value).toBe("number");
        expectConforms(schemaOf("config get"), json.data);
    });
});

describe("config set", () => {
    it("describes config set output with changed: true", async () => {
        const { json } = await commandIn(makeHome(), "config", [
            "set",
            "metadata.maxAgeHours",
            "12",
        ]);
        expect(json.data.changed).toBe(true);
        expect(json.data.value).toBe(12);
        expectConforms(schemaOf("config set"), json.data);
    });
});

describe("config unset", () => {
    it("describes config unset output with changed: true", async () => {
        const home = makeHome();
        await commandIn(home, "config", ["set", "metadata.maxAgeHours", "12"]);
        const { json } = await commandIn(home, "config", ["unset", "metadata.maxAgeHours"]);
        expect(json.data.changed).toBe(true);
        expectConforms(schemaOf("config unset"), json.data);
    });
});

describe("sql", () => {
    it("describes query results with several column types", async () => {
        const { json } = await commandIn(makeHome(), "sql", [
            "SELECT chart_key, constant, title FROM v_charts LIMIT 3",
        ]);
        expect(json.data.items.length).toBe(3);
        expectConforms(schemaOf("sql"), json.data);
    });

    it("describes query results returning no rows", async () => {
        const { json } = await commandIn(makeHome(), "sql", [
            "SELECT chart_key FROM v_charts WHERE constant > 99",
        ]);
        expect(json.data.items).toEqual([]);
        expectConforms(schemaOf("sql"), json.data);
    });
});

describe("how a search found a song", () => {
    it("describes a hit by id, by artist and by charter, and a song that has both sides", async () => {
        const home = makeHome();
        const matchedBy = (item: { matchedBy: string[] }, kind: string) =>
            item.matchedBy.includes(kind);

        const byId = await commandIn(home, "search", ["146"]);
        expect(byId.json.data.items[0].matchedBy).toEqual(["id"]);
        expectConforms(schemaOf("search"), byId.json.data);

        const byArtist = await commandIn(home, "search", ["sasakure.UK x DECO*27"]);
        expect(byArtist.json.data.items.some((item: never) => matchedBy(item, "artist"))).toBe(
            true
        );
        expectConforms(schemaOf("search"), byArtist.json.data);

        const byCharter = await commandIn(home, "search", ["譜面-100号"]);
        expect(byCharter.json.data.items.some((item: never) => matchedBy(item, "charter"))).toBe(
            true
        );
        expectConforms(schemaOf("search"), byCharter.json.data);

        const wide = await commandIn(home, "search", ["e", "--limit", "1000"]);
        const types = new Set(wide.json.data.items.map((item: { type: string }) => item.type));
        expect([...types].sort()).toEqual(["DX", "SD", "SD+DX"]);
        expectConforms(schemaOf("search"), wide.json.data);
    });
});

describe("lists with nothing in them", () => {
    it("describes a search, a filter and a page that find nothing", async () => {
        const home = makeHome();
        const cases = [
            ["collection", ["list", "--search", "zzzzzzzzzz-no"], "collection list"],
            ["charts", ["--search", "zzzzzzzzzz-no"], "charts"],
            ["course", ["list", "--offset", "100000"], "course list"],
            ["config", ["list", "--offset", "100000"], "config list"],
        ] as const;
        for (const [command, args, name] of cases) {
            const { json } = await commandIn(home, command, [...args]);
            expect(json.data.items, name).toEqual([]);
            expectConforms(schemaOf(name), json.data);
        }
    });

    it("describes groups whose charts are all skipped by --offset", async () => {
        const { json } = await commandIn(makeHome(), "charts", [
            "--group-by",
            "level",
            "--offset",
            "100000",
        ]);
        expect(json.data.groups.length).toBeGreaterThan(0);
        for (const group of json.data.groups) {
            expect(group.items).toEqual([]);
            expect(group.count).toBeGreaterThan(0);
        }
        expectConforms(schemaOf("charts"), json.data);
    });
});

describe("collection list: every kind", () => {
    it("describes the collections of all six kinds, with and without a genre or a rarity", async () => {
        const { json } = await commandIn(makeHome(), "collection", ["list", "--limit", "10000"]);
        const items: { kind: string; genre: string | null; color: string | null }[] =
            json.data.items;
        expect([...new Set(items.map(item => item.kind))].sort()).toEqual([
            "character",
            "frame",
            "icon",
            "partner",
            "plate",
            "title",
        ]);
        expect(items.some(item => item.genre === null)).toBe(true);
        expect(items.some(item => item.genre !== null)).toBe(true);
        expect(items.some(item => item.color !== null)).toBe(true);
        expectConforms(schemaOf("collection list"), json.data);
    });
});

describe("song: more", () => {
    it("describes a song with both sides, and one without aliases", async () => {
        const { json } = await commandIn(makeHome(), "song", ["256"]);
        expect(json.data.type).toBe("SD+DX");
        expectConforms(schemaOf("song"), json.data);
        expectConforms(schemaOf("song"), { ...json.data, aliases: [] });
    });
});

describe("course: more", () => {
    it("describes a locked course whose unlocking course the data does not have", () => {
        const locked = courses.find(course => course.isLocked)!;
        const info = courseInfo(locked, []);
        expect(info.unlockCourse).toEqual({ id: locked.unlockCourseId, name: null });
        expectConforms(courseInfoSchema, info);
    });

    it("describes a course that has no track the catalog lacks", async () => {
        const { json } = await commandIn(makeHome(), "course", ["show", "初段"]);
        expectConforms(schemaOf("course show"), { ...json.data, missing: [] });
    });
});

describe("kaleidxscope: more", () => {
    it("describes a gate that is not open yet, and a calendar of past, current and future phases", async () => {
        const home = makeHome();
        const early = await commandIn(home, "kaleidxscope", [
            "blue",
            "--at",
            "2020-01-01T00:00:00+08:00",
        ]);
        expect(early.json.data.opened).toBe(false);
        expect(early.json.data.currentPhase).toBeNull();
        expect(early.json.data.nextPhase).not.toBeNull();
        expectConforms(schemaOf("kaleidxscope"), early.json.data);

        const mid = await commandIn(home, "kaleidxscope", [
            "blue",
            "--at",
            "2026-01-27T00:00:00+08:00",
        ]);
        const statuses = new Set(
            mid.json.data.phases.map((phase: { status: string }) => phase.status)
        );
        expect([...statuses].sort()).toEqual(["current", "future", "past"]);
        expectConforms(schemaOf("kaleidxscope"), mid.json.data);
    });

    it("describes a gate whose songs the catalog has, those it lacks, and a pool of scrambled charts", () => {
        const blue = kaleidxscopeGates.find(gate => gate.id === "blue")!;
        const gate: KaleidxscopeGate = {
            ...blue,
            keyCondition: {
                summary: "测试",
                songs: [
                    { musicId: 58, title: "A" },
                    { musicId: 99999, title: "Gone" },
                ],
            },
            selectionPools: [
                {
                    track: 1,
                    description: "池一",
                    selection: "random",
                    songs: [{ musicId: 191, title: "B" }],
                },
                {
                    track: 2,
                    label: "BONUS TRACK",
                    description: "池二",
                    selection: "fixed",
                    songs: [{ musicId: 146, title: "C" }],
                },
                {
                    track: 3,
                    description: "",
                    selection: "fixed",
                    unlistedDescription: "乱码谱",
                    songs: [{ musicId: 58, title: "A" }],
                },
            ],
        };
        const now = new Date("2026-02-01T00:00:00+08:00");
        const detail = gateDetail(gate, allChartEntries(fixtureSongCatalog()), { now, grade: 4 });
        expect(detail.keyCondition.songs.length).toBeGreaterThan(0);
        expect(detail.keyCondition.pending.length).toBeGreaterThan(0);
        expect(detail.pools[1].songs.length).toBeGreaterThan(0);
        expectConforms(schemaOf("kaleidxscope"), { at: formatLocalTime(now), ...detail });
    });
});

describe("refresh: more", () => {
    it("describes a source that worked and nothing else: a failed one is an error, not data", async () => {
        const { json } = await commandIn(makeHome(), "refresh", []);
        const schema = schemaOf("refresh");
        const [saltMeta, collections] = json.data.sources;
        expect(() => expectConforms(schema, { sources: [{ ...saltMeta, ok: false }] })).toThrow();
        expect(() =>
            expectConforms(schema, { sources: [{ ...saltMeta, source: "lxns-collections" }] })
        ).toThrow();
        expect(() =>
            expectConforms(schema, { sources: [{ ...collections, counts: { title: 1 } }] })
        ).toThrow();
        expect(() =>
            expectConforms(schema, { sources: [{ ...collections, counts: undefined }] })
        ).toThrow();
    });

    it("describes a download that folded no duplicate songs", async () => {
        const { json } = await commandIn(makeHome(), "refresh", []);
        const [saltMeta, collections] = json.data.sources;
        expectConforms(schemaOf("refresh"), {
            sources: [{ ...saltMeta, mergedDuplicates: [] }, collections],
        });
    });
});

describe("status: more", () => {
    it("describes hours that are not whole numbers", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);
        const { json } = await commandIn(home, "status", [], {
            now: new Date(NOW.getTime() + 90 * 60 * 1000),
            network: {},
            env: { SALTNET_METADATA_MAX_AGE_HOURS: "0.5" },
        });
        expect(json.data.metadata.maxAgeHours).toBe(0.5);
        expect(json.data.metadata.catalog.ageHours).toBe(1.5);
        expect(json.data.metadata.catalog.state).toBe("stale");
        expectConforms(schemaOf("status"), json.data);
    });

    it("describes data that another version stored, and data that is missing", async () => {
        const home = makeHome();
        await commandIn(home, "refresh", []);
        const store = openStore(home);
        store.db
            .prepare("UPDATE meta_state SET builder = ? WHERE source = ?")
            .run("catalog-0/old", "saltmeta");
        store.db.prepare("DELETE FROM meta_state WHERE source = 'lxns-collections'").run();
        store.close();
        const { json } = await commandIn(home, "status", []);
        expect(json.data.metadata.catalog.state).toBe("other-version");
        expect(json.data.metadata.collections.state).toBe("missing");
        expectConforms(schemaOf("status"), json.data);
    });
});

describe("config: more", () => {
    it("describes settings that come from the environment and config.json, and a problem in each place", async () => {
        const home = makeHome();
        mkdirSync(home.home, { recursive: true });
        writeFileSync(
            home.config,
            JSON.stringify({ weird: 1, metadata: { maxAgeHours: 12, timeoutMs: "abc" } })
        );
        const { json } = await commandIn(home, "config", ["list"], {
            env: { SALTNET_NETWORK_TIMEOUT_MS: "20000" },
        });
        const sources = new Set(json.data.items.map((item: { source: string }) => item.source));
        expect(sources).toEqual(new Set(["env", "file", "default"]));
        const problems: { severity: string; source: string; key: string }[] = json.data.problems;
        expect(problems.map(problem => problem.severity).sort()).toEqual(["error", "warning"]);
        expect(problems.every(problem => problem.source === "file")).toBe(true);
        expectConforms(schemaOf("config list"), json.data);
    });

    it("describes a problem that is with the whole file, and one with an environment variable", async () => {
        const home = makeHome();
        mkdirSync(home.home, { recursive: true });
        writeFileSync(home.config, "{ not json");
        const { json } = await commandIn(home, "config", ["list"], {
            env: { SALTNET_METADATA_MAX_AGE_HOURS: "not-a-number" },
        });
        const sources = json.data.problems.map((problem: { source: string }) => problem.source);
        expect(sources.sort()).toEqual(["env", "file"]);
        expect(json.data.problems.some((problem: { key: string }) => problem.key === "")).toBe(
            true
        );
        expectConforms(schemaOf("config list"), json.data);
    });

    it("describes a set and an unset that change nothing", async () => {
        const home = makeHome();
        const unsetNothing = await commandIn(home, "config", ["unset", "metadata.maxAgeHours"]);
        expect(unsetNothing.json.data.changed).toBe(false);
        expectConforms(schemaOf("config unset"), unsetNothing.json.data);

        await commandIn(home, "config", ["set", "metadata.maxAgeHours", "12"]);
        const setAgain = await commandIn(home, "config", ["set", "metadata.maxAgeHours", "12"]);
        expect(setAgain.json.data.changed).toBe(false);
        expect(setAgain.json.data.source).toBe("file");
        expectConforms(schemaOf("config set"), setAgain.json.data);
    });

    it("describes a setting that is a fraction, and one that is text", async () => {
        const home = makeHome();
        const fraction = await commandIn(home, "config", ["set", "metadata.maxAgeHours", "0.5"]);
        expect(fraction.json.data.value).toBe(0.5);
        expectConforms(schemaOf("config set"), fraction.json.data);

        const text = await commandIn(home, "config", ["set", "network.userAgent", "probe/1"]);
        expect(text.json.data.value).toBe("probe/1");
        expectConforms(schemaOf("config set"), text.json.data);
    });
});

describe("sql: more", () => {
    it("describes whole numbers, fractions, text and null as column values", async () => {
        const { json } = await commandIn(makeHome(), "sql", [
            "SELECT 1 AS whole, 2.5 AS fraction, 'text' AS text, NULL AS blank",
        ]);
        expect(json.data.items).toEqual([{ whole: 1, fraction: 2.5, text: "text", blank: null }]);
        expectConforms(schemaOf("sql"), json.data);
    });
});
