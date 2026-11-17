import type { Chart, ChartScore } from "@core/music/type";
import type { RatingDisplayMode } from "@core/query/chartInfo";
import type { User } from "@core/user/type";
import type { ChartDetails, ChartNotes, ChartRow, ChartStatsRow } from "../catalog/chartRow";
import type { ChartHistoryEntry } from "../catalog/historyView";
import type { Related } from "../catalog/relatedView";
import type { ChartFriendEntry, ChartPositionRow, RatingStageEntry } from "../catalog/schemas";
import type { Store } from "../store/store";
import type { UserScores } from "../users/scores";
import { getChartPositionByDifficulty } from "@core/chart/position";
import {
    getChartRatingTables,
    getLowestRaInChartOrSection,
    getLowestRaInSection,
    selectDisplayedRaTable,
} from "@core/query/chartInfo";
import { getUserDisplayName } from "@core/user/type";
import { chartDetails, chartRow, constantOf } from "../catalog/chartRow";
import { chartScoreOf } from "../catalog/chartScore";
import { chartHistoryEntry } from "../catalog/historyView";
import {
    chartFriendEntrySchema,
    chartHistoryEntrySchema,
    chartPositionSchema,
    chartRowSchema,
    ratingStageSchema,
    relatedSchema,
} from "../catalog/schemas";
import { buildSongCatalog, chartKeyOf } from "../catalog/songs";
import { dictionary, extend, int, list, nullable, num, object, str } from "../output/schema";
import { resolveChart } from "../refs/chart";
import { rankLabel } from "../refs/status";
import { readChartScoreHistoryEntries } from "../users/history";
import { listUsers, readUser } from "../users/repository";
import { readUserScores } from "../users/scores";
import { USER_OPTION } from "./describe";
import { METADATA_ERRORS, useMetadata } from "./metadata";
import { defineCommand } from "./registry";
import { carryScoreContext, scoreMeta, useUserScores } from "./userScores";
import { CHART_WITH_VALUES, loadRelated, withOptions } from "./withRelated";

const notesSchema = object<ChartNotes>(
    {
        tap: nullable(int("TAP 音符数"), "TAP 音符数；未知时为 null"),
        hold: nullable(int("HOLD 音符数"), "HOLD 音符数；未知时为 null"),
        slide: nullable(int("SLIDE 音符数"), "SLIDE 音符数；未知时为 null"),
        touch: nullable(int("TOUCH 音符数"), "TOUCH 音符数；SD 谱或未知时为 null"),
        break: nullable(int("BREAK 音符数"), "BREAK 音符数；未知时为 null"),
        total: nullable(int("总音符物量"), "总音符物量；任何一种音符未知时为 null"),
    },
    { description: "各音符物量" }
);

const statsSchema = object<ChartStatsRow>(
    {
        samples: int("参与统计的玩家人数"),
        avgAchievements: num("平均达成率，保留四位小数"),
        avgDxScore: num("平均 DX 分数，保留两位小数"),
        stdDevAchievements: num("达成率标准差，保留四位小数"),
        rankDist: dictionary(int("人数"), "各评级（D 到 SSS+）的人数分布"),
        comboDist: dictionary(int("人数"), "各连击状态（none、FC、FC+、AP、AP+）的人数分布"),
    },
    { description: "玩家成绩统计" }
);

export interface ChartData extends ChartRow, ChartDetails {
    readonly stages: readonly RatingStageEntry[];
    readonly related?: Related;
    readonly friends?: readonly ChartFriendEntry[];
    readonly history?: readonly ChartHistoryEntry[];
    readonly position?: ChartPositionRow;
}

function safeLowestRaInSection(user: User | null, chart: Chart | null): number | null {
    if (!user || !chart) return null;
    const section = chart.music.info.isNew ? user.data.b50?.dx : user.data.b50?.sd;
    if (!section || section.length === 0) return null;
    return getLowestRaInSection(user, chart);
}

