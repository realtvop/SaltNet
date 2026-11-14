/**
 * The JSON Schemas of what the commands print (design 4.7), for the shapes that more than one
 * command shares. Each sits next to the interface it describes (`ChartRow` in `chartRow.ts`, …);
 * a command's own `data` is put together from them in its own file. `schema <command>` prints
 * them, and `tests/commands/dataSchemas.test.ts` runs the commands and checks what they print
 * against them.
 *
 * Where a field is a TypeScript union, `strEnumOf` is given the union, so adding a member without
 * describing it here is a compile error.
 */
import type { CourseDamage } from "@core/course";
import type { KaleidxscopeDifficulty, KaleidxscopePhaseStatus } from "@core/kaleidxscope";
import type { MergedDuplicateMusic } from "@core/music/duplicates";
import type { ConfigSource } from "../runtime/config";
import type { SettingRow } from "../runtime/configRows";
import type { ChartRow } from "./chartRow";
import type { CollectionChartRow, CollectionRow, RequirementRow } from "./collectionView";
import type { CourseInfo, CourseTrackRow } from "./courseView";
import type { PendingSong, PhaseRow } from "./gateView";
import type {
    Related,
    RelatedCollection,
    RelatedCourse,
    RelatedCourseTrack,
    RelatedGate,
    RelatedGatePool,
    RelatedRequirement,
} from "./relatedView";
import type { SongType } from "./songs";
import type { SourceState, SourceStatus } from "./statusView";
import {
    alwaysNull,
    anyOf,
    bool,
    dictionary,
    extend,
    int,
    list,
    nullable,
    num,
    object,
    str,
    strEnum,
    strEnumOf,
} from "../output/schema";
import { DIFFICULTIES, difficultyLabel } from "../refs/difficulty";
import { comboLabel, COMBOS, rankLabel, RANKS, syncLabel, SYNCS } from "../refs/status";
import { MATCH_KINDS } from "./search";
import { DOWNLOADED_SOURCES } from "./store";

/** The labels of the values that are not "none": `FC`, `AP+`, `FDX`, … */
function labelsOf<T>(values: readonly T[], label: (value: T) => string | null): string[] {
    return values.map(label).filter((text): text is string => text !== null);
}

/** `BASIC` to `Re:MASTER`, and `UTAGE` for a banquet chart. */
export const DIFFICULTY_LABELS: readonly string[] = DIFFICULTIES.map(({ grade }) =>
    difficultyLabel(grade)
);

/** The row every command that lists charts prints (design 4.4). */
export const chartRowSchema = object<ChartRow>(
    {
        chartKey: str("谱面 key：曲目 id、连字符和难度编号，例如 146-3；可以直接传给 chart"),
        musicId: int("曲目 id；DX 谱的 id 是 SD 谱的 id 加 10000"),
        title: str("标题"),
        type: strEnumOf<ChartRow["type"]>({ SD: "", DX: "宴谱和网页端一样算 DX" }, "谱面类型"),
        difficulty: strEnum(DIFFICULTY_LABELS, "难度，宴谱是 UTAGE"),
        level: str("等级，例如 14+；宴谱写成 14? 这样"),
        constant: nullable(
            num("定数（内部等级）"),
            "定数（内部等级）；没有定数的谱（宴谱）是 null"
        ),
        fitConstant: nullable(
            num("拟合定数"),
            "拟合定数：玩家的成绩反推出来的难度，保留四位小数；没有玩家成绩统计时是 null"
        ),
        version: str("加入游戏的国服版本名，例如 maimai PLUS"),
        score: alwaysNull("这个用户在这张谱上的成绩；用户数据加入之前恒为 null"),
        b50: alwaysNull("这张谱在不在用户的 B50 里；用户数据加入之前恒为 null"),
    },
    { description: "一张谱面；所有列出谱面的命令都用这个结构，各自可以再加字段" }
);

/** Which charts a song has: `search` and `song` say it the same way. */
export const songTypeSchema = strEnumOf<SongType>(
    { SD: "", DX: "宴谱算 DX", "SD+DX": "SD 和 DX 两种都有" },
    "这首歌有哪几种谱"
);

/** One song of `search`'s list. */
export const searchItemSchema = object(
    {
        musicId: int("曲目 id，可以直接传给 song；SD 和 DX 都有的歌取 SD 的 id"),
        title: str("标题"),
        artist: str("曲师"),
        genre: str("流派"),
        type: songTypeSchema,
        matchedBy: list(
            strEnum(MATCH_KINDS, "找到它的方式"),
            "文本是怎么找到这首歌的，可能不止一种；顺序固定：id、title、alias、pinyin、romaji、artist、charter"
        ),
    },
    { description: "一首搜到的歌" }
);

