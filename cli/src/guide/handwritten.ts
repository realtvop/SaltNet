/**
 * The parts of `saltnet guide` that are written by hand (design 6.1): the introduction, the rules,
 * where the usual questions are answered and the words players use. The command reference, the
 * exit codes, the error and warning codes and the list of views are generated from the registry
 * and the code tables by `guide/markdown.ts`, so they cannot disagree with the behavior.
 *
 * The end-to-end test runs every line of the guide's ```bash blocks, which hold the generated
 * examples. The hand-written parts name commands in inline code only; a test parses each complete
 * one with the real parser, so a misspelled command or option fails it.
 */

export const GUIDE_TITLE = "saltnet 使用指南";

/** The frontmatter of `guide --skill`: the skill's name, and when an agent should use it. */
export const SKILL_NAME = "saltnet";
export const SKILL_DESCRIPTION =
    "用户问到舞萌 DX（国服）的成绩、曲目、谱面、B50、rating、牌子和其他收藏品、段位或万花筒，或者要更新成绩、绑定账号、导入导出备份时使用。用本机的 saltnet 命令查询和操作。";

/** Comes right after the title. */
export const GUIDE_INTRO: readonly string[] = [
    "saltnet 是舞萌 DX（国服）的命令行工具，给 agent 用：查曲目、谱面、收藏品、段位和万花筒，看本机用户的成绩、B50、rating 和成绩变化，从舞萌、水鱼或落雪同步成绩，管理用户、账号绑定、收藏夹和备份。数据存在本机（默认在 `~/.saltnet`，用环境变量 `SALTNET_HOME` 改），曲库和收藏品过期时会自动重新下载。",
    "",
    "每条命令在 stdout 上只输出一份结果，默认是 JSON；出错时不管 `--format` 是什么都输出 JSON。例外：`--help` 和 `guide` 直接输出文本；`--format tsv` 成功时输出表格，meta 和警告写到 stderr，每行以 `#` 开头。下面的命令说明由命令注册表生成，和实际行为一致；要机器可读的说明（参数的类型和可选值、`data` 的 JSON Schema、可能出现的错误码），用 `saltnet schema` 和 `saltnet schema <命令>`。",
];

/** The rules an agent should follow, before everything else. */
export const GUIDE_RULES: readonly string[] = [
    "1. **先运行 `saltnet status`**：看有哪些用户、哪一位是默认用户、曲库和收藏品是什么时候下载的、每个用户的成绩有多新、凭据还能不能用。还没有用户时，成绩类的命令都报 `NO_USER`：请用户用 `user add` 添加，或者用 `import` 导入网页端的备份。",
    "2. **找歌**：拿不准时先用 `saltnet search <文本>`，之后的调用都用输出里的曲目 id（`musicId`）和谱面 key（`chartKey`，例如 `834-4`）。遇到 `AMBIGUOUS_REF` 时，能从上下文判断就从 `error.candidates` 里选一个 `ref` 重试；判断不了就问用户（比如有两首「Link」）。标题是纯数字的歌（比如「39」）会被当成曲目 id，要先用 `search` 找。",
    '3. **读结果**：成功时是 `{"v":1,"ok":true,"command":…,"data":…,"meta":…,"warnings":[…]}`，失败时是 `{"v":1,"ok":false,"command":…,"error":{"code":…,"message":…,"retryable":…}}`。按退出码和 `error.code` 决定下一步（见「退出码」一节），不要靠 `message` 的文字判断。`error.fix` 是建议的下一步，多数是一条照原样就能运行的命令。`warnings` 里的提醒（`STALE_METADATA`、`STALE_SCORES`、`NO_SCORES`、`PARTIAL_SCORES` 等）都要转告用户。',
    "4. **看清是谁的成绩**：带成绩的结果在 `meta.user` 里写明是哪位用户。不写 `--user` 时用默认用户；用户问到朋友时，用 `--user <序号、uid 或名字>` 指定（`saltnet user list` 列出所有用户），不要把朋友的成绩当成用户自己的。",
    "5. **省 token**：列表很长时用 `--fields` 只要需要的字段（点号表示嵌套，例如 `chartKey,title,score.rank`），或者用 `--format tsv`；用 `--limit`、`--offset` 翻页，`meta.page.nextOffset` 为 null 表示没有下一页。问数量时用 `charts --stats` 或 `charts --group-by <分组依据>`，不要拉完整列表再自己数；复杂的问题用 `sql`，视图的列用 `saltnet schema --views` 看。",
    "6. **数据新旧**：`meta.dataAsOf` 是用到的数据各自的时间。曲库和收藏品过期时会自动重新下载，下载失败就用缓存并带 `STALE_METADATA` 警告；`--offline` 不联网、只用缓存，没有缓存时报 `OFFLINE_NO_CACHE`；要马上更新就运行 `saltnet refresh`。成绩不会自己更新：看到 `STALE_SCORES` 或 `NO_SCORES` 就告诉用户，用户同意后再运行 `sync`。不要主动同步：同步可能要用户扫码登录舞萌账号，成功后还会把成绩上传到绑定的水鱼和落雪账号（加 `--no-upload` 就不上传）。",
    "7. **凭据**：二维码、水鱼的 Import-Token 和落雪授权后的回调链接只通过 stdin 传入（`--qr -`、`df-token -`、`--callback -`），不要写进命令行参数，也不要在回复里复述。二维码几分钟就过期，要用的时候再向用户要。不要读或改数据目录里的 `credentials.json`。",
    "8. **确认**：删除用户、删除收藏夹、导入备份这类会删除或替换本机数据的命令，不带确认码时只返回预览，退出码是 6。把 `error.preview` 原样给用户看，用户明确同意后再运行 `error.fix`（它带着确认码）；不能替用户确认，也不要自己拼确认码。这期间数据变了，确认码就会失效（`error.codeRejected` 为 true），这时把新的预览再给用户看。",
];