function loadChartFriends(
    store: Store,
    chart: Chart,
    currentUserScores?: UserScores
): ChartFriendEntry[] {
    const users = listUsers(store);
    interface FriendCandidate {
        index: number;
        uid: string;
        name: string;
        current: boolean;
        score: ReturnType<typeof chartScoreOf>;
        played: boolean;
    }
    const candidates: FriendCandidate[] = [];
    for (const u of users) {
        const rawUser = readUser(store, u.uid);
        if (!rawUser) continue;
        const uname = String(
            rawUser.remark ||
                rawUser.divingFish?.name ||
                rawUser.inGame?.name ||
                rawUser.inGame?.id ||
                ""
        );
        if (!uname) continue;

        let uScores: UserScores;
        if (currentUserScores && currentUserScores.user.uid === u.uid) {
            uScores = currentUserScores;
        } else {
            uScores = readUserScores(store, u, []);
        }
        const score = chartScoreOf(chart, uScores);
        const played = score !== null && typeof score.achievements === "number";
        candidates.push({
            index: u.index,
            uid: u.uid,
            name: getUserDisplayName(rawUser),
            current: currentUserScores ? currentUserScores.user.uid === u.uid : false,
            score,
            played,
        });
    }

    candidates.sort((a, b) => {
        if (a.played && b.played) {
            const diff = (b.score!.achievements ?? 0) - (a.score!.achievements ?? 0);
            if (diff !== 0) return diff;
            return a.index - b.index;
        } else if (a.played) {
            return -1;
        } else if (b.played) {
            return 1;
        } else {
            return a.index - b.index;
        }
    });

    let lastScore: number | undefined;
    let lastRank = 1;
    let playedCount = 0;

    return candidates.map(item => {
        if (!item.played) {
            return {
                index: item.index,
                uid: item.uid,
                name: item.name,
                rank: null,
                current: item.current,
                score: item.score,
            };
        }
        playedCount++;
        const scoreVal = item.score!.achievements!;
        let rankNum: number;
        if (lastScore === scoreVal) {
            rankNum = lastRank;
        } else {
            lastRank = playedCount;
            lastScore = scoreVal;
            rankNum = playedCount;
        }
        return {
            index: item.index,
            uid: item.uid,
            name: item.name,
            rank: rankNum,
            current: item.current,
            score: item.score,
        };
    });
}

