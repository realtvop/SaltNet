/**
 * The views `sql` offers (design 2.2): the part of the database that is promised to the outside.
 * The tables behind them are an internal detail that a migration may reshape; these views are
 * not. Changing one in a way a query can notice (a column removed, renamed, retyped, or a new one
 * that `SELECT *` would pick up) raises `VIEWS_VERSION`, which `sql` reports in `meta.viewsVersion`.
 *
 * A view is written as a SELECT over the tables, for a connection that has the database attached as
 * `real` (`store/sandbox.ts` copies what each view selects into a throwaway in-memory database and
 * the query runs there, so it never gets near a base table). The labels (`BASIC`, `SSS+`, `FDX+`)
 * are produced from the same vocabulary the commands use, and the rules for what is unknown (a
 * constant of 0, a charter of `-`) are the ones of `catalog/chartRow.ts`, so a view row says the
 * same as the command row for the same chart.
 */
import type { DatabaseSync } from "../store/sqlite";
import type { MetadataKind } from "./ensure";
import { SyncStatus } from "@core/mai/types";
import { CliError } from "../errors";
import { DIFFICULTIES, difficultyLabel } from "../refs/difficulty";
import { comboLabel, COMBOS, rankLabel, RANKS, syncLabel } from "../refs/status";
import { REAL_SCHEMA } from "../store/sandbox";
import { SOURCE_OF_KIND } from "./ensure";
import { SOURCE_LABELS } from "./refresh";

/** Raise it when a view changes in a way a query can notice; see the top of this file. */
export const VIEWS_VERSION = 1;

export type ViewColumnType = "TEXT" | "INTEGER" | "REAL";

export interface ViewColumn {
    readonly name: string;
    readonly type: ViewColumnType;
    /** What the column holds, as `schema --views` says it. NULL is described where it can occur. */
    readonly description: string;
}

export interface PublicView {
    readonly name: string;
    readonly summary: string;
    /**
     * The downloaded metadata the rows come from, which a query has to find current first. Empty
     * for the courses, which ship with the CLI.
     */
    readonly needs: readonly MetadataKind[];
    readonly columns: readonly ViewColumn[];
    /** Yields exactly `columns`, in this order, reading the database as `real.<table>`. */
    readonly select: string;
}

/** A column with the expression that gives it, over the tables the view's `from` names. */
interface ColumnSpec extends ViewColumn {
    readonly expr: string;
}

interface ViewSpec {
    readonly name: string;
    readonly summary: string;
    readonly needs: readonly MetadataKind[];
    readonly columns: readonly ColumnSpec[];
    /** What follows `SELECT <columns>`: the FROM clause, and an ORDER BY that makes the order fixed. */
    readonly rest: string;
}

function column(name: string, type: ViewColumnType, description: string, expr: string): ColumnSpec {
    return { name, type, description, expr };
}

function view(spec: ViewSpec): PublicView {
    return {
        name: spec.name,
        summary: spec.summary,
        needs: spec.needs,
        columns: spec.columns.map(({ name, type, description }) => ({ name, type, description })),
        // The select list comes from the columns, so what a view selects and what it says it
        // selects cannot drift apart.
        select: `SELECT ${spec.columns.map(({ name, expr }) => `${expr} AS "${name}"`).join(", ")} ${spec.rest}`,
    };
}

function quote(text: string): string {
    return `'${text.replaceAll("'", "''")}'`;
}

function literal(value: string | number): string {
    return typeof value === "number" ? String(value) : quote(value);
}

/** `CASE <expr> WHEN <value> THEN <label> ... ELSE <otherwise> END`; a value with no label is NULL. */
function labelCase(
    expr: string,
    labels: readonly (readonly [string | number, string | number])[],
    otherwise = "NULL"
): string {
    const whens = labels.map(([value, label]) => `WHEN ${literal(value)} THEN ${literal(label)}`);
    return `CASE ${expr} ${whens.join(" ")} ELSE ${otherwise} END`;
}

/** The name the game shows for a grade, and the number itself for one it does not know. */
function difficultyOf(expr: string): string {
    return labelCase(
        expr,
        DIFFICULTIES.map(({ grade }) => [grade, difficultyLabel(grade)]),
        `CAST(${expr} AS TEXT)`
    );
}

