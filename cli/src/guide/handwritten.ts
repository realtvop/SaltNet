/**
 * The parts of `saltnet guide` that are written by hand (design 6.1). The command reference, the
 * exit codes, the error and warning codes and the list of views are generated from the registry
 * and the code tables by `guide/markdown.ts`, so they cannot disagree with the behavior.
 *
 * Phase 1 only knows the catalog; scores, sync, credentials, the glossary and `guide --skill` join
 * in later phases (P4-4 finishes this text). Commands meant to be run are written in ```bash
 * blocks, because the end-to-end test runs every line of those blocks.
 */

export const GUIDE_TITLE = "saltnet 使用指南";

/** Comes right after the title. */
export const GUIDE_INTRO: readonly string[] = [
    "saltnet 是舞萌 DX（国服）的命令行工具，给 agent 用：查曲目、谱面、收藏品、段位和万花筒。数据存在本机（默认在 `~/.saltnet`，用环境变量 `SALTNET_HOME` 改），曲库和收藏品过期时会自动重新下载。",
    "",
    "每条命令在 stdout 上只输出一份结果，默认是 JSON；出错时不管 `--format` 是什么都输出 JSON。例外：`--help` 和 `guide` 直接输出文本；`--format tsv` 成功时输出表格，meta 和警告写到 stderr，每行以 `#` 开头。下面的命令说明由命令注册表生成，和实际行为一致；要机器可读的说明（参数的类型和可选值、`data` 的 JSON Schema、可能出现的错误码），用 `saltnet schema` 和 `saltnet schema <命令>`。",
];

/** The rules an agent should follow, before the reference. */
export const GUIDE_RULES: readonly string[] = [
    "1. **先运行 `saltnet status`**：看数据目录在哪、曲库和收藏品是什么时候下载的、是不是已经过期。",
    "2. **找歌**：拿不准时先用 `saltnet search <文本>`，之后的调用都用输出里的曲目 id（`musicId`）和谱面 key（`chartKey`，例如 `834-4`）。遇到 `AMBIGUOUS_REF` 时，能从上下文判断就从 `error.candidates` 里选一个 `ref` 重试；判断不了就问用户（比如有两首「Link」）。标题是纯数字的歌（比如「39」）会被当成曲目 id，要先用 `search` 找。",
    '3. **读结果**：成功时是 `{"v":1,"ok":true,"command":…,"data":…,"meta":…,"warnings":[…]}`，失败时是 `{"v":1,"ok":false,"command":…,"error":{"code":…,"message":…,"retryable":…}}`。按退出码和 `error.code` 决定下一步，不要靠 `message` 的文字判断；带成绩的结果会在 `meta.user` 说明成绩属于谁，朋友的成绩要用 `--user` 指定；`warnings` 里的 `STALE_METADATA`、`STALE_SCORES`、`NO_SCORES` 和 `PARTIAL_SCORES` 等提醒都要转告用户。',
    "4. **省 token**：列表很长时用 `--fields` 只要需要的字段（点号表示嵌套，例如 `chartKey,title,constant`），或者用 `--format tsv`；用 `--limit`、`--offset` 翻页，`meta.page.nextOffset` 为 null 表示没有下一页；问数量时用 `charts --stats` 或 `charts --group-by`，不要拉完整列表再自己数；复杂的问题用 `sql`，视图的列用 `saltnet schema --views` 看。",
    "5. **数据新旧**：`meta.dataAsOf` 是用到的数据各自的下载时间。曲库和收藏品过期时会自动重新下载，下载失败就用缓存并带 `STALE_METADATA` 警告；`--offline` 不联网、只用缓存，没有缓存时报 `OFFLINE_NO_CACHE`；要马上更新就运行 `saltnet refresh`。",
];

/** What to do on each exit code other than 0, shown next to its meaning (design 4.6, 6.1). */
export const EXIT_CODE_ADVICE: Readonly<Record<number, string>> = {
    1: "把 `error.message` 原样告诉用户，不要自动重试；如果它说的是数据目录的问题（权限、磁盘空间、数据库损坏），按它的建议处理",
    2: "命令写错了：看 `error.message` 和 `error.candidates` 改正后再运行",
    3: "从 `error.candidates` 里选一个 `ref` 重试；选不出来就问用户",
    4: "去找用户处理（扫码、重新授权、绑定）",
    5: "看 `error.retryable` 决定要不要重试",
    6: "把预览原样给用户看，用户明确同意后再带上确认码重新运行；不能替用户确认",
    7: "稍后再试",
};