/** One collection row of `collection list` and parts of `related`. */
export const collectionRowSchema = object<CollectionRow>(
    {
        ref: str("收藏品引用标识，格式为 类型:id，例如 title:5108；可以直接传给 collection show"),
        kind: strEnumOf<CollectionRow["kind"]>(
            {
                plate: "姓名框，版本牌子也在其中",
                title: "称号",
                icon: "头像",
                frame: "背景",
                character: "旅行伙伴",
                partner: "搭档",
            },
            "收藏品类型"
        ),
        id: int("收藏品 id"),
        name: str("收藏品名称"),
        genre: nullable(str("游戏内归的类，例如 実績 或某个区域名；搭档没有，是 null")),
        color: nullable(
            str("称号的稀有度颜色（Normal、Bronze、Silver、Gold、Rainbow）；其他类型是 null")
        ),
        description: str("游戏里写的获取方式"),
        songCount: int("获取条件点名的曲目数量；条件没有点名曲目时是 0"),
        owned: alwaysNull("用户有没有这件收藏品；用户数据加入之前恒为 null"),
        progress: alwaysNull("用户离拿到它还有多远；用户数据加入之前恒为 null"),
    },
    { description: "一件收藏品" }
);

/** One condition of a collection's requirements. */
export const requirementRowSchema = object<RequirementRow>(
    {
        difficulties: nullable(
            list(strEnum(DIFFICULTY_LABELS, "难度"), "要求的难度"),
            "要求的难度；这首歌任何难度都行时是 null"
        ),
        rank: nullable(
            strEnum(RANKS.map(rankLabel), "评级"),
            "要求的最低评级，例如 SSS；不要求时是 null"
        ),
        combo: nullable(
            strEnum(labelsOf(COMBOS, comboLabel), "连击状态"),
            "要求的最低连击状态，例如 FC、AP+；不要求时是 null"
        ),
        sync: nullable(
            strEnum(labelsOf(SYNCS, syncLabel), "同步状态"),
            "要求的最低同步状态，例如 FS、FDX+；不要求时是 null"
        ),
        songCount: int("这个条件适用于几首曲目"),
    },
    { description: "一项获取条件：要在哪些曲目的哪些难度上达到什么" }
);

/** A chart a collection asks for (`collection show` items). */
export const collectionChartRowSchema = extend<CollectionChartRow, ChartRow>(
    chartRowSchema,
    {
        done: alwaysNull("用户在这张谱上达成条件了没有；用户数据加入之前恒为 null"),
    },
    { description: "收藏品要求的一张谱面" }
);

/** A dan course's basic info and life rules (`course list` items and `course show`). */
export const courseInfoSchema = object<CourseInfo>(
    {
        id: int("段位 id"),
        name: str("段位名称，例如 十段、真皆伝"),
        mode: strEnum(["段位认定", "真段位认定"], "段位模式"),
        locked: bool("是否要先通关别的段位才能解锁"),
        unlockCourse: nullable(
            object(
                {
                    id: int("前置段位的 id"),
                    name: nullable(str("前置段位的名称；数据里找不到它时是 null")),
                },
                { description: "解锁所需的前置段位" }
            ),
            "解锁所需的前置段位；一开始就开放的段位是 null"
        ),
        trackCount: int("曲目数量"),
        life: object(
            {
                initial: int("开局的血量"),
                recovery: int("每首曲目结束后恢复的血量"),
                damage: object<CourseDamage>(
                    {
                        perfect: int("判定为 PERFECT 时扣的血量"),
                        great: int("判定为 GREAT 时扣的血量"),
                        good: int("判定为 GOOD 时扣的血量"),
                        miss: int("判定为 MISS 时扣的血量"),
                    },
                    { description: "各种判定扣的血量" }
                ),
            },
            { description: "血量规则" }
        ),
    },
    { description: "一个段位的基本信息与血量规则" }
);

/** A course track as a chart row (`course show` tracks). */
export const courseTrackRowSchema = extend<CourseTrackRow, ChartRow>(
    chartRowSchema,
    {
        track: int("在段位里的出场顺序，从 1 开始"),
    },
    { description: "段位里的一首曲目" }
);

/** A song the catalog does not have (yet), as `charts`, `course`, `kaleidxscope` name it. */
export const pendingSongSchema = object<PendingSong>(
    {
        musicId: int("曲目 id"),
        title: str("曲目标题"),
    },
    { description: "点名了、但曲库里还没有的曲目" }
);

/** One life phase of a KALEIDXSCOPE gate. */
export const phaseRowSchema = object<PhaseRow>(
    {
        startsAt: str("这个阶段从什么时候开始，用本机时区的偏移写"),
        endsAt: nullable(str("这个阶段到什么时候结束，也就是下一阶段开始；最后一个阶段是 null")),
        difficulty: strEnumOf<KaleidxscopeDifficulty>(
            { BASIC: "", EXPERT: "", MASTER: "", "Re:MASTER": "" },
            "这个阶段门里的歌用什么难度打"
        ),
        life: anyOf(
            "这个阶段的血量：一个数是一条血，{first, second} 是最终门的两条血",
            int("一条血的血量"),
            object(
                {
                    first: int("第一条血的血量"),
                    second: int("第二条血的血量"),
                },
                { description: "两条血的血量" }
            )
        ),
        status: strEnumOf<KaleidxscopePhaseStatus>(
            { past: "已经过去", current: "正在生效", future: "还没开始" },
            "相对于 at 的状态"
        ),
    },
    { description: "万花筒门的一个血量阶段" }
);