/** The rank an LXNS code (`sss`) stands for: `SSS`. */
function rankOf(expr: string): string {
    return labelCase(
        expr,
        RANKS.map(rank => [rank, rankLabel(rank)])
    );
}

function comboOf(expr: string): string {
    return labelCase(
        expr,
        COMBOS.flatMap(combo => {
            const label = comboLabel(combo);
            return label === null ? [] : [[combo, label] as const];
        })
    );
}

function syncOf(expr: string): string {
    return labelCase(
        expr,
        Object.values(SyncStatus).flatMap(sync => {
            const label = syncLabel(sync);
            return label === null ? [] : [[sync, label] as const];
        })
    );
}

/** The kinds in the order `collection list` gives them. */
const KIND_ORDER = ["plate", "title", "icon", "frame", "character", "partner"] as const;

/** A number that sorts a kind where `collection list` puts it; a kind it does not know goes last. */
function kindOrder(expr: string): string {
    return labelCase(
        expr,
        KIND_ORDER.map((kind, index) => [kind, index]),
        String(KIND_ORDER.length)
    );
}

/** The music id a song of a collection condition stands for in the catalog (`1590` DX is `11590`). */
function musicIdOf(song: string): string {
    const id = `json_extract(${song}, '$.id')`;
    return `CASE WHEN upper(json_extract(${song}, '$.type')) = 'DX' THEN CASE WHEN ${id} >= 10000 THEN ${id} ELSE ${id} + 10000 END ELSE ${id} END`;
}

// --- v_charts -------------------------------------------------------------------------------

/** The note counts. SD charts keep four numbers, DX charts five (touch before break). */
const NOTE = (index: number): string => `json_extract(c.notes, '$[${index}]')`;
const HAS_TOUCH = "json_array_length(c.notes) = 5";
const TAP = NOTE(0);
const HOLD = NOTE(1);
const SLIDE = NOTE(2);
const TOUCH = `CASE WHEN ${HAS_TOUCH} THEN ${NOTE(3)} END`;
const BREAK = `CASE WHEN ${HAS_TOUCH} THEN ${NOTE(4)} ELSE ${NOTE(3)} END`;
/** A banquet chart has no counts; the zeros upstream puts in place of its slides and touches are not counts. */
const NO_NOTES = `(${TAP} IS NULL AND ${HOLD} IS NULL AND ${BREAK} IS NULL)`;
const countOrNull = (expr: string): string => `CASE WHEN ${NO_NOTES} THEN NULL ELSE ${expr} END`;

const STAT = (path: string): string => `json_extract(c.stat, '${path}')`;
function distribution(labels: readonly string[], field: string): string {
    return `CASE WHEN c.stat IS NULL THEN NULL ELSE json_object(${labels
        .map((label, index) => `${quote(label)}, coalesce(${STAT(`$.${field}[${index}]`)}, 0)`)
        .join(", ")}) END`;
}