export const chart = defineCommand(
    {
        name: "chart",
        summary: "一张谱的详情：定数、拟合定数、物量、谱师、统计、成绩、吃分表",
        description:
            "谱面可以写谱面 key（如 146-3），也可以写曲目加难度：曲目 id、标题或别名，后面再给难度（bas、adv、exp、mas、rem、utage，或 0–4、10，或 绿黄红紫白宴）。曲目 id 只在这个 id 自己的一面找；标题或别名如果 SD 和 DX 都有这个难度，要加 --type 选一面，否则是 AMBIGUOUS_REF，候选是两个谱面 key。结果是统一的谱面行，带 --user 指定用户（不写就是默认用户）的成绩和 B50 名次，再加 charter、notes（tap、hold、slide、touch、break、total）、stats（样本数、平均达成率、平均 DX 分、标准差、评级分布、combo 分布）和默认「简洁」模式的 stages 阶段表。本地没有用户时 score 和 b50 都是 null。" +
            "通过 --with 可以附加额外内容，多个用逗号隔开：stages 为完整阶段表（同谱面弹窗的「全部」）；friends 为本地其他用户在这张谱上的成绩与排名；history 为该谱面的成绩变化历史（从新到旧，隐藏仅游玩次数变动的记录）；position 为项目位置和游玩次数；related 为用到这张谱的收藏品、段位和门；all 为以上全部内容。",
        category: "catalog",
        effect: "none",
        output: "object",
        positionals: [
            {
                name: "chart",
                valueName: "谱面",
                description: "谱面 key，或曲目 id、标题、别名（再给难度）",
            },
            {
                name: "difficulty",
                valueName: "难度",
                description: "难度；用谱面 key 时可以省略",
                optional: true,
            },
        ],
        options: {
            type: {
                kind: "enum",
                values: ["sd", "dx"],
                description:
                    "标题或别名两面都有这个难度时，取哪一面；写 id 或谱面 key 时用来核对类型",
            },
            ...USER_OPTION,
            ...withOptions(
                CHART_WITH_VALUES,
                "多带上的内容，多个用逗号隔开；可选 stages（完整阶段表）、friends（好友排名）、history（成绩历史）、related（相关收藏品/段位/门）、position（项目位置）、all（全部）"
            ),
        },
        examples: [
            { command: "chart 146-3", description: "按谱面 key" },
            { command: "chart 146 mas", description: "曲目 id 加难度" },
            { command: "chart 'True Love Song' mas --type sd", description: "标题加难度，指定 SD" },
            {
                command: "chart 146-3 --with stages",
                description: "查看完整的 Rating 阶段表",
            },
            {
                command: "chart 146-3 --with related",
                description: "再加上用到这张谱的收藏品、段位和门",
            },
            {
                command: "chart 146-3 --with all",
                description: "查看包含好友排名、成绩历史、项目位置和相关项在内的全部详情",
            },
        ],
        errors: ["USAGE", "NOT_FOUND", "AMBIGUOUS_REF", "NO_USER", ...METADATA_ERRORS],
        dataSchema: extend<ChartData, ChartRow>(
            chartRowSchema,
            {
                charter: nullable(
                    str("谱师"),
                    "谱师；数据里没有（宴谱），或只写了一个短横线时是 null"
                ),
                notes: notesSchema,
                stats: nullable(statsSchema, "玩家成绩统计；这张谱没有统计时是 null"),
                stages: list(
                    ratingStageSchema,
                    "Rating 阶段表；默认简洁模式，加 --with stages 为完整模式；宴谱为 []"
                ),
                related: relatedSchema,
                friends: list(chartFriendEntrySchema, "本地其他用户在这张谱上的成绩和排名"),
                history: list(chartHistoryEntrySchema, "这张谱面的成绩变化历史，从新到旧"),
                position: chartPositionSchema,
            },
            {
                description:
                    "一张谱面的详细信息；加了对应 --with 才有 related、friends、history、position",
                optional: ["related", "friends", "history", "position"],
            }
        ),
    },
    async (args, ctx) => {
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const userScores = useUserScores(
            args,
            ctx,
            Object.values(metadata.catalog.music.chartList)
        );
        try {
            const entry = resolveChart(buildSongCatalog(metadata.catalog.music), {
                ref: args.positionals.chart,
                difficulty: args.positionals.difficulty,
                type: args.options.type,
            });

            const withList = args.options.with ?? [];
            const wantAll = withList.includes("all");
            const wantStages = wantAll || withList.includes("stages");
            const wantFriends = wantAll || withList.includes("friends");
            const wantHistory = wantAll || withList.includes("history");
            const wantPosition = wantAll || withList.includes("position");

            const stageMode: RatingDisplayMode = wantStages ? "完整" : "简洁";

            let stages: RatingStageEntry[] = [];
            if (constantOf(entry.chart) !== null) {
                const rawUser = userScores.scores
                    ? (readUser(ctx.store(), userScores.scores.user.uid) ?? null)
                    : null;
                const chartScoreRow = chartScoreOf(entry.chart, userScores.scores);
                const scoreForTables: ChartScore | null = chartScoreRow
                    ? ({
                          achievements: chartScoreRow.achievements,
                          deluxeRating: chartScoreRow.rating ?? 0,
                      } as unknown as ChartScore)
                    : null;
                const tables = getChartRatingTables(entry.chart, scoreForTables, stageMode);
                const getBaseRa = () => {
                    const sectionLowest = safeLowestRaInSection(rawUser, entry.chart);
                    return getLowestRaInChartOrSection(entry.chart, scoreForTables, sectionLowest);
                };
                stages = selectDisplayedRaTable(tables.current, stageMode, getBaseRa).map(item => ({
                    achievements: item.achievements,
                    rating: item.rating,
                    rank: rankLabel(item.rank),
                }));
            }

            let friends: ChartFriendEntry[] | undefined;
            if (wantFriends) {
                friends = loadChartFriends(ctx.store(), entry.chart, userScores.scores);
            }

            let history: ChartHistoryEntry[] | undefined;
            if (wantHistory) {
                if (userScores.scores) {
                    const timeline = readChartScoreHistoryEntries(
                        ctx.store(),
                        userScores.scores.user.uid,
                        chartKeyOf(entry.chart),
                        { allChanges: false }
                    );
                    history = timeline.map(chartHistoryEntry);
                } else {
                    history = [];
                }
            }

            let position: ChartPositionRow | undefined;
            if (wantPosition) {
                const allCatalogCharts = Object.values(metadata.catalog.music.chartList);
                const rawUser = userScores.scores
                    ? (readUser(ctx.store(), userScores.scores.user.uid) ?? null)
                    : null;
                const posStr = getChartPositionByDifficulty(
                    entry.chart,
                    entry.chart.info.level,
                    allCatalogCharts,
                    rawUser
                );
                let place: number | null = null;
                let total: number | null = null;
                if (posStr !== "-") {
                    const parts = posStr.split("/");
                    place = Number.parseInt(parts[0], 10);
                    total = Number.parseInt(parts[1], 10);
                }
                const rowScore = chartScoreOf(entry.chart, userScores.scores);
                position = {
                    level: entry.chart.info.level,
                    place,
                    total,
                    playCount: rowScore?.playCount ?? null,
                    playCountEstimated: rowScore?.playCountEstimated ?? false,
                };
            }

            // The collections are fetched only now: a chart that cannot be found costs no download.
            const related = await loadRelated(args, ctx, [entry.chart]);
            const dataAsOf = { ...metadata.dataAsOf, ...related?.dataAsOf };
            return {
                data: {
                    ...chartRow(entry, userScores.scores),
                    ...chartDetails(entry.chart),
                    stages,
                    ...(friends && { friends }),
                    ...(history && { history }),
                    ...(position && { position }),
                    ...(related && { related: related.data }),
                },
                meta: scoreMeta(userScores, dataAsOf),
                warnings: [
                    ...metadata.warnings,
                    ...userScores.warnings,
                    ...(related?.warnings ?? []),
                ],
            };
        } catch (error) {
            carryScoreContext(
                error,
                userScores,
                { dataAsOf: metadata.dataAsOf },
                metadata.warnings
            );
        }
    }
);