/** Where the questions players ask most often are answered (design 6.1), as Markdown list items. */
export const GUIDE_QUESTIONS: readonly string[] = [
    "- 「某首歌打得怎么样」：`saltnet song <标题或曲目 id>` 列出它的所有谱面和成绩；只看一张谱用 `chart <谱面 key>`，或者曲目加难度，例如 `chart 834 mas`。",
    "- 「我的 B50」「现在多少分」：用 `b50` 和 `rating`。`b50 --mode fit` 换成拟合 B50，其他模式见术语；`rating --history` 是 rating 的历史。B50 的分组和总 rating 只能用这两个命令，不要把 `charts` 按 rating 排序后自己截取或求和，`charts` 的排序不是网页端 B50 的选谱规则。",
    "- 「该推哪首」「推哪首涨分多」：先 `charts --sort gain --limit 10` 找候选，再用 `chart <谱面> --with stages` 看每个阶段能涨多少。涨分以这位用户的普通 B50 为基准，并假定其他谱面的成绩不变。",
    "- 「打到多少能有多少 rating」「要多少达成率才能到某个 rating」：用 `calc`，或者读 `chart <谱面> --with stages` 的阶段表；不要自己用公式推算或估算。",
    "- 「熊極还差什么」：`charts --plate 熊極 --missing`，或者 `collection show <收藏品>`。`--missing` 不写条件时，按每张谱自己的收藏品要求判断。`collection list` 和 `collection show` 的 `progress` 和网页端一样按要求的谱面计数，没有指定难度的条件每首歌只计一次。",
    "- 「最近进步了什么」：`history --since 7d`。成绩发生过什么变化都读 `history`，不要比较两次 `charts` 的输出来推断。",
    "- 「鸟加有多少张」「13+ 打了多少」：`charts --level 13+ --stats` 给出总数、打过的、SSS、SSS+、FC、AP 和 FDX 的数量；按评级数用 `charts --group-by rank --limit 1 --fields chartKey`，每组的 `count` 就是数量。不要拉完整列表再数。",
    "- 「万花筒现在什么情况」：`kaleidxscope`；某一扇门的血量日历、钥匙曲目和曲池用 `kaleidxscope <门>`。",
    "- 「段位有哪些歌」：`course list`，某个段位的曲目用 `course show <段位>`。",
    "- 收藏夹：收藏夹只保存在本机（不在备份里），按曲目收藏；`charts --fav <收藏夹> --diff <难度>` 列出其中的谱面，用 `fav` 下的命令管理。",
    "- 「更新一下成绩」：用户同意后运行 `sync`，它会自己选数据来源；拿不准会发生什么时先用 `sync --dry-run`，它只说会用哪个来源、会不会上传，什么都不做。要扫码时返回 `QR_REQUIRED`（退出码 4）：向用户要玩家二维码（扫码得到的文字或链接都可以），通过 stdin 传给 `sync --qr -`。「全部更新」用 `sync --all`：按顺序同步每个没开手动更新的用户，舞萌账号只做不扫码的快速更新；有用户失败时命令仍然成功，失败的人写在各自的结果和 `SOME_FAILED` 警告里。",
    "- 「绑定水鱼」「绑定落雪」：水鱼用 `user bind <用户> df-token -`，Import-Token 从 stdin 传入；只读公开成绩时用 `user bind <用户> df-name <水鱼用户名>`。落雪分两步：`user bind <用户> lxns` 给出授权链接，用户在浏览器里同意后，把跳转到的回调链接通过 stdin 传给 `user bind <用户> lxns --callback -`。`<用户>` 写序号、uid 或名字，默认用户是 `0`。",
    "- 备份：`export <文件>` 导出成网页端能导入的备份，`import <文件>` 导入网页端的备份（会替换本机的用户和成绩，要确认）；`ingame backup <文件>` 导出游戏格式的备份。",
];