const CHARTS = view({
    name: "v_charts",
    summary: "一张谱面一行：曲目信息、定数、物量和统计",
    needs: ["catalog"],
    columns: [
        column(
            "chart_key",
            "TEXT",
            "谱面 key，曲目 id 加难度，如 11500-3；所有命令都用它",
            "c.chart_key"
        ),
        column(
            "music_id",
            "INTEGER",
            "曲目 id：DX 和宴会谱是 SaltMeta 的 id 加 10000",
            "c.song_id"
        ),
        column(
            "song_id",
            "INTEGER",
            "SaltMeta 里这首歌的 id；同一首歌的 SD 和 DX 两面共用它",
            "s.meta_id"
        ),
        column("title", "TEXT", "标题", "s.title"),
        column("artist", "TEXT", "曲师", "s.artist"),
        column("genre", "TEXT", "流派", "s.genre"),
        column("bpm", "REAL", "BPM；宴会谱没有，是 NULL", "s.bpm"),
        column("type", "TEXT", "SD 或 DX；宴会谱算 DX", "s.type"),
        column(
            "difficulty",
            "TEXT",
            "难度名：BASIC、ADVANCED、EXPERT、MASTER、Re:MASTER，宴会谱是 UTAGE",
            difficultyOf("c.grade")
        ),
        column(
            "grade",
            "INTEGER",
            "难度编号：0 到 4 是 BASIC 到 Re:MASTER，10 是宴会谱",
            "c.grade"
        ),
        column("level", "TEXT", "等级，如 13+；宴会谱是 13? 这样的写法", "c.level"),
        column(
            "constant",
            "REAL",
            "定数；宴会谱没有，是 NULL",
            "CASE WHEN c.constant > 0 THEN c.constant END"
        ),
        column(
            "fit_constant",
            "REAL",
            "拟合定数（保留 4 位）；没有玩家成绩可以拟合时是 NULL",
            `CASE WHEN ${STAT("$.fit_diff")} > 0 THEN round(${STAT("$.fit_diff")}, 4) END`
        ),
        column("version", "TEXT", "这首歌加入的国服版本", "s.version"),
        column("is_new", "INTEGER", "是不是当前版本的新曲：1 是，0 不是", "s.is_new"),
        column(
            "charter",
            "TEXT",
            "谱师；宴会谱没有，是 NULL",
            "CASE WHEN trim(c.charter, ' ' || char(9, 10, 13, 160, 12288)) NOT IN ('', '-') THEN trim(c.charter, ' ' || char(9, 10, 13, 160, 12288)) END"
        ),
        column("notes_tap", "INTEGER", "Tap 数；未知时是 NULL", TAP),
        column("notes_hold", "INTEGER", "Hold 数；未知时是 NULL", HOLD),
        column("notes_slide", "INTEGER", "Slide 数；未知时是 NULL", countOrNull(SLIDE)),
        column("notes_touch", "INTEGER", "Touch 数；SD 谱没有 Touch，是 NULL", countOrNull(TOUCH)),
        column("notes_break", "INTEGER", "Break 数；未知时是 NULL", BREAK),
        column(
            "notes_total",
            "INTEGER",
            "物量总数；有一项未知时是 NULL",
            `CASE WHEN ${HAS_TOUCH} THEN ${TAP} + ${HOLD} + ${SLIDE} + ${NOTE(3)} + ${NOTE(4)} ELSE ${TAP} + ${HOLD} + ${SLIDE} + ${NOTE(3)} END`
        ),
        column(
            "stat_samples",
            "INTEGER",
            "统计用了多少玩家的成绩；没有统计时是 NULL",
            STAT("$.cnt")
        ),
        column(
            "stat_avg_achievements",
            "REAL",
            "平均达成率（保留 4 位）；没有统计时是 NULL",
            `round(${STAT("$.avg")}, 4)`
        ),
        column(
            "stat_avg_dx_score",
            "REAL",
            "平均 DX 分数（保留 2 位）；没有统计时是 NULL",
            `round(${STAT("$.avg_dx")}, 2)`
        ),
        column(
            "stat_std_dev_achievements",
            "REAL",
            "达成率的标准差（保留 4 位）；没有统计时是 NULL",
            `round(${STAT("$.std_dev")}, 4)`
        ),
        column(
            "stat_rank_dist",
            "TEXT",
            "各评级的玩家数，JSON 对象，键是 D 到 SSS+；用 json_extract(stat_rank_dist, '$.\"SSS+\"') 取；没有统计时是 NULL",
            distribution(RANKS.map(rankLabel), "dist")
        ),
        column(
            "stat_combo_dist",
            "TEXT",
            "各连击状态的玩家数，JSON 对象，键是 none、FC、FC+、AP、AP+；没有统计时是 NULL",
            distribution(
                COMBOS.map(combo => comboLabel(combo) ?? "none"),
                "fc_dist"
            )
        ),
    ],
    rest: `FROM ${REAL_SCHEMA}.charts c JOIN ${REAL_SCHEMA}.songs s ON s.id = c.song_id ORDER BY c.song_id, c.grade`,
});

// --- v_collections, v_collection_targets ----------------------------------------------------