const relatedRequirementSchema = extend<RelatedRequirement, RequirementRow>(
    requirementRowSchema,
    {
        charts: list(str("谱面 key"), "这个条件要求的谱面，只列被问到的那几张"),
    },
    { description: "一项关联的获取条件" }
);

const relatedCollectionSchema = extend<RelatedCollection, CollectionRow>(
    collectionRowSchema,
    {
        requirements: list(relatedRequirementSchema, "点名了被问到的曲目或谱面的条件"),
    },
    { description: "一件关联的收藏品" }
);

const relatedCourseTrackSchema = object<RelatedCourseTrack>(
    {
        track: int("在段位里的出场顺序，从 1 开始"),
        chartKey: str("谱面 key"),
        difficulty: strEnum(DIFFICULTY_LABELS, "难度"),
    },
    { description: "段位里的一首曲目" }
);

const relatedCourseSchema = extend<RelatedCourse, CourseInfo>(
    courseInfoSchema,
    {
        tracks: list(relatedCourseTrackSchema, "被问到的谱面在这个段位里的出场位置"),
    },
    { description: "一个关联的段位" }
);

const relatedGatePoolSchema = object<RelatedGatePool>(
    {
        track: int("第几曲的选曲池，从 1 开始"),
        label: nullable(str("选曲池的标签；没有标签是 null")),
    },
    { description: "列出了这首歌的一个选曲池" }
);

const relatedGateSchema = object<RelatedGate>(
    {
        id: str("门 id，例如 blue"),
        name: str("门的全名，例如 蓝色之门"),
        shortName: str("门的简称，例如 蓝门"),
        region: str("所在区域的名称"),
        key: bool("钥匙条件是不是点名了这首歌"),
        pools: list(relatedGatePoolSchema, "列出了这首歌的选曲池；乱码谱的选曲池不算"),
    },
    { description: "一个关联的万花筒门" }
);

/** The related collections, courses and gates of a song or chart. */
export const relatedSchema = object<Related>(
    {
        collections: list(relatedCollectionSchema, "用到这首歌或这张谱的收藏品"),
        courses: list(relatedCourseSchema, "把它作为曲目的段位"),
        gates: list(relatedGateSchema, "把这首歌作为钥匙曲或选曲池曲目的万花筒门"),
    },
    { description: "用到它的收藏品、段位和万花筒门，各自的判断规则和 charts 的同名筛选一致" }
);

/** The status of a downloaded metadata source (`status` catalog and collections). */
export const sourceStatusSchema = object<SourceStatus>(
    {
        source: strEnum(DOWNLOADED_SOURCES, "数据源，和 refresh 报告的一致"),
        label: str("数据源的中文名"),
        state: strEnumOf<SourceState>(
            {
                fresh: "是这个版本存的，也没有过期",
                stale: "过期了，下次用到时自动重新下载",
                "other-version": "是别的版本的 saltnet 存的，下次用到时重建",
                missing: "还没有，下次用到时下载",
            },
            "数据的状态"
        ),
        fetchedAt: nullable(str("什么时候下载的，用本机时区的偏移写；还没下载是 null")),
        ageHours: nullable(num("下载到现在过了几小时，保留一位小数；还没下载是 null")),
        upstreamVersion: nullable(str("上游文档的版本；这个数据源没有版本信息时是 null")),
        counts: nullable(dictionary(int("数量"), "下载到的各项数量；还没下载是 null")),
    },
    { description: "一个数据源的本地数据状态" }
);

/** One setting row (`config list` items and `config get`). */
export const settingRowSchema = object<SettingRow>(
    {
        key: str("设置的完整名称，用点连接，例如 metadata.maxAgeHours"),
        value: anyOf("现在生效的值", str("文本"), num("数")),
        source: strEnumOf<ConfigSource>(
            {
                env: "环境变量",
                file: "config.json",
                build: "构建时从网页端的 .env 读到的",
                default: "内置的默认值",
            },
            "值从哪里来，按优先级从高到低"
        ),
        default: anyOf("没有环境变量和 config.json 时的值", str("文本"), num("数")),
        env: str("覆盖这个设置的环境变量"),
        type: str("这个设置接受什么样的值"),
        description: str("这个设置是干什么的"),
    },
    { description: "一项设置" }
);

/** One song that upstream lists twice folded into one entry (`status` and `refresh`). */
export const mergedDuplicateSchema = object<MergedDuplicateMusic>(
    {
        id: int("保留下来的那一首的曲目 id"),
        title: str("保留下来的标题"),
        mergedTitles: list(str("被合并掉的标题"), "被合并掉的标题"),
    },
    { description: "上游列了两遍、被合并成一首的歌" }
);