/** What players call things, and where saltnet shows them (design 6.1): rows of a Markdown table. */
export const GUIDE_GLOSSARY: readonly (readonly [string, string, string])[] = [
    [
        "绿谱、黄谱、红谱、紫谱、白谱、宴谱",
        "BASIC、ADVANCED、EXPERT、MASTER、Re:MASTER，以及宴会场（UTAGE）的谱面",
        "`difficulty`；`--diff` 和难度参数也接受 `绿`、`紫`、`白`、`mas`、`rem` 这些写法",
    ],
    [
        "等级、定数",
        "等级是 13+ 这样的粗略难度；定数是精确到 0.1 的难度，例如 13.7，rating 按它算",
        "`level`、`constant`；`--level`、`--constant`",
    ],
    ["拟合定数", "水鱼按玩家成绩统计出的实际难度", "`fitConstant`；`b50 --mode fit`"],
    [
        "鸟、鸟加",
        "评级 SSS（达成率 100% 以上）和 SSS+（100.5% 以上）",
        "`score.rank` 是 `SSS`、`SSS+`",
    ],
    ["理论值", "达成率 101%，所有判定都是 CRITICAL PERFECT", "`score.achievements` 是 101"],
    ["AP、AP+、FC、FC+", "ALL PERFECT、ALL PERFECT+、FULL COMBO、FULL COMBO+", "`score.combo`"],
    ["FS、FS+、FDX、FDX+", "多人一起打时的同步状态 FULL SYNC、FULL SYNC DX", "`score.sync`"],
    [
        "单曲 rating、底分",
        "一张谱贡献的 rating；底分是 B50 一组里最低的单曲 rating，新成绩要超过它才能进 B50",
        "`score.rating`；`b50` 每组的最后一张",
    ],
    [
        "B50、B35、B15",
        "计入总 rating 的 50 张谱：旧版本歌曲里最好的 35 张，加上当前版本新歌里最好的 15 张",
        "`b50` 的两组；`rating`",
    ],
    [
        "拟合 B50、AP50、FC50、PC50、牛逼 50",
        "网页端 B50 页的其他模式",
        "`b50 --mode fit`，以及 `ap`、`fc`、`pc`、`nb`",
    ],
    ["推分", "提高总 rating", "`charts --sort gain`、`chart <谱面> --with stages`"],
    [
        "DX 分、星",
        "DX 分数，以及按它占满分的比例算出的 0 到 5 星",
        "`score.dxScore`、`score.dxStars`",
    ],
    ["PC", "游玩次数", "`score.playCount`；`b50 --mode pc`"],
    [
        "牌子",
        "版本牌子，要求一个版本的全部谱面：極是都 FC，将是都 SSS，神是都 AP，舞舞是都 FDX，例如「熊極」",
        "`--plate`；`collection list --kind plate`",
    ],
    ["段位", "段位认定：按顺序打的四首课题曲和血量规则", "`course`"],
    ["万花筒", "KALEIDXSCOPE 活动的各扇门：开门条件、钥匙曲目、曲池和血量规则", "`kaleidxscope`"],
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