const COLLECTIONS = view({
    name: "v_collections",
    summary: "收藏品一行：称号、头像、姓名框、背景、牌子、旅行伙伴和搭档",
    needs: ["collections"],
    columns: [
        column(
            "ref",
            "TEXT",
            "类型:id，如 title:5108；collection show 和 charts --collection 用它",
            "c.kind || ':' || c.id"
        ),
        column("kind", "TEXT", "plate、title、icon、frame、character 或 partner", "c.kind"),
        column("id", "INTEGER", "收藏品 id（在同一类里唯一）", "c.id"),
        column("name", "TEXT", "名称", "c.name"),
        column(
            "genre",
            "TEXT",
            "游戏里把它归在哪一类；搭档没有，是 NULL",
            "CASE WHEN c.kind IN ('plate', 'title', 'icon', 'frame') THEN coalesce(c.genre, '') ELSE c.genre END"
        ),
        column(
            "color",
            "TEXT",
            "称号的稀有度：Normal、Bronze、Silver、Gold 或 Rainbow；其他类型是 NULL",
            `CASE WHEN c.kind = 'title' THEN ${labelCase(
                "lower(c.color)",
                ["Normal", "Bronze", "Silver", "Gold", "Rainbow"].map(color => [
                    color.toLowerCase(),
                    color,
                ]),
                "'Normal'"
            )} END`
        ),
        column(
            "description",
            "TEXT",
            "获得方式的说明；没有时是空字符串",
            "coalesce(c.description, '')"
        ),
        column(
            "song_count",
            "INTEGER",
            "获取条件点名了多少首歌；条件里没有歌（多数称号和头像）是 0",
            `(SELECT count(DISTINCT ${musicIdOf("s.value")}) FROM json_each(c.required) r, json_each(r.value, '$.songs') s)`
        ),
    ],
    rest: `FROM ${REAL_SCHEMA}.collections c ORDER BY ${kindOrder("c.kind")}, c.position`,
});

const COLLECTION_TARGETS = view({
    name: "v_collection_targets",
    summary: "收藏品的获取条件展开成一行一条：收藏品、条件、歌、难度",
    needs: ["collections"],
    columns: [
        column(
            "collection_ref",
            "TEXT",
            "收藏品，类型:id，和 v_collections.ref 一样",
            "c.kind || ':' || c.id"
        ),
        column("collection_kind", "TEXT", "收藏品的类型", "c.kind"),
        column("collection_id", "INTEGER", "收藏品 id", "c.id"),
        column("condition", "INTEGER", "这是收藏品的第几条条件，从 1 起", "r.key + 1"),
        column(
            "music_id",
            "INTEGER",
            "条件点名的歌的曲目 id（DX 是 SaltMeta 的 id 加 10000）；曲库里不一定有这首歌",
            musicIdOf("s.value")
        ),
        column(
            "song_title",
            "TEXT",
            "条件数据里写的歌名，不一定和曲库里的标题一样",
            "json_extract(s.value, '$.title')"
        ),
        column(
            "difficulty",
            "TEXT",
            "条件点名的难度（BASIC 到 Re:MASTER）；NULL 是这首歌的任何难度都行。条件点名几个难度就有几行",
            difficultyOf("d.value")
        ),
        column(
            "rank",
            "TEXT",
            "条件要求的最低评级，如 SSS；不要求是 NULL",
            rankOf("json_extract(r.value, '$.rate')")
        ),
        column(
            "combo",
            "TEXT",
            "条件要求的最低连击状态：FC、FC+、AP 或 AP+；不要求是 NULL",
            comboOf("json_extract(r.value, '$.fc')")
        ),
        column(
            "sync",
            "TEXT",
            "条件要求的最低同步状态：SYNC、FS、FS+、FDX 或 FDX+；不要求是 NULL",
            syncOf("json_extract(r.value, '$.fs')")
        ),
    ],
    rest: `FROM ${REAL_SCHEMA}.collections c JOIN json_each(c.required) r JOIN json_each(r.value, '$.songs') s LEFT JOIN json_each(r.value, '$.difficulties') d ORDER BY ${kindOrder("c.kind")}, c.position, r.key, s.key, d.key`,
});

// --- v_course_tracks ------------------------------------------------------------------------

