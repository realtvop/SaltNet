import { kaleidxscopeGates } from "@core/kaleidxscope";
import { allChartEntries } from "../catalog/chartQuery";
import { gateDetail, gateOverview } from "../catalog/gateView";
import { buildSongCatalog } from "../catalog/songs";
import { usageError } from "../errors";
import { DIFFICULTIES, parseDifficulty } from "../refs/difficulty";
import { resolveGate } from "../refs/gate";
import { parseTimeOption } from "../refs/time";
import { formatLocalTime } from "../util/time";
import { useMetadata } from "./metadata";
import { defineCommand } from "./registry";

/** A gate's songs are never banquet charts, so `utage` is not among the difficulties to pick. */
const GATE_DIFFICULTIES = DIFFICULTIES.filter(difficulty => difficulty.grade !== 10);

export const kaleidxscope = defineCommand(
    {
        name: "kaleidxscope",
        summary: "万花筒：开了哪些门、当前的血量阶段，或一个门的曲目",
        description:
            "不写门时是总览，不需要曲库：全部门（没开的也在）的 id、名称、简称、区域、opened（在 --at 的时间有没有开）、openedAt、keyCondition（钥匙条件 summary 和点名的曲目数 songCount）、currentPhase 和 nextPhase。血量阶段 {startsAt, endsAt, difficulty, life, status} 是这个门的血量日历里的一档：difficulty 是这一档打门里的歌用的难度，life 是血量（一条血是数字，最终门是 {first, second} 两条），status 是相对 --at 的 past、current 或 future；最后一档的 endsAt 是 null，那时 nextPhase 是 null；门没开时 currentPhase 是 null。" +
            "写了门时是这个门的详情：总览里的那些，再加 description、lifeNote、phases（整个血量日历）、chartDifficulty、keyCondition 里的 songs（钥匙曲目）和 pools（每一曲的选曲池，每个有 track、label、description、selection、unlistedDescription、songs 和 pending）。songs 里是谱面行，每首歌一张谱：用 --diff 指定的难度，没写就用当前血量阶段的难度（和网页端一致，没有当前阶段时是 MASTER），歌没有这个难度时依次用 MASTER、EXPERT、它有的第一张，所以每行自己的 difficulty 才是准的；曲库里一张谱都没有的歌放进 pending（musicId 和 title），曲库更新后就有了。曲池带 unlistedDescription 的（乱码的第三曲）实际打的不是普通谱面，所以不列曲目，只有这句说明。" +
            "门可以写 id（blue）、名称（蓝色之门）、简称（蓝门），或只有一个门有的一部分（蓝）；「之门」这样几个门都有的会报 AMBIGUOUS_REF。--at 按指定的时间算开了哪些门和血量阶段，默认是现在；写 ISO 8601，没写时区就按本机时区算，只写日期就是那天的零点。时间都按本机时区写，血量日历本来是北京时间发布的。",
        category: "gameplay",
        effect: "none",
        output: "object",
        positionals: [
            {
                name: "gate",
                valueName: "门",
                description: "门的 id、名称或简称，例如 blue、蓝色之门、蓝门；不写就是总览",
                optional: true,
            },
        ],
        options: {
            at: {
                kind: "string",
                valueName: "时间",
                description:
                    "按这个时间算开了哪些门和血量阶段，ISO 8601，例如 2026-10-01 或 2026-10-01T07:00；默认是现在",
            },
            diff: {
                kind: "enum",
                values: GATE_DIFFICULTIES.map(difficulty => ({
                    value: difficulty.value,
                    aliases: difficulty.aliases,
                })),
                valueName: "难度",
                description: "门里的歌取哪个难度的谱，只在写了门时有用；不写就用当前血量阶段的难度",
            },
        },
        examples: [
            { command: "kaleidxscope", description: "总览：开了哪些门，当前和下一个血量阶段" },
            { command: "kaleidxscope 蓝门", description: "蓝门的血量日历、钥匙曲目和曲池" },
            { command: "kaleidxscope blue --diff mas", description: "蓝门里歌的紫谱" },
            {
                command: "kaleidxscope --at 2026-10-01T07:00",
                description: "看那个时间的开放情况和血量阶段",
            },
        ],
        errors: [
            "USAGE",
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NETWORK",
            "UPSTREAM_ERROR",
            "OFFLINE_NO_CACHE",
        ],
    },
    async (args, ctx) => {
        const { gate: gateText } = args.positionals;
        const { at: atText, diff } = args.options;
        if (gateText === undefined && diff !== undefined) {
            throw usageError("选项 --diff 要和门一起写：它是这个门里的歌取哪个难度的谱");
        }
        // Both the time and the gate ship with the CLI, so a wrong one fails before any fetching.
        const at = atText === undefined ? ctx.io.now() : parseTimeOption("at", atText);

        if (gateText === undefined) {
            return {
                data: { at: formatLocalTime(at), gates: gateOverview(kaleidxscopeGates, at) },
            };
        }

        const gate = resolveGate(gateText);
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const entries = allChartEntries(buildSongCatalog(metadata.catalog.music));
        return {
            data: {
                at: formatLocalTime(at),
                ...gateDetail(gate, entries, {
                    now: at,
                    grade: diff === undefined ? undefined : parseDifficulty(diff)!.grade,
                }),
            },
            meta: { dataAsOf: metadata.dataAsOf },
            warnings: metadata.warnings,
        };
    }
);