const COURSE_TRACKS = view({
    name: "v_course_tracks",
    summary: "段位课程的每一首：课程的规则，加上这一首的谱面",
    needs: [],
    columns: [
        column("course_id", "INTEGER", "课程 id", "c.id"),
        column("course_name", "TEXT", "课程名", "c.name"),
        column("course_mode", "TEXT", "段位认定 或 真段位认定", "c.mode_name"),
        column(
            "course_locked",
            "INTEGER",
            "要不要先通过另一个课程才能挑战：1 要，0 不要",
            "c.is_locked"
        ),
        column(
            "unlock_course_id",
            "INTEGER",
            "解锁它的课程 id；一开始就开放的课程是 NULL",
            "CASE WHEN c.is_locked THEN c.unlock_course_id END"
        ),
        column("life_initial", "INTEGER", "开始时的血量", "c.life_initial"),
        column("life_recovery", "INTEGER", "每首之后恢复的血量", "c.life_recovery"),
        column("damage_perfect", "INTEGER", "一个 PERFECT 扣的血", "c.damage_perfect"),
        column("damage_great", "INTEGER", "一个 GREAT 扣的血", "c.damage_great"),
        column("damage_good", "INTEGER", "一个 GOOD 扣的血", "c.damage_good"),
        column("damage_miss", "INTEGER", "一个 MISS 扣的血", "c.damage_miss"),
        column("track", "INTEGER", "这是第几首，从 1 起", "t.position + 1"),
        column(
            "chart_key",
            "TEXT",
            "谱面 key，和 v_charts.chart_key 一样；曲库里没有这张谱时在 v_charts 里找不到",
            "t.chart_key"
        ),
        column("music_id", "INTEGER", "曲目 id", "t.music_id"),
        column("track_title", "TEXT", "课程数据里写的歌名", "t.title"),
        column("difficulty", "TEXT", "难度名", difficultyOf("t.difficulty")),
    ],
    rest: `FROM ${REAL_SCHEMA}.course_tracks t JOIN ${REAL_SCHEMA}.courses c ON c.id = t.course_id ORDER BY c.position, t.position`,
});

/** Every view `sql` can read, in the order `schema --views` lists them. */
export const PUBLIC_VIEWS: readonly PublicView[] = [
    CHARTS,
    COLLECTIONS,
    COLLECTION_TARGETS,
    COURSE_TRACKS,
];

/** The names of the views, in lower case as SQLite compares them. */
export const PUBLIC_VIEW_NAMES: readonly string[] = PUBLIC_VIEWS.map(({ name }) => name);

/**
 * The views a query mentions. SQL names do not depend on case, and a name can be quoted, so this
 * looks for the name anywhere in the text; one in a string or a comment is taken for a mention too,
 * which only costs a copy that is not read. A query that does not name a view cannot read one.
 */
export function viewsMentionedIn(sql: string): readonly PublicView[] {
    const text = sql.toLowerCase();
    return PUBLIC_VIEWS.filter(({ name }) =>
        new RegExp(`(?<![a-z0-9_])${name}(?![a-z0-9_])`).test(text)
    );
}

/**
 * When each kind of metadata was downloaded (epoch milliseconds), read from the attached database
 * in the same snapshot as the copies, so the time belongs to the rows the query sees. A kind with
 * no row has not been downloaded, which only a deletion between the check and the copy explains.
 */
export function fetchedAtOf(
    db: DatabaseSync,
    kinds: readonly MetadataKind[]
): Partial<Record<MetadataKind, number>> {
    const select = db.prepare(`SELECT fetched_at FROM ${REAL_SCHEMA}.meta_state WHERE source = ?`);
    const found: Partial<Record<MetadataKind, number>> = {};
    for (const kind of kinds) {
        const row = select.get(SOURCE_OF_KIND[kind]) as { fetched_at: number } | undefined;
        if (!row) {
            throw new CliError(
                "INTERNAL",
                `${SOURCE_LABELS[SOURCE_OF_KIND[kind]]}刚才还在，现在读不到了`
            );
        }
        found[kind] = row.fetched_at;
    }
    return found;
}
