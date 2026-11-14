# SaltNet CLI 实现计划

- 日期：2026-11-10
- 分支：`feat/saltnet-cli`
- 依据：[设计文档](./2026-11-10-saltnet-cli-design.md)（验收标准，以它为准）和仓库根目录的 `AGENTS.md`
- 范围：`shared/core/` 抽取、新包 `cli/`（命令名 `saltnet`）；P0 到 P4 全部做完，不 push，不开 PR

## 怎么用这份计划

- **一步一个 commit**。每个 commit 里同时勾掉本文件对应的复选框（`- [ ]` 改成 `- [x]`），代码和勾选在同一个 commit 里。
- 被打断或上下文被压缩之后：先读本文件和 `git log --oneline`，**第一个没勾的步骤就是下一步**，不要凭记忆继续。
- 计划可以调整（拆分、合并、补步骤），但每次调整都要在文末「实现中的决定」里写明原因。设计文档里已经确认的决定不推翻；设计确实有错或做不到，就在同一个 commit 里改设计文档，并在「实现中的决定」里说明。
- 设计文档「待确认」里的事项：按设计给的默认值实现，相关取值做成可配置，实测留给用户（见 P3 和最终报告）。

## 通用规则

**每个 commit 都要满足**

- Conventional Commits，范围收窄，例如 `refactor(core): move SaltMeta conversion to shared/core`、`feat(cli): add charts filters`、`test(cli): cover ref resolution`。
- `pnpm check`、`pnpm lint` 通过；所有 `test:*` 通过；`render-service` 的 `test` 和 `check` 通过；`cli/` 建好之后它自己的测试和类型检查也要通过。
- 改了网页端代码的 commit 还要通过 `pnpm build`。
- 搬模块的 commit 同时更新 `AGENTS.md` 的模块索引、`test:*` 脚本里的路径和 `.prettierignore` 里的 JSON 路径。
- 每一期结束时再整体检查一遍 `AGENTS.md`（新包、模块路径、命令、测试）。

**`shared/core` 的硬约束**

- 不依赖 Vue、MDUI、localForage、`import.meta.env`、DOM，不从 `src/` 引用任何东西。
- 内部 import 全部用相对路径，不用 `@/` 别名（和已有的 `shared/rendering/` 一样）。
- 机器检查：`shared/core/tsconfig.json` 不带 DOM 库，接进 `pnpm check`；ESLint 用 `no-restricted-imports` 禁止 `vue`、`mdui`、`localforage` 和 `@/`。
- 网页端行为必须与改动前完全一致。搬页面里的查询逻辑之前，先用固定数据把它当前的输出存成快照；搬完之后快照必须原样通过。

**开发与测试约束**

- 开发和测试时一律把 `SALTNET_HOME` 指到临时目录，不读写 `~/.saltnet`。
- 公开的只读元数据接口（SaltMeta、落雪收藏品列表）可以真实请求来验证；凡是要用账号凭据或二维码、会写入第三方、会改动舞萌账号的操作，一律只用模拟 HTTP 测试。
- 不提交打包产物和任何 token，不碰 `.wrangler/`，不输出 `.env` 里的值；不做全局链接，不往 `~/.claude/skills` 里装东西。
- 固定数据（SaltMeta 裁剪版、落雪收藏品、v1 备份、各接口返回样例）全部脱敏，不含真实 token 和真实用户标识。

**网页端检查**（P0 和之后每个动了网页端的阶段）：用浏览器工具实际打开受影响的页面（曲目页、谱面弹窗、B50、收藏品页、用户页），包括浏览器前进/后退；做不到的列进最终报告让用户自己看。

## 步骤

### S0 准备

- [x] S0-1 `docs(cli): add saltnet cli design spec`
- [x] S0-2 `docs(cli): add saltnet cli implementation plan`
- [x] S0-3 `chore(lint): make eslint runnable and freeze existing violations`：基线上 `pnpm lint` 因缺少 `eslint-plugin-format` 无法运行；补上之后有 2.6 万条存量违规，用 ESLint 的批量抑制（`eslint-suppressions.json`）冻结，使 `pnpm lint` 能作为每个 commit 的检查项，且新增的违规会失败（见「实现中的决定」第 1 条）

### P0 抽 core（P1 需要的部分）

完成标准：网页端行为不变，各项检查全部通过，`AGENTS.md` 的模块索引已更新。后面几期各自开头再抽它们要用的模块（P2-0、P3-0）。

**脚手架**

- [x] P0-1 `build(core): add shared/core scaffold with dom-free typecheck and import guard`
    - `shared/core/tsconfig.json`：不带 DOM 库，也不带 node 类型，接进 `pnpm check`
    - `eslint.config.js`：`shared/core/**` 下禁止 import `vue`、`mdui`、`localforage`、`@/`（以及 `vue-router`、`pinia`、`node:*`、指向 `src/` 的相对路径）
    - 网页端引用 core 用的 `@core/*` 别名（vite、tsconfig）
    - 在临时探针文件里确认 `window`、`import.meta.env`、`import "vue"` 都会被拦住（探针不提交）

**直接搬纯逻辑**（`git mv`，改网页端 import，测试和 `test:*` 脚本路径跟着走；顺序按依赖关系排，见「实现中的决定」第 9 条）

- [x] P0-2 `refactor(core): move mai enums, in-game types and collection types to shared/core`
- [x] P0-3 `refactor(core): move music and diving-fish types to shared/core`
- [x] P0-4 `refactor(core): move chart difficulty and identity to shared/core`
- [x] P0-5 `refactor(core): move music search index and SaltMeta conversion to shared/core`（`test:music-search`；`search.test.ts` 要用 `saltmeta.ts` 造数据，所以两个模块一起搬，见第 11 条）
- [x] P0-6 已并入 P0-5
- [x] P0-7 `refactor(core): move recent chart ordering to shared/core`（`test:recent`）
- [x] P0-8 `refactor(core): move course data to shared/core`（`test:course`）
- [x] P0-9 `refactor(core): move kaleidxscope data to shared/core`（`test:kaleidxscope`）
- [x] P0-10 `refactor(core): move version plate logic to shared/core`

**拆混合模块**

- [x] P0-11 `refactor(core): split SaltMeta fetching from music cache and vue state`：拉取与校验进 core（地址由 `CoreConfig` 传入），IndexedDB 缓存、Vue 状态、提示条留在网页端
- [x] P0-12 `refactor(core): split collection mapping and lxns fetching from vue state`：落雪收藏品的拉取和数据映射（连同 `lxns/type.ts`）进 core，缓存和 Vue 数组留在网页端（`test:collection-index`）
- [x] P0-13 `refactor(core): extract related collection index builder`：纯索引构建进 core，`shallowRef` 包装留在网页端

**曲目页的查询逻辑 → `core/query`**

- [x] P0-14 `refactor(songs): extract page query helpers into a module without behavior changes`：只做原样搬动，不改一行逻辑，用网页端实测对照
- [x] P0-15 `test(query): snapshot songs query helpers with fixed data`：筛选、排序、分组、统计在固定数据上的现状快照（新增脚本 `test:query`）
- [x] P0-16 `refactor(core): move songs query helpers to shared/core/query`：快照不改动，原样通过

**收尾**

- [x] P0-17 `docs: update agents guide for shared/core`：整理 `AGENTS.md` 的结构说明、命令和测试；网页端实测（曲目页、谱面弹窗、收藏品页，含前进/后退），结论记入「实现中的决定」

### P1 骨架和曲库

完成标准：首次刷新之后，即使离线也能回答曲库方面的问题。

- [x] P1-1 `build(cli): scaffold saltnet-cli workspace package`：`cli/` 包、esbuild 打包到 `cli/dist/saltnet.mjs`、`bin`、Vitest、类型检查；根脚本 `test:cli`、`build:cli`，`pnpm check` 带上 cli 的类型检查；`.gitignore` 和 `.prettierignore` 加上 `cli/dist`
- [x] P1-2 `feat(cli): add runtime paths and config loading`：`SALTNET_HOME`、`config.json`、环境变量覆盖、构建时从网页端 `.env` 带入默认值（后端主备地址、渲染服务地址、落雪 client id）
- [x] P1-3 `feat(cli): add command registry and argument parser`：命令注册表、解析器、`--help`、未知参数返回 `USAGE`
- [x] P1-4 `feat(cli): add output envelope, error codes and formats`：外层结构、错误码与退出码、json/tsv/text、`--fields`、分页、stdout/stderr 约定
- [x] P1-5 `feat(cli): add sqlite store with migrations and locks`：`node:sqlite`、WAL、`user_version` 迁移、迁移前备份、锁
- [x] P1-6a `refactor(core): split saltmeta download from conversion and merge duplicate banquet songs`：core 里的准备工作：`fetchSaltMetaCompacted`/`buildSaltMetaMusicList`、`mergeDuplicateMusics`、`LXNSCollectionError`、落雪收藏品固定数据（见「实现中的决定」第 24 条，它也记着 P1-6c 的设计备忘）
- [x] P1-6b `feat(cli): add injectable fetch with deadline and error mapping`：`Io.fetch`、`ctx.http()`、统一的超时和 `NETWORK`/`UPSTREAM_ERROR` 错误映射、测试用的模拟网络（见「实现中的决定」第 25 条）
- [x] P1-6c `feat(cli): refresh catalog and collections into the store`：库表（迁移 2）、拉取 SaltMeta 和落雪收藏品并整体替换写入、原始快照存 `cache/`、`metadata` 锁、`refresh` 命令（`--offline` 报 `USAGE`）；合并上游重复的宴谱（见「实现中的决定」第 26 条；过期检查挪到了 P1-7）
- [x] P1-7a `feat(cli): load catalog from the store into core structures`：从 SQLite 还原成和网页端相同的内存结构（`loadMusic`、`loadCollections`），测试证明结果和 core 从同一份文档构建的逐项相等（见第 27 条）
- [x] P1-7b `feat(cli): write static courses and collections with the CLI version`：库里收藏品的 `kind` 改用设计里的六个名字，旅行伙伴、搭档和段位随 CLI 版本写入，数据一变就重写（迁移 3；万花筒不进库，见第 27、28 条）
- [x] P1-7c `feat(cli): refresh stale metadata before a command reads it`：过期检查 `ensureMetadata`（`metadata.maxAgeHours`、`STALE_METADATA`、`OFFLINE_NO_CACHE`、`builder` 变了时从快照重建；命令用 `useMetadata`，读库用一致的视图 `store.read`；设计见第 24、26、27 条，实现见第 29 条）
- [x] P1-8 `feat(cli): resolve song, chart and difficulty references`：引用解析、歧义与候选、数字标题、难度写法
- [x] P1-9a `refactor(core): tell which kind of variant a search text matched`：`createMusicSearchVariants` 把原文、拼音、罗马音分开给出，`createMusicSearchIndex` 的结果不变（见第 31 条）
- [x] P1-9b `feat(cli): add the search command`：曲目搜索、命中方式、排序；引用解析的最后一步改用同一个搜索
- [x] P1-9c `feat(cli): add song and chart commands`：谱面行、`song`、`chart`（成绩、吃分表和 `--with` 的其余取值留给 P2）
- [x] P1-10 `feat(cli): add charts filters`：level、constant、version、diff、search、utage 的筛选（`fav` 推到 P2-25，见第 34 条）
- [x] P1-11 `feat(cli): add charts sorting, grouping and paging`
- [x] P1-12 `feat(cli): add charts gate, course, plate and collection filters`
- [x] P1-13 `feat(cli): add course and kaleidxscope commands`
- [x] P1-14 `feat(cli): add collection list and show commands`（不含进度）
- [x] P1-14b `feat(cli): add song and chart --with related`：用到这首歌或这张谱的收藏品、段位和门（设计 3.2 里有，原计划漏了；见第 31 条）
- [x] P1-15 `feat(cli): add status and config commands`
- [x] P1-16 `feat(cli): add read-only sql views and sql command`：对外视图、只读连接、`setAuthorizer`
- [x] P1-16b `feat(cli): describe command data with JSON Schemas`：每条命令的 `data` 都有 JSON Schema（`CommandSpec.dataSchema`），用 `src/output/schema.ts` 的构造函数拼，共用的形状在 `src/catalog/schemas.ts`；测试用 Ajv 检查每条命令真实输出是否符合，注册表测试要求每条命令都有（设计 4.7 的「`data` 的 JSON Schema」，原计划放在 P1-17 里一起做，见第 42 条）
- [ ] P1-16c `build(lint): lint the cli output directories`：antfu 的默认忽略名单里有 `**/output`，所以 `pnpm lint` 一直没看过 `cli/src/output/` 和 `cli/tests/output/`（用 `eslint --no-ignore` 看是干净的）；改配置让它们进来，并删掉 `AGENTS.md` 里 `pnpm lint` 一条后面的提醒（见第 42 条）
- [ ] P1-17 `feat(cli): add schema and guide commands`：从注册表生成；`schema <命令>` 的 `data` 部分直接用每条命令的 `dataSchema`（第 42 条）；`schema --views` 列出 `PUBLIC_VIEWS` 里每个视图的说明、依赖的来源和各列，并给出 `VIEWS_VERSION`（`sql` 的说明和错误的 `fix` 已经指向它，见第 41 条）
- [ ] P1-18 `test(cli): add offline end-to-end test on the bundled artifact`：灌入固定数据，不联网跑一遍指南里的示例；接进 CI
- [ ] P1-19 `docs: update agents guide for cli phase 1`；用真实的公开接口做一次真实刷新来验证（临时 `SALTNET_HOME`）；顺带在真实数据上对照 `v_charts` 与 `chart` 的结果、量一下 `sql` 复制视图的耗时、看一下只读 `ATTACH` 有没有留下多余文件（见第 41 条）

### P2 本地成绩

完成标准：导入网页端备份后，B50、rating 和牌子进度都和网页端一致。

**P2-0 先抽这一期要用的模块**

- [ ] P2-1 `refactor(core): move user types, rating history and score lookup to shared/core`：`chart/scoreLookup.ts` 依赖 `user/type.ts`，所以和它一起搬；`chart/rating/` 也在这一步搬
- [ ] P2-2 `refactor(core): move score history diff, estimate and presentation to shared/core`（`test:score-history`）
- [ ] P2-3 `refactor(core): move backup codec, user identity and data migration to shared/core`
- [ ] P2-4 `refactor(b50): extract page query helpers into a module without behavior changes`
- [ ] P2-5 `test(query): snapshot b50 query helpers with fixed data`
- [ ] P2-6 `refactor(core): move b50 query helpers to shared/core/query`
- [ ] P2-7 `refactor(chart): extract chart info calculations into a module without behavior changes`：吃分表、B50 底分、涨分所需的计算
- [ ] P2-8 `test(query): snapshot chart info calculations with fixed data`
- [ ] P2-9 `refactor(core): move chart info calculations to shared/core/query`
- [ ] P2-10 `refactor(core): split chart position calculation from its localforage cache`
- [ ] P2-11 `refactor(core): move collection progress and ownership logic to shared/core`：`collections.vue`、`CollectionProgress.vue` 里的拥有状态和进度判断

**P2 的 CLI 部分**

- [ ] P2-12 `feat(cli): add user and score tables with read-only views`：迁移 2；对外视图加上 `v_scores`、`v_score_events`、`v_rating_history`、`v_user_items`，`v_charts` 加上默认用户的成绩列（只加列不改名，`VIEWS_VERSION` 加一；用户数据怎么进沙盒见第 41 条）
- [ ] P2-13 `feat(cli): add user repository on top of the store`
- [ ] P2-14 `feat(cli): add confirmation codes for destructive commands`：预览、确认码、退出码 6
- [ ] P2-15 `feat(cli): add user management commands`：`user list/show/add/edit/remove/default`；`status` 同时加上 `users`（用户列表和各用户的成绩更新时间），P1-15 的 `status` 还没有用户
- [ ] P2-16 `feat(cli): add backup import and export`：v0/v1、凭据拆分、`--keep-lxns`、`FILE_EXISTS`
- [ ] P2-17 `test(cli): cover backup round trip with a web v1 fixture`
- [ ] P2-18 `feat(cli): add scores to song, chart and charts output`：谱面行、`--user`、`STALE_SCORES`、`NO_SCORES`、`PARTIAL_SCORES`
- [ ] P2-19 `feat(cli): add charts score filters, stats and score grouping`：`--achieved`、`--missing`、`--recent`、`--stats`、按成绩排序和分组
- [ ] P2-20 `feat(cli): add b50 and rating commands`
- [ ] P2-21 `feat(cli): add history command`
- [ ] P2-22 `feat(cli): add calc command and chart stages`：阶段表、`chart --with`
- [ ] P2-23 `feat(cli): add b50 gain to stages and charts --sort gain`
- [ ] P2-24 `feat(cli): add collection progress to collection and charts`
- [ ] P2-25 `feat(cli): add fav commands`：`favorites` 表（迁移）、`fav` 命令和 `charts --fav`（后者从 P1-10 挪来，见第 34 条）；对外视图加上 `v_favorites`（`VIEWS_VERSION` 再加一）
- [ ] P2-26 `test(cli): extend offline end-to-end test with scores`
- [ ] P2-27 `docs: update agents guide for cli phase 2`；对照验证：同一份备份，CLI 的 B50、rating、牌子进度与网页端逻辑的结果逐项一致（并在浏览器里打开网页端对照）

### P3 同步和绑定

完成标准：不打开网页端，也能完成「绑定 → 同步 → 查询」；落雪二次授权的问题有了结论（需要用户实测，所以只能做到「流程实现、取值可配置、列入手动测试清单」）。凡是涉及凭据和账号的地方都只用模拟 HTTP 测试。

**P3-0 先抽这一期要用的模块**

- [ ] P3-1 `refactor(core): move diving-fish client to shared/core with injected config`
- [ ] P3-2 `refactor(core): move lxns client, token and upload to shared/core`（`test:oauth`）
- [ ] P3-3 `refactor(core): move saltnet backend client to shared/core with injected urls`
- [ ] P3-4 `refactor(core): extract sync fetching and merging from the update worker`：进度走回调，不再调提示条；worker 只剩消息收发
- [ ] P3-5 `refactor(core): split lxns oauth flow from browser session handling`：PKCE、授权链接、回调校验、换 token 进 core

**P3 的 CLI 部分**

- [ ] P3-6 `feat(cli): add credentials file and http client`：`credentials.json` 0600、原子写入；超时、只读请求重试一次、`saltnet-cli/<版本>` UA、主备地址切换
- [ ] P3-7 `feat(cli): add sync_runs journal and sync locks`
- [ ] P3-8 `feat(cli): add sync from diving-fish and lxns`：水鱼 Import-Token、水鱼用户名（含公开 B50）、落雪；写入事务
- [ ] P3-9 `feat(cli): add in-game sync with qr and fast update`：全量、快速更新、补全、`QR_REQUIRED`/`QR_INVALID`
- [ ] P3-10 `feat(cli): upload synced scores to diving-fish and lxns`：`UPLOAD_FAILED`、`--no-upload`
- [ ] P3-11 `feat(cli): add sync --all and --dry-run`
- [ ] P3-12 `feat(cli): add user bind and unbind for in-game, diving-fish tokens and names`
- [ ] P3-13 `feat(cli): add lxns two-step bind`：授权记录、回调链接、暂存 token、`--callback -`
- [ ] P3-14 `feat(cli): serialize lxns token refresh across processes`：锁、重读、原子写、`invalid_grant`、`LXNS_REAUTH_REQUIRED`、`LXNS_EXPIRING`（由 `status` 给出；同一步给 `status` 加上凭据状态：有没有、是否过期，按本地记录判断，不联网也不输出凭据本身）
- [ ] P3-15 `feat(cli): confirm identity changes on bind and qr sync`：`hasStrongIdentityChanged`；「二维码属于另一个账号」的处理做成配置项
- [ ] P3-16 `test(cli): cover sync and bind flows with mocked http`：四种来源、全量与快速、上传成败、`invalid_grant`、两个进程同时刷新、撞锁、token 不出现在任何输出里
- [ ] P3-17 `docs: update agents guide for cli phase 3`

### P4 账号操作和收尾

完成标准：网页端能做的事 CLI 都能做（nearcade 除外）。

- [ ] P4-1 `feat(cli): add ingame check-login and clear-tickets`：`clear-tickets` 要确认；只用模拟 HTTP 测试
- [ ] P4-2 `feat(cli): add ingame backup export`：游戏格式的备份文件，`FILE_EXISTS`/`--overwrite`
- [ ] P4-3 `feat(cli): add b50 --image through the render client`：复用 `shared/rendering`
- [ ] P4-4 `feat(cli): finish agent guide and skill output`：手写部分、`guide --skill`
- [ ] P4-5 `test(cli): run every guide example in the end-to-end test`
- [ ] P4-6 `docs: finish agents guide and cli notes`：`AGENTS.md` 终稿、安装与全局链接的说明
- [ ] P4-7 最终全量检查（不产生 commit，结果写进最终报告）：`pnpm check`、`pnpm lint`、`pnpm build`、全部 `test:*`、`render-service` 测试、`cli` 测试与端到端

## 实现中的决定

按发生顺序追加。每条写清「决定了什么、为什么」；改了设计文档的，要标出来。

1. **lint 基线**：`pnpm lint` 在基线上无法运行——`@antfu/eslint-config` 的 `formatters` 选项需要 `eslint-plugin-format`，仓库没装；交互环境下只弹出安装提示，非交互环境下报 `ERR_MODULE_NOT_FOUND`。CI 只跑 `pnpm run check`，所以一直没发现。S0-1、S0-2 两个纯文档 commit 在 lint 修好之前就已经提交，没能跑 lint。S0-3 的做法：
    - 补上 `eslint-plugin-format` 开发依赖。补上之后全仓库有约 2.6 万条错误，绝大部分是 ESLint 的格式规则和 Prettier 的输出互相打架（缩进、逗号、JSON 键间距、Vue 模板缩进等），分布在 150 多个文件里；这是存量问题，不是这次改动造成的，也不适合在一个重构里批量改。
    - 用 ESLint 9 自带的批量抑制冻结存量：`eslint-suppressions.json` 按文件和规则记录当前的违规数，`pnpm lint` 因此能通过，而新增的违规仍会失败。ESLint 不会对不再出现的抑制项放行，所以修掉存量或搬动文件后要同步这个文件（做法写在 `AGENTS.md`）。
    - 顺带把 `eslint.config.js` 里的 `*.md` 忽略改成 `**/*.md`（原写法只忽略根目录的 Markdown，`docs/` 下 Markdown 里的代码块会产生无法抑制的解析错误），并忽略本机的 `.claude/`。
    - 新目录（`shared/core/`、`cli/`）里 ESLint 的格式规则和 Prettier 仍会冲突（例如 `else` 的换行），所以建这些目录时给它们单独关掉由 Prettier 负责的格式规则，其余规则照常生效、新代码必须零违规。
2. **core 的类型环境**：`shared/core/tsconfig.json` 用 `lib: ["ES2023", "WebWorker"]` 加 `types: []`。这样没有 `window`、`document`、`localStorage` 等 DOM 全局，也没有 node 类型，但 `fetch`、`URL`、`TextEncoder` 这些 Web 标准全局还在（core 要联网，必须有）。`import.meta.env` 因为没引 vite 的类型也会报错。
3. **网页端引用 core 的别名**：新增 `@core/*` → `shared/core/*`（vite 和 tsconfig），只给 `src/` 用，避免十几层 `../`。core 内部仍然只用相对路径。
4. **目录**：`maiTypes.ts` 放 `shared/core/mai/types.ts`（设计文档的目录图没列 `mai/`，属于补充）；`inGame.ts` 是游戏里的用户数据类型，放 `shared/core/user/inGame.ts`。
5. **分期抽取**：按设计文档 6.3 的「P0 可以拆开做」，P0 只抽 P1 要用的模块，外加曲目页里全部的纯查询逻辑（同一个文件，一次读完一次搬完，CLI 在 P1 用不带成绩的部分，P2 再用带成绩的部分）。用户、成绩历史、B50、阶段表、同步、各接口的客户端留到对应期的 P2-0、P3-0。
6. **页面逻辑的快照**：页面里的函数不能直接 import，所以每处都分三个 commit：先原样搬出成模块（不改逻辑，用网页端实测对照），再对这个模块写快照，最后搬进 `core/query`，快照原样通过。
7. **宴谱重复条目只在 CLI 里合并**：网页端行为不变，合并函数放在 core 里供 CLI 显式调用。
8. **设计文档「待确认」的默认做法**：
    - 落雪 client id：默认和网页端相同，`config.json` 可改（`lxns.clientId`）
    - 落雪 refresh token 有效期按 30 天算，到期前 3 天提示，两个值可配置
    - UA 默认 `saltnet-cli/<版本>`，可在 `config.json` 里改
    - 重复宴谱：CLI 里合并，并在 `status` 里列出
    - 二维码属于另一个账号：默认和网页端一致（改写游戏 id），做成配置项，可改成报错
9. **P0 的搬迁顺序按依赖排**：`inGame.ts` 依赖 `collection/type.ts`，`music/type.ts` 依赖水鱼的类型，`saltmeta.ts` 依赖 `search.ts` 和 `difficulty.ts`，所以先搬 `mai/`、`collection/type`、`inGame`，再搬音乐类型和水鱼类型，然后是 `difficulty`、`search`、`saltmeta`。`chart/scoreLookup.ts` 依赖 `user/type.ts`（P2 才搬），`chart/rating/` 也只有 P2 用得到，这两个挪到 P2-1。步骤因此重新编号。
10. **import 搬动后的 lint 基线**：路径改写会让文件里 import 的位置变化，已经有存量 import 排序违规的文件，违规数可能多 1 到 2（`perfectionist/sort-imports`），Prettier 因路径变长而折行也会让 `style/indent` 的数目增加。这类只在原本就违规的文件里增加的计数，随搬迁 commit 一起更新 `eslint-suppressions.json`；原来没有违规的文件则必须改到零违规。`package.json` 的 `jsonc/indent`（ESLint 要 2 空格，Prettier 要 4 空格）也是这种存量冲突，每新增一个 `test:*` 脚本行就多 1 条，同样随 commit 更新基线。绝不在存量文件上跑 `eslint --fix`（会把整份 Vue 文件按 ESLint 的缩进规则重排，和 Prettier 冲突）。
11. **P0-5 和 P0-6 合并**：`music/search.test.ts` 依赖 `saltmeta.ts`，而 `saltmeta.ts` 又依赖 `search.ts`，拆开搬会让其中一个 commit 里的 core 模块反向依赖 `src/`，所以搜索索引和 SaltMeta 转换放在同一个 commit 里搬。
12. **core 的注入点（P0-11）**：设计文档只说「地址由 `CoreConfig` 传入」，具体做成：
    - `shared/core/config.ts` 的 `CoreConfig` 目前只有 `saltMetaUrl`，后面每搬一个要用地址的集成就加一个字段；缺省值在 `DEFAULT_CORE_CONFIG`，`resolveCoreConfig()` 逐字段回退，所以网页端什么都不用传，CLI 用 `config.json`/环境变量覆盖。
    - `shared/core/http.ts` 的 `FetchLike` 只声明 core 真正用到的那一小块 `fetch`（method、headers、body、`cache: "no-store"`；返回 `ok`、`status`、`json()`、`text()`），而不是直接写 `typeof fetch`：这样网页端的 DOM 类型、core 自己的 WebWorker 类型和 CLI 的 node 类型下都能通过，测试里也能直接传一个普通函数。默认用全局 `fetch`。
    - 拉取函数对「预期内的失败」返回结果值而不是抛错或弹提示：`fetchSaltMetaMusicList()` 返回 `{ ok: true, value, compacted }` 或 `{ ok: false, failure: { kind: "http" | "version" | "error", … } }`。网页端的 `musicApi.ts` 保留原来的包装，原样输出同样的 `console.error` 和「立即升级」提示条；CLI 把 `compacted`（上游原始文档）写进 `cache/` 做离线快照。
    - `restoreCachedMusicData`（重建谱面到曲目的反向引用和 `chartList`）和 `MusicSort`（`sort.json`）是纯逻辑，一并进 core；IndexedDB 读写、Vue 的 `ref`/`reactive` 和当前地区判断留在网页端 `music/index.ts`。
    - 新增脚本 `test:music-data` 覆盖拉取（成功、HTTP 失败、版本不符、网络错误、自定义地址）和缓存还原。
13. **收藏品数据的拆分（P0-12）**：
    - `CoreConfig` 新增 `lxnsBaseUrl`（默认 `https://maimai.lxns.net`，只放源地址，末尾斜杠会被去掉），落雪的其他接口（用户数据、OAuth）搬进 core 时都用它拼地址。这样 P3 的模拟 HTTP 测试可以把它指到本地假服务器。
    - 落雪收藏品的映射（`mapLXNSCollections`）、形状校验（`isLXNSCollectionLists`）和版本牌子分类进 `shared/core/collection/map.ts`；旅行伙伴、搭档这类仓库里的静态数据（含 `additionalCollections.json`）进 `shared/core/collection/static.ts`，设计文档说它们要随 CLI 版本写入库。网页端的缓存校验仍要求 `cachedAt` 和 `metadataUpdatedAt`，只是列表部分的校验改为调用 core。
    - `fetchLXNSCollections` 保留原来的行为（失败时抛错，错误信息不变），网页端在原路径放一个不带参数的包装，仍传 `cache: "no-store"`，原有测试对 `@/components/integrations/lxns` 的 mock 不用改。这里没有像 SaltMeta 那样改成返回结果值，因为网页端只有一种处理方式（记日志并显示错误文案）。
    - 先在网页端的 `index.test.ts` 里补了「现状快照」（映射结果、各类 genre、版本牌子分组、从谱面反查收藏品），在旧代码上通过之后才动手拆，拆完原样通过。
    - `additionalCollections.json` 原来靠 `.prettierignore` 里的 `src/components/data/collection/*.json` 排除格式化，搬迁后改成具体路径（它是脚本生成的紧凑数据，不应被 Prettier 展开）；同时清掉已经没有 JSON 的 `src/components/data/music/*.json` 条目。ESLint 同样忽略这个文件（它原来在 `eslint-suppressions.json` 里有近 3000 条格式类存量违规，没有必要再记账）。
    - 存量违规随文件搬走：原 `fetchCollection.ts` 里 `unicorn/prefer-type-error` 的 1 条（为了保持错误类型不变，没有改成 `TypeError`）现在记在 core 的新文件上；`style/comma-dangle` 在 core 里关闭，所以原来的 3 条消失了。
14. **反向索引的拆分（P0-13）**：core 里是 `shared/core/collection/related.ts` 的两个纯函数 `buildRelatedCollectionsIndex(collections)` 和 `getRelatedCollections(index, chart)`，索引的类型 `RelatedCollectionsIndex` 也在 core。网页端的 `relatedCollections.ts` 保持原来的导出名（`updateRelatedCollectionsIndex`、`getRelatedCollectionsForChart`）和 `shallowRef` 的读写时机，所以 `ChartInfo.vue` 的响应式依赖不变；原来的 `relatedCollections.test.ts` 一行没改，原样通过，用来证明网页端行为不变。core 的新测试覆盖同样的场景，并加上空快照、没有要求/曲目的收藏品、每次快照重新建索引。
15. **曲目页查询逻辑的搬出（P0-14）**：
    - 原样搬到 `src/components/data/chart/songsQuery.ts`（先留在网页端，P0-16 再整体搬进 `shared/core/query/`）：默认排序的两个比较函数（`createGameOrderComparator`、`createPlayedFirstComparator`）、按分类和标签筛选（`filterChartsForCategory`）、位置索引（`addChartPositionIndexes`、`addQueriedPositionIndexes`）、文字搜索（`searchCharts`）、分组和统计（`groupCharts`、`countChartStats`）。函数体逐字搬动，注释也保留；`songs.vue` 里只剩把响应式状态传进去的几行。`Category` 枚举搬进模块并改名 `SongsCategory`，页面用 `import { SongsCategory as Category }`，模板和其余代码一个字没改。
    - 没有搬 `loadChartsWithCache` 里把成绩连到谱面上的那一段：它依赖用户数据、游玩次数估算和 `window.setTimeout` 让出主线程，要等 P2-0 和 `scoreLookup.ts`、`user/type.ts` 一起抽。这里只搬它用到的两个比较函数；`musicSortOrder` 改由 `createGameOrderComparator(MusicSort)` 内部建，`detailedLookup.findScoreForChart` 是不用 `this` 的闭包，可以直接当参数传。
    - 响应式依赖面稍微变宽，输出不变：原来只在对应分类里才读的 `difficultyFilter`、`plateFinishSort`、`shared.favorites`、`selectedCourse` 现在每次都会读一次，所以这些值变化时 `chartListFiltered` 可能多重算一次，结果相同。`shared.favorites` 只读了引用，遍历仍然只发生在收藏夹分类里。
    - 怎么确认行为没变：写了一个一次性的对照测试（不入库，放在会话的临时目录），把搬动前的页面代码（HEAD `d643e33`）和现在页面里对应的几段原样切出来，喂同一份固定数据（`meta.next.compacted.json` 裁剪出的 50 首、183 个谱面，加上固定随机种子生成的成绩、牌子、段位和收藏夹），逐个场景比较 `chartListFiltered`、`itemsToRender`、`groupedItems`、`overallStats`，以及两步排序的结果。共 4004 个场景（难度、最近、版本、收藏夹、宴会场、万花筒、段位、四类牌子的各个标签 × 难度过滤 × 牌子排序 × 十几种搜索词 × 全部分组方式），逐项相同，也确认两边都没有改动输入数据。为了确认这个对照测试真的能发现问题，又对新模块做了 18 种人为改动（序号差一、阈值 `>=` 变 `>`、比较方向反了、分组兜底值、过滤条件等），全部被发现。P0-15 的快照测试用同一份裁剪出来的曲库，成绩则由测试自带的种子重新生成，是留在仓库里的长期证据。
    - 对照测试暴露了固定数据的一个盲区：裁剪出来的曲目里没有排在 `MusicSort` 前 50 位的，所以「不在排序表里的曲目按 -1 算」这一条在这份数据上看不出差别（把 -1 改成 0 的改动没有被发现，改成 5000 就被发现了）。P0-15 单独给 `createGameOrderComparator` 写一个用自造排序表的用例来覆盖。
    - 新文件里的格式：`src/` 下的新文件无法同时满足 Prettier 和 antfu 的格式规则，所以在 `eslint.config.js` 里临时给 `src/components/data/chart/songsQuery*.ts` 加了一段 `saltnet/prettier-owned-songs-query`（P0-16 搬进 `shared/core/` 之后删掉，那里本来就由 Prettier 管）。从 `songs.vue` 带过来的存量违规（`antfu/curly` 3 条、`one-var` 4 条）随代码记到新文件上，`songs.vue` 的计数相应减少。
16. **固定测试数据和曲目页快照（P0-15）**：
    - 固定数据放在 `shared/core/fixtures/`，各个包共用（设计文档 6.3 的要求）。`saltmeta.compacted.json` 是从公开的 SaltMeta 接口（`meta.next.compacted.json`）取回后裁剪出的 50 首曲目、183 个谱面，保留上游的元组布局和条目顺序，也保留了代码必须应付的各种情形：同一首歌的 SD/DX 谱面、数字标题 `39`、两首同名的 `Link`、只有大小写不同的 `TRUST`/`Trust`、上游重复列出的宴谱 `100851`/`100998`、只有国际服才有的谱面、被锁定的曲目、国服每个版本至少一首；只有 4 首歌保留了 `fitDiffDF` 统计。`saltmeta.ts` 提供 `getFixtureSaltMetaCompacted()`（每次返回独立副本）和 `createFixtureMusicList()`（按网页端和 CLI 同样的方式转成 `SavedMusicList`），`saltmeta.test.ts` 的 7 条用例并入 `test:music-data`。JSON 是紧凑排版的数据，和 `additionalCollections.json` 一样同时列入 `.prettierignore` 和 ESLint 的忽略。
    - 曲目页快照 `songsQuery.test.ts`（脚本 `test:query`）：用上面的曲库，加固定种子（mulberry32，种子 20261110）生成的成绩，把页面的整条链（筛选、位置索引、搜索、搜索后的位置索引、分组、总体统计）跑在 77 个场景上，每个场景存一份紧凑的文字摘要（每个谱面的位置 `id[全部/难度内/搜索后]`、前三行成绩、各分组的标题和统计、总体统计），另有「固定数据」和「默认排序」共 3 份快照，一共 80 份。场景覆盖难度页的各个标签和分组方式、最近页、15 种搜索、宴会场、版本页的各种分组、收藏夹、段位、万花筒、未知分类，以及四类牌子的各个排序方式。
    - 快照之外有显式用例，盖住固定数据看不出差别的地方：不在 `MusicSort` 里的曲目按 -1 算（用自造的排序表，补上 P0-14 发现的盲区）、已玩优先排序保持稳定且容忍成绩为 `null` 的记录、SSS/SSS+/FC/AP/FSDX 的阈值、未知难度的位置索引、搜索后的位置索引从搜索前的总数往下数、各种分组返回 `null` 的情形、整条链不改动传入的谱面列表。
    - 为了让快照有信息量，搜索场景故意用有区分度的词（`fc`、`true`），而不是几乎匹配全部谱面的 `a`；「按版本分组」选在 13 级标签，因为里面有一张版本不在测试版本表里的谱面（舞萌DX 2022），版本表里没有的版本排在最前的兜底分支因此也被覆盖。最近页的分组标题是本地时间的文字，快照里改存时间戳，标题本身在用例里直接和 `formatScoreChangedAt` 比较，所以换时区快照不变（试过 UTC、Asia/Shanghai、America/Los_Angeles、Pacific/Kiritimati）。
    - 怎么确认快照记录的是搬出之前页面的行为：快照是用新模块生成的，所以另做了一次性的交叉检查（不入库，放在会话的临时目录）：把这份测试里「页面排序」和「页面组合」两段换成由搬动前的页面代码（HEAD `d643e33` 的 `songs.vue`，原样切出）驱动，原样复制提交的快照文件，不允许更新快照，直接运行；96 条用例全部通过，快照文件没有被改动。再对旧代码做两种人为改动（SSS+ 阈值的 `>=` 改成 `>`、搜索后位置索引差一）都会让它失败，说明这个交叉检查有效。
    - Prettier 把十六进制数字写成小写，而 `unicorn/number-literal-case` 要求大写，两者冲突，所以测试里 mulberry32 的增量用十进制写（注释里保留了十六进制）。`package.json` 又多了一行脚本，`jsonc/indent` 的基线照第 10 条的惯例加 1。
17. **曲目页查询模块搬进 core（P0-16）**：
    - `songsQuery.ts` 搬到 `shared/core/query/songs.ts`，顺便改了名：这个目录以后还要放 B50 和谱面信息的查询（P2-6、P2-9），所以按页面起名。测试和快照跟着搬，快照文件按新的测试文件名改成 `__snapshots__/songs.test.ts.snap`，内容和搬动前逐字节相同（用 `cmp` 对过 HEAD 里的旧文件）。测试里只改了 import 路径（`@core/…` 改成相对路径，`./songsQuery` 改成 `./songs`）和文件头的注释，用例和场景一条没动，96 条用例原样通过。
    - `songs.vue` 的 import 改成 `@core/query/songs`，并把这一条挪到其他 `@core/…` 的 import 旁边：留在原来的位置会让 `perfectionist/sort-imports` 的存量违规多 1 条（11 变 12），挪过去之后数目不变。别的一行没动。
    - 删掉 P0-14 临时加的 `saltnet/prettier-owned-songs-query` 配置段，`shared/core/**` 本来就由 Prettier 管格式。存量违规（`antfu/curly` 3 条、`one-var` 4 条）随文件换了键，数目不变，没有新增。
    - `test:query` 的路径改成 `shared/core/query/songs.test.ts`，脚本名不变。`shared/core/` 里没有 DOM 和 `src/` 的依赖由 `pnpm check`（无 DOM 的类型检查）和边界规则保证，两者都通过。
18. **网页端实测和 `AGENTS.md`（P0-17）**：
    - `AGENTS.md`：`shared/core/` 的结构说明改成按目录逐条列出；补上「没有汇总测试脚本，提交前要把 `check`、`lint`、全部 `test:*`、render-service 的 `test` 和 `check` 跑一遍（网页端改动再加 `build`）」；测试一节补上 core 测试的位置、固定数据的位置和「先快照再搬页面逻辑」的做法。文件开头仍写「两个包的 workspace」，P1-1 加上 `cli/` 时再改。
    - 改动面：和基线 `e3ec420` 相比 `src/` 里改了 68 个文件，其中 `src/stores/`、`router.ts`、`App.vue`、`main.ts` 一个字没动，`app/shared.ts` 只改了一处类型 import 的路径。路由和对话框历史记录的代码因此和改动前完全相同。
    - 浏览器实测的做法（按「少亲自操作浏览器，尽量交给 Antigravity」）：Antigravity CLI 的无头模式不能直接开浏览器，所以让它写脚本，用 DevTools 协议驱动真实的无头 Chrome 157 做 A/B 对照。A 是从基线 `e3ec420` 构建的生产包（端口 4174），B 是当前 HEAD 的生产包（端口 4173），两个来源、两种状态（匿名；有用户）各用全新的 profile。有用户的状态由页面里按固定种子生成一个含 3698 张谱面成绩的合成用户，写进 IndexedDB 后重载。两边跑同一份场景：曲目页冷启动、每个分类的每个标签（卡片文字、位置标记、统计行、分组标题）、版本牌子、搜索、设置的影响、谱面弹窗、收藏夹、深链、前进/后退、收藏品页、用户页、B50 页、设置/关于/首页。脚本带安全网：拦截所有非 GET 请求和所有指向非 localhost 的页面请求，不登录，不点更新、上传、绑定一类按钮，只访问公开的只读元数据接口；用完就结束自己启动的 Chrome。
    - 结果：完整跑了两遍。曲目页冷启动、每个分类的每个标签、牌子、搜索、设置、深链，以及非随机卡片的谱面弹窗，两边在两种状态下逐字相同；两边的控制台都没有错误和警告。出现过的差异都不是代码差异：
        - 「随机」卡片，以及用它打开的弹窗和收藏夹流程：页面本来就用 `Math.random()`，每次都不同。
        - 关于页的「谱面元数据最后更新时间」：每次拉取的时间。
        - 第一遍里 A 方难度分类的第二个标签在卡片还没渲染出来时被采样为 0 张：脚本把「空列表保持 700 毫秒」当成稳定。
        - 第二遍里有用户状态的 B 方，前进/后退之后掉到了应用之外，后面几页因此是空白的：脚本的回退步骤假定应用前面还有历史条目，条目数却取决于前面的场景。
    - 为了排除最后一项，单独写了一个变体，只跑「深链、前进/后退、收藏品、用户、B50、设置/关于/首页」：从浏览器发起的导航建立确定的历史条目；用第一张非随机卡片；元数据更新时间归一化；收藏品页要等到出现卡片才算加载完；带自检（历史条目数、是否掉出应用、有没有用户、B50 和收藏品的卡片）。匿名状态七项全部相同，前进/后退整条链（打开对话框、返回、前进、切分类再开对话框、收藏品→用户→B50 再回退和前进）逐步相同。有用户状态八项全部相同：B50 页 50 张卡片（35 加 15）、用户页 1 个用户、收藏品页每个标签 24 个条目（搭档 22 个）、控制台差异为 0。
    - 有用户状态下文档一直停在 `readyState === "interactive"`（有请求没结束），按 HTML 规范，文档没加载完时对 `location.hash` 赋值会变成替换而不是新增条目，所以脚本里「收藏品→用户→B50」那段回退链在这个状态下两边都退出了应用，两边完全一样，这一段只靠匿名状态的整条链作证据。
    - 没有覆盖：开发服务器模式（HTML5 history，只有生产构建用 hash 路由）、B50 出图（要调渲染服务）、需要真实账号的流程（落雪授权、舞萌更新、上传）、机厅页。放进最终报告里请用户自己看的清单。
    - 顺带发现：`docs/component-data-types.md` 提到的 8 个路径里有 6 个（`src/types/music.ts` 之类）在基线上就已经不存在，不是这次搬迁造成的，没有改。Antigravity 工作目录（会话临时目录里）还留着上一轮的旧 Chrome profile，删除被安全检查拦住，没有绕过，不在仓库里。
19. **cli 脚手架（P1-1）**：
    - 包名 `saltnet-cli`，`type: module`，`engines.node >=24`，`bin.saltnet` 指向 `./dist/saltnet.mjs`。开发依赖里 `@types/node` 取 `^24`（根包是 22；CLI 跑在 Node 24 上，P1-5 要用 `node:sqlite` 的类型），另有 `esbuild`、`typescript`、`vitest`。`cli/tsconfig.json` 的 `types` 只有 `node`，没有 DOM；`@core/*` 指到 `../shared/core/*`，和网页端是同一个别名。`pnpm check` 现在包含 `tsc -p cli/tsconfig.json`。
    - 打包：`cli/build.mjs` 用 esbuild 把 `src/main.ts` 和它用到的 `shared/core` 打成一个 ESM 文件（`target: node24`、shebang、可执行位、不压缩）。每次调用都是新进程，一个文件省掉运行时的模块解析；仓库里用了 `enum` 和 `@core/*` 别名，Node 自带的类型剥离跑不了，所以打包产物是唯一支持的运行方式。
    - 构建时默认值：按 Vite 生产构建的顺序（`.env`、`.env.local`、`.env.production`、`.env.production.local`，后者覆盖前者）用 `util.parseEnv` 读根目录的文件，通过 esbuild 的 `define` 以 `__SALTNET_BUILD_DEFAULTS__` 编进包里（后端主备地址、渲染服务地址、落雪 client id 和回调地址）；构建脚本只输出产物路径，不输出任何取值。版本号来自 `cli/package.json`（`__SALTNET_VERSION__`），没打包时（vitest）回退为 `0.0.0-dev`。
    - 计划里写的「`.gitignore` 和 `.prettierignore` 加上 `cli/dist`」只需要后者：`.gitignore` 里已有 `dist`，任意层级都生效。
    - ESLint：新增 `saltnet/cli` 配置段（`cli/**/*.{ts,mjs}` 关掉由 Prettier 负责的格式规则）；`cli/**/*.json` 并入 `saltnet/prettier-owned-json`。`cli/` 里的新文件必须零违规：`process` 要显式 `import process from "node:process"`（`node/prefer-global/process`），构建脚本不用 `console.log`（用 `process.stdout.write`），import 按 `perfectionist/sort-imports` 排序（`@core/…` 在 `vitest` 之前）。
    - 基线：根 `package.json` 多了两行脚本（`jsonc/indent` 55 变 57），`pnpm-workspace.yaml` 多了一行 `- "cli"`（`yaml/indent` 7 变 8、`yaml/plain-scalar` 2 变 3、`yaml/quotes` 3 变 4），都是第 10 条说的存量冲突，按新增的行数手工调高了计数。没有用 `eslint --suppress-rule`：它会把整份基线重新排序，一次改动 800 多行，淹没真正的变化。
    - 锁文件：`pnpm install` 给 `cli` 加了 importer，也给 `vitest` 加了一个带 `@types/node@24` 的变体，同时清掉了一个陈旧的 `database` importer（工作区里早就没有这个包）和只有它用到的包条目，一共约 1170 行删除。这是 pnpm 对锁文件的整理，和 CLI 无关，但留着不提交会让下一次 `pnpm install` 再改一遍，所以一起提交，在最终报告里说明。
    - 之后要处理的打包问题，先记在这里：(a) `pinyin-pro`、`wanakana`、`opencc-js` 体积大，只有搜索索引用得到，P1-9 用 esbuild 插件做成懒加载，不涉及搜索的命令不付这笔启动成本；(b) `node:sqlite` 在 Node 24 下会输出 ExperimentalWarning，P1-5 要在动态 import 它之前压掉，不能污染 stderr。
20. **运行时路径和配置（P1-2）**：
    - 路径（`cli/src/runtime/paths.ts`）：只算路径、不碰磁盘，因为 `--help`、`schema` 之类不该创建 `~/.saltnet`；需要存储的命令再调 `ensureRuntimeDirs`，新建的数据目录和 `cache/` 权限是 0700。`SALTNET_HOME` 为空或只有空白按没设置处理；相对路径按当前目录解析；开头的 `~` 在没有 shell 展开的地方（agent 的环境变量块、`.env`）由程序自己展开，否则会在当前目录里建出一个叫 `~` 的目录。
    - 设置（`cli/src/runtime/config.ts`）：一张表定义全部设置——点号路径的键、类型和取值范围、中文说明、默认值；解析、环境变量覆盖、之后的 `config` 命令（P1-15）、`schema` 和 `guide` 都从这张表出。共 17 项：`api.url`、`api.fallbackUrl`、`render.url`、`saltmeta.url`、`lxns.baseUrl`、`lxns.clientId`、`lxns.redirectUri`、`lxns.refreshTokenDays`（30）、`lxns.expiringWarnDays`（3）、`metadata.maxAgeHours`（24）、`metadata.timeoutMs`（8000）、`scores.staleDays`（3）、`network.timeoutMs`（15000）、`network.updateTimeoutMs`（120000）、`network.userAgent`（`saltnet-cli/<版本>`）、`output.format`（`json` 或 `text`）、`sync.qrOtherAccount`（`rewrite` 或 `error`）。设计文档只给了其中一部分的名字（过期时间、地址、client id、UA），超时、数据源地址和二维码处理方式的键名是按 5.5 和「待确认」的默认做法补的；`output.format` 只允许 `json` 和 `text`，因为 `tsv` 只适用于列表命令。
    - 优先级：环境变量 > `config.json` > 构建时从 `.env` 带入的默认值 > 内置默认值，每个值同时记下来源（`env`、`file`、`build`、`default`），给 `config list` 用。环境变量名由键机械推出：`SALTNET_` 加大写下划线形式（`lxns.clientId` 对应 `SALTNET_LXNS_CLIENT_ID`），所以每一项都能覆盖，测试和端到端也可以把 `SALTNET_SALTMETA_URL` 指到本地的假服务。设成空的环境变量只对允许留空的项生效（例如 `SALTNET_API_FALLBACK_URL=` 去掉备用地址），其余按没设置处理。
    - 出错：一个无效值不会让整份配置作废，这一项退回下一层，并记一条 `ConfigProblem`。`config.json` 读不了、不是合法 JSON、不是对象、某一组不是对象、值的类型或范围不对、环境变量的值无效，都是 error；不认识的键是 warning。要不要因此中止命令由调用方定（P1-4 起：有 error 就返回 `USAGE`，退出码 2；`config`、`--help`、`schema`、`guide` 不受影响），这样手滑写错一项设置不会连修它的命令也用不了。消息里只回显数字和枚举值，不回显网址和文字（可能带凭据）。
    - 构建默认值：从 `build.mjs` 里挪到 `cli/build-defaults.mjs`，这样能测。按 Vite 的优先级读 `.env`、`.env.local`、`.env.production`、`.env.production.local`，构建进程自己的环境变量压过文件（和 Vite 一样）；网页端 `.env` 里 `KEY = value` 这种等号两边带空格的写法和引号都能解析。用真实的 `.env` 构建一次，确认五个值都进了包（只核对「是否非空」，没有输出任何值）。
    - 测试不碰真实目录：`cli/tests/setup.ts` 给每个测试文件一个临时的 `SALTNET_HOME` 和 `HOME`，即使哪个测试忘了传路径，也只会落在临时目录里。
    - 小事：`cli/tsconfig.json` 打开 `allowJs`（`checkJs` 保持关）只是为了让测试能 import `build-defaults.mjs`。十六进制字面量在 Prettier（小写）和 `unicorn/number-literal-case`（大写）之间冲突，所以字节序标记写成十进制 65279。ESLint 的 `style/quotes` 不允许为了少转义而用单引号，Prettier 却会这样改写，所以测试里需要引号的 JSON 都用 `JSON.stringify` 生成，要引号的 `.env` 值用单引号。
    - 一次疏忽，记在这里以便写进最终报告：核对 `.env` 的键名时，用来遮住取值的 `sed` 没有覆盖「等号两边带空格」的写法，三个公开的服务地址（后端主备地址、渲染服务地址）因此出现在我自己的命令输出里。它们不是凭据，也没有写进任何文件、提交或发往任何服务；之后核对 `.env` 只输出布尔值或长度。
21. **命令注册表、解析器和帮助（P1-3）**：
    - 一张类型化的注册表（`cli/src/commands/registry.ts`）是命令的唯一来源：解析器、`--help`，以及之后的 `schema`、`guide` 都从它生成。`defineCommand(spec, run)` 用 `const` 泛型从字面量规格推出处理函数拿到的参数类型（必填或有默认值的选项一定有值，开关一定是 boolean），测试用 `expectTypeOf` 在 `tsc` 下检查。`buildRegistry` 启动时校验：命令名和选项键的写法、重复、以 `no` 开头会和 `--no-x` 冲突的键，以及每条示例都必须能被解析器接受（示例用 `splitCommandLine` 切词），所以帮助和 `guide` 里的示例不会过时；P1-18 的端到端测试会把 `guide` 里的示例真正跑一遍。
    - 错误码和退出码表（`cli/src/errors.ts`）从 P1-4 提前到这里，因为解析器要返回 `USAGE`。`CliError` 带 `code`、`candidates`、`fix`、`retryable`（`NETWORK`、`SYNC_IN_PROGRESS`、`DB_LOCKED` 默认可重试）。P1-4 仍然负责格式（tsv、text、`--fields`）、分页和 stdout/stderr 约定，这一步的外层结构（`cli/src/output/envelope.ts`）只有最小形态：`v`、`ok`、`command`、`data` 或 `error`、`meta`、`warnings`，键的顺序固定。
    - 解析器（`parse.ts`）不抛异常，返回「运行 / 帮助 / 版本 / 出错」之一；出错时带着已经读到的全局选项，所以命令行写错时 `--pretty` 照样生效，能确定命令时 `command` 字段也会填上。约定：位置参数只给对象（曲目、用户等），其余都是 `--kebab-case` 选项；开关写 `--x` 或 `--no-x`；列表用逗号、范围用 `a..b`；枚举不分大小写并支持别名；`--` 之后全是位置参数；除 `-h` 外没有短选项；`--version` 只在命令名之前才是版本（`charts --version 熊` 里它是命令自己的选项）；全局选项 `--pretty`、`--format`、`--verbose`、`--offline` 写在哪里都行。同一个选项写两次报错，列表选项例外（合并去重）。`--help` 优先于其他写错的地方，但不优先于未知命令；单独的 `saltnet` 显示根帮助、退出码 0；单独的命令组（如 `saltnet user`）报 `USAGE` 并列出子命令；未知命令、选项和枚举值都会给出最接近的候选（带换位的编辑距离，前缀也算）。
    - 凭据选项（`--qr`、`--token`、`--callback`）在解析阶段就强制只能写 `-`，表示从 stdin 读；它们的值，以及任何看起来不像普通词语的值，都不会回显到错误信息里（`echo` 只回显 40 个字符以内的字母、数字和 `_.:+-`），所以写在命令行上的二维码或令牌不会出现在任何输出里。stdin 只在命令真的要读凭据时才读，stdin 是终端时直接报 `USAGE` 而不是干等。
    - `--offline` 做成全局选项（规格里它出现在多个命令上，统一成全局更省事；不联网的命令忽略它）。规格里的输出类型落成 `output: "object" | "list" | "text"`，tsv 只对 `list` 有效。开关默认 false；默认开启的开关在帮助里显示为 `--[no-]x`。
    - 帮助是纯文本、不包外层结构（规格 4.1）：根帮助按分类列命令、命令组折成一行；命令帮助依次是用法、说明、参数、选项、示例、副作用、全局选项。列对齐按显示宽度算（中文和全角字符占两列），标签超过 30 列的描述换到下一行；根帮助的命令列表整体共用一列宽，其余每个表各自算宽度。长枚举在选项里写成 `<值>` 并把取值放进括号说明，短枚举直接写成 `<a|b|c>`。参数表里的标签和用法行用同一个写法（`<曲目...>`、`[难度]`）。
    - 测试里的小事：`JSON.stringify(error)` 不含不可枚举的 `message`，检查「凭据没有泄露到输出」时必须用 `failureEnvelope` 生成的文本，否则断言会空转。
    - ESLint：`saltnet/cli` 段再关掉两条会和 Prettier 打架的规则：`style/quotes`（Prettier 对含双引号的字符串改用单引号）和 `unicorn/number-literal-case`（Prettier 把十六进制写成小写，`cli/src/util/width.ts` 里的 Unicode 区间用十六进制才好读）。基线里没有 `cli/` 的条目，所以这个改动不影响存量违规的计数。
22. **输出、格式和分页（P1-4）**：
    - 渲染（`cli/src/output/render.ts`）：命令只返回 `{data, meta?, warnings?}`，格式由运行器按命令的 `output` 类型和 `--format` 渲染。`output: "text"` 的命令直接输出它返回的字符串（补一个结尾换行），不包外层结构；`output: "list"` 的命令必须返回带 `items` 或 `groups` 的 `data`，否则按 `INTERNAL` 处理，因为这是命令自己的 bug，不是用户的错。
    - 格式选择（`format.ts`）：`--format` 明写的优先；否则只有 stdout 是终端时才用配置里的 `output.format`，不是终端一律 JSON，所以程序拿到的永远是 JSON，哪怕用户配置了 text。对不是列表的命令写 `--format tsv`，在命令运行**之前**就报 `USAGE`，免得有副作用的命令先执行完才说格式不对；这条错误不带 `fix`，因为拼不出用户完整的命令行。失败永远是 stdout 上的 JSON 失败信封，不管 `--format` 写的是什么：调用方只要认一种失败的形状。
    - 列表（`paging.ts`、`listOptions.ts`）：所有列表命令展开 `listOptions()`（`--limit` 默认 50、上限 10000，`search` 用 `listOptions(10)`；`--offset`；`--fields`），用 `paginate` 切页并返回 `meta.page = {total, offset, limit, nextOffset}`，最后一页的 `nextOffset` 是 null。带 `--group-by` 时结果是 `data.groups[{key, count, stats?, items}]`，`--limit` 对每组分别生效。
    - `--fields`（`fields.ts`）：点号表示嵌套（`score.rank`），由运行器统一应用在 `items` 上（分组时应用在每组的 `items` 上，名字对所有组一起校验），命令自己不读它。先查写法（空段和 `__proto__` 不行），再去掉重复和被更短前缀盖住的路径；名字必须在结果里真的存在，只看非 null 的节点，走进字符串或数组算不存在，不存在就报 `USAGE` 并给最接近的字段名当候选，所以拼错字段不会悄悄得到一列空值。某个父对象在所有行里都是 null 时不判错，因为那是「还没有成绩」之类的正常情况。输出保留嵌套结构，缺失的值是 null（`score` 为 null 时 `score.rank` 得到 `{"score":{"rank":null}}`）。
    - tsv（`table.ts`、`tsv.ts`）：列是所有行叶子键的并集，嵌套对象写成 `score.rank`，按第一次出现的顺序；写了 `--fields` 就按它的顺序。null 是空单元格，数组和空对象是紧凑 JSON，制表符、换行、回车和反斜杠转义成 `\t`、`\n`、`\r`、`\\`。stdout 只有表：没有结果又没写 `--fields` 时什么都不输出，写了就只输出表头。`meta`、`warnings` 和 `data` 里其他的键（例如统计）写到 stderr，每项一行 `# meta {json}`、`# warning {json}`、`# <键> {json}`；分组时表的第一列是 `group`。tsv 因此是规格 4.5「stderr 默认静默」的唯一例外，不是终端也会写 stderr。
    - text（`text.ts`）：给人看，不保证稳定。列表是按显示宽度对齐的表（单元格最宽 40 列，超出用 `…`，null 显示 `-`，简单值的数组用 `、` 连接）；对象是缩进的 `键: 值` 提纲，对象数组用 `- `；分组写成 `键（N 条）` 加一张表；页码行是 `第 a–b 条，共 N 条；下一页加 --offset k`；警告是 `警告 CODE：消息（建议运行 …）`。
    - 警告码（`warning.ts`）：`STALE_METADATA`、`STALE_SCORES`、`NO_SCORES`、`PARTIAL_SCORES`、`TRUNCATED`、`UPLOAD_FAILED`、`SOME_FAILED`、`LXNS_EXPIRING` 做成类型，命令写不出表外的警告码。
    - 失败也能带 `meta` 和 `warnings`（`CliError` 的两个可选字段，信封里排在 `error` 之后），给「做到一半才失败」的命令用，例如同步中途上游出错时，已经取到的数据来源时间不会丢。
    - stdout 和 stderr（`cli.ts`、`main.ts`）：stderr 默认静默，只有 stderr 是终端或写了 `--verbose` 才输出进度（命令调用 `ctx.log`）和 `INTERNAL` 的堆栈。`| head` 提前关掉管道（EPIPE）时安静退出，不打印堆栈。
    - 配置有错（P1-2 的 `ConfigProblem`）：命令运行前就返回 `USAGE`，`fix` 是 `saltnet config list`（P1-15 提供），`extra.problems` 列出每一项；`config`、`schema`、`guide` 设 `allowBadConfig`，所以改坏配置后还能用 `config` 修。每条问题的消息已经说明是哪个环境变量或 `config.json` 里的哪一项，外层只负责拼接。
    - 小事：`CommandContext` 现在带 `paths`、`config`、`version`、`log`；`echo` 从 `values.ts` 挪到 `util/echo.ts`，输出模块和解析器都要用；`tests/harness.ts` 在进程内跑一行命令并收集输出，默认把命令看到的环境指向沙盒 `SALTNET_HOME`；测试夹具里的 `demo` 命令改成 `output: "object"`，因为它返回的是收到的参数，不是列表，而渲染器现在会检查列表的形状。
23. **SQLite 存储、迁移和锁（P1-5）**：
    - 加载（`store/sqlite.ts`）：用 `process.getBuiltinModule("node:sqlite")` 同步加载并缓存，所以打开数据库也是同步的；加载期间临时包住 `process.emitWarning`，只丢掉提到 SQLite 的 ExperimentalWarning，其他警告原样放行（第 19 条记下的问题 (b)）。Node 24.15 已经不输出这条警告，更早的 24.x 会输出。不碰数据库的命令（`--help`、`schema`、`guide`、`config`）连模块都不加载。
    - 打开（`store/store.ts`）：`openStore(paths)` 建数据目录（0700）和库文件（0600，WAL 的附带文件和备份同样是 0600），`PRAGMA journal_mode = WAL`；外键约束沿用 `node:sqlite` 的默认值（开）；忙等待 5 秒（`busyTimeoutMs`）；`synchronous` 保持默认（FULL），写入量小，宁可慢几毫秒也不丢成绩。
    - 迁移（`store/migrations.ts`）：`MIGRATIONS` 按版本号 1、2、3… 排列，不许有空缺（每次迁移前检查），`PRAGMA user_version` 记已经做到第几步。每一步和 `user_version` 的更新在同一个 `BEGIN IMMEDIATE` 事务里，失败整步回滚，错误信息说明是哪一步、已回滚、备份在哪。拿到写锁之后会再读一次版本，别的进程已经做完的步骤跳过，所以两个 saltnet 同时第一次运行不会重复建表。库是更新版本的 saltnet 建的（`user_version` 比已知的大）时直接报 `INTERNAL`、让用户升级，不动它；没有为此发明新的错误码。事务里改不了 `PRAGMA foreign_keys`，要重建被引用的表的步骤得用 `defer_foreign_keys`（写在 `Migration.up` 的注释里）。
    - 备份：库里已有数据（`user_version > 0`）而要升级时，先用 `VACUUM INTO` 复制到 `cache/saltnet-v<旧版本>-<UTC 时间>.db`（同一秒已有同名文件就加 `-2`、`-3`），权限 0600。不直接复制文件，因为 `VACUUM INTO` 在别的进程正在写入时也是一致的，并且会带上 WAL 里还没合并的内容。新建的库没什么可备份，不做。备份不会自动清理（设计 2.2 没规定保留数量），需要时直接删 `cache/` 里的文件。
    - 第 1 版迁移只有 `locks` 表。曲库、用户、成绩等表跟着各自的步骤（P1-6 起）用新的迁移加，而不是现在一次建全，这样每个提交里的表结构都有对应的代码和测试。
    - 事务（`store.transaction`）：外层是 `BEGIN IMMEDIATE`（一上来就拿写锁，不会读到一半升级写锁失败），嵌套调用变成 `SAVEPOINT`，所以内层失败而外层捕获时只撤销内层的改动。回调必须是同步的：返回 Promise 会抛 `TypeError` 并回滚，因为那样会在工作做完之前就提交。
    - 锁（`store/locks.ts`）：`locks` 表每个名字一行，记持有者（随机 owner 和 pid）与过期时间；过期的行在下一次获取时清掉，进程崩溃不会永远占着。`acquireLock` 不等待，抢不到就返回当前持有者，忙了怎么办由调用方定（同步报 `SYNC_IN_PROGRESS`，元数据刷新用缓存继续，见设计 2.2）。`renew` 给超过存活时间的工作续期，`release` 只删自己的那一行，已经过期并被别人拿走的锁不动。`withLock` 保证无论成功失败都释放。
    - 错误（`store/errors.ts`）：SQLite 的 `BUSY`、`LOCKED` 变成 `DB_LOCKED`（可重试，退出码 7）；库损坏或不是 SQLite 文件、打不开、没权限、只读、磁盘满、IO 错误变成带处理办法的 `INTERNAL`（把坏库挪开、检查目录权限和磁盘、用 `SALTNET_HOME` 换目录），不会覆盖或删除用户的文件。其他 SQLite 错误仍是 `INTERNAL` 的 bug。转换统一放在运行器的 `toCliError`，命令里不用各自处理。
    - 运行器（`cli.ts`）：`CommandContext.store` 是个函数，第一次调用才打开数据库，命令结束时（成功、失败、抛异常）在 `finally` 里关闭，所以没用到数据库的命令不碰磁盘。
    - 顺带修了 P1-2 留下的一个问题：`SALTNET_HOME` 指到一个普通文件的下面（`blocked/x`，`blocked` 是文件）时，读 `config.json` 得到 `ENOTDIR`，被当成「配置读不了」而返回 `USAGE`，用户看不到真正的原因；现在 `ENOTDIR` 和 `ENOENT` 一样按没有配置文件处理，后面建目录时会报出「不是目录」的明确错误。
    - 测试：`cli/tests/tempHome.ts` 的 `useTempHome()` 给每个用例一个全新的、还不存在的数据目录，用完删掉。`tests/store/` 覆盖加载与警告过滤、错误映射、迁移（新库、升级、失败回滚、拒绝新版本、两个连接并发）、打开（权限、WAL、备份命名、损坏的文件、`DB_LOCKED`）、事务（提交、回滚、嵌套、异步回调）和锁（获取、过期、续期、释放）。另外用 esbuild 把 store 单独打成一个文件，在临时 `SALTNET_HOME` 下运行，stderr 为空，目录 0700、库文件 0600。
24. **P1-6 拆成三步：core 准备（P1-6a）、联网这一层（P1-6b）和 CLI 刷新（P1-6c）**：
    - 拆分原因：P1-6 要同时改 core（网页端共用，必须带 `pnpm build` 验证）和 CLI（联网、库表、快照、命令），放进一个提交太大，所以 core 的准备工作先单独提交，联网这一层是第二个提交（第 25 条），CLI 刷新留给 P1-6c。
    - `fetchSaltMetaCompacted`（只下载并检查格式版本）和 `buildSaltMetaMusicList`（转换，可选 `mergeDuplicates`）是从 `fetchSaltMetaMusicList` 拆出来的两半，后者现在就是两者相接，参数和返回值不变，网页端行为不变（`fetch.test.ts` 断言了：默认不合并，`110851` 仍有两张碰撞的谱面）。
    - `mergeDuplicateMusics`（`shared/core/music/duplicates.ts`）：按 SaltMeta id 把同 id 的条目折成一条。保留带地区前缀（`[幸]`、`【宴】`）的那条；都没有前缀就保留知道更多地区的，再不行取第一条。另一个标题和它的别名并入 `aliases.cn`；谱面按（类型、难度）合并，保留条目的值优先，缺的地区、拟合数据、谱师从另一条补；合并后的条目占第一次出现的位置；返回 `merged` 清单（给 `status` 用）。不修改输入，对自己的输出再合并是空操作。
    - `LXNSCollectionError`（`kind: "http" | "malformed"`、`collectionType`、`status`）：原来抛普通 `Error`，CLI 要分清 HTTP 错误和格式错误才能映射成 `UPSTREAM_ERROR`。消息不变，网页端不受影响。
    - 落雪收藏品固定数据 `shared/core/fixtures/lxns-collections.json`（22 KB）：真实接口 `/api/v0/maimai/{trophy,icon,plate,frame}/list?required=true` 的裁剪版，保留上游字段（含网页端不用的 `release_date`）。内容有版本牌子 真極…超舞舞、五种称号颜色、有多条要求的牌子（覇者）、引用没有国服谱面的歌（千本桜）；要求里的曲目裁到几首固定数据里有的歌。这是公开的只读接口，数据里没有账号信息。`fixtures/lxns.ts` 的 `getFixtureLXNSCollections()` 每次返回一份新副本。
    - 给 P1-6b 和 P1-6c 的设计备忘（第一条是 P1-6b，已经做完，见第 25 条；其余留给 P1-6c，还没写代码）：
        - `Io` 加 `fetch`（带 `signal`），`createProcessIo` 用全局 `fetch`；测试 harness 的默认 `fetch` 必须直接拒绝并说明「测试没有模拟网络」，避免测试误连真实网络。`runtime/http.ts` 包一层：加 `User-Agent` 和 `AbortSignal.timeout`；连接失败、超时、读响应体时中断都变成 `NETWORK`，非法 JSON 是 `UPSTREAM_ERROR`；错误消息里只写主机名。HTTP 非 2xx 是 `UPSTREAM_ERROR`（5xx 和 429 可重试），格式版本不符是 `UPSTREAM_ERROR` 并提示升级。
        - 迁移 2（全部 `STRICT`）：`meta_state(source PK, fetched_at, upstream_version, builder, detail JSON)`、`versions`、`songs(id PK, meta_id, title, artist, genre, bpm REAL 可空, version, is_new, type, aliases JSON 可空, search_index JSON 可空)`、`charts(chart_key PK, id UNIQUE, song_id FK, position, difficulty, level, constant, charter, notes JSON, deluxe_score_max, fit_constant, stat JSON, search_index JSON)`、`collections((kind, id) PK, position, name, genre, description, color, release_date, required JSON 原样)`。`bpm` 和 `notes` 要保留上游的 `null`（宴谱没有物量），P1-7 还原时才和网页端的结构完全一致；`meta_id` 由 `type` 反推（SD 是 id，其余是 id − 10000）。
        - 刷新顺序：加锁 `metadata`（TTL 120 秒）→ 并行下载 → 校验和转换（曲库为空算 `UPSTREAM_ERROR`）→ 先原子写 `cache/` 快照（临时文件加改名）→ 再用一个事务整体替换并写 `meta_state`。曲库和收藏品各自独立替换：一个失败时它的旧数据保留，命令以失败退出，`extra.sources` 给出各自结果。`refresh --offline` 是 `USAGE`；`refresh` 撞锁是 `SYNC_IN_PROGRESS`。
        - `ensureMetadata`（给后面的命令用）：过期（`metadata.maxAgeHours`）或 `builder` 不一致就刷新；失败时有缓存就带 `STALE_METADATA`，没缓存就报错；`--offline` 没缓存是 `OFFLINE_NO_CACHE`；`builder` 变了而有快照时，不联网直接从快照重建。`builder` 由 CLI 自己的构建号加 `MUSIC_SEARCH_INDEX_VERSION` 组成。
25. **联网这一层（P1-6b）**：
    - `Io.fetch`（类型 `HttpFetch`：core 的 `FetchInit` 加一个 `signal`）是原始网络，进程里用全局 `fetch`。命令不直接用它，而是用 `ctx.http({ timeoutMs? })`，它返回 core 要的 `FetchLike`；超时默认取 `network.timeoutMs`，刷新曲库传 `metadata.timeoutMs`，账号更新传 `network.updateTimeoutMs`，由各命令自己传。
    - 每个请求加 `User-Agent`（`network.userAgent`，默认 `saltnet-cli/<版本>`，调用方自己写的头优先）和一个 `AbortSignal.timeout`。这个期限管整个往返，包括读响应体，因为慢服务器常常卡在读响应体这一步。
    - 失败映射：连接失败、DNS 失败、超时（包括 undici 自己的 `UND_ERR_*_TIMEOUT`）、读响应体时中断都是 `NETWORK`（可重试）；`json()` 读到的不是合法 JSON 是 `UPSTREAM_ERROR`；HTTP 状态不是成功的由调用方判断，`upstreamStatusError(url, status)` 做出 `UPSTREAM_ERROR`（5xx 和 429 可重试）。消息里只写主机名，不写路径和查询串（URL 里可能带 token）；原因取错误链里第一个字符串 `code`（`ECONNREFUSED`、`ENOTFOUND` 等），没有就用消息。
    - 测试：`createHarness` 的 `fetch` 默认是一个没有任何路由的模拟网络，请求任何地址都会失败并写明地址，所以测试不会误连真实网络；要用网络的测试传 `mockFetch({ [url]: jsonResponse(...) })`（`tests/mockHttp.ts`，按完整 URL 匹配并记录请求）。`createProcessIo` 的第二个参数可以换掉 `fetch`；`io.test.ts` 同时验证了不传时用的是全局 `fetch`。
26. **曲库和收藏品的刷新（P1-6c）**：
    - 库表是迁移 2（全部 `STRICT`）：`meta_state`、`versions`、`songs`、`charts`、`collections`。和第 24 条的备忘相比有几处不同：`charts` 的难度列叫 `grade`（和 core 的 `chartInfo.grade` 一致，也是 chart key 的后半），没有单独的 `fit_constant` 列（拟合数据本来就在 `stat` 的 JSON 里，P1-7 原样读回），`charter` 可以是 `NULL`（宴谱没有谱师）；`collections` 没有 `release_date` 列，而是多存一列 `raw`（整个条目的 JSON），`required` 是上游原样的 JSON，所以四个列表可以原样重建。
    - `songs.id` 是 SaltNet 的曲目 id，`meta_id` 由 `type` 反推（SD 是 id，其余是 id − 10000）；`charts.chart_key` 是 `<曲目 id>-<grade>`（宴谱的 grade 是 10），`charts.id` 是网页端的谱面 id。上游缺的值（宴谱的 `bpm`、物量、谱师）保留 `NULL` 或 `null`，不编造。
    - `CATALOG_BUILDER`（`catalog-1/search-<MUSIC_SEARCH_INDEX_VERSION>`）写进每个来源的 `meta_state.builder`。以后改了行的构造方式就把前面的数字加一，P1-7 的 `ensureMetadata` 靠它发现该从快照重建。
    - 刷新（`catalog/refresh.ts`）：先拿 `metadata` 锁（TTL 120 秒），两个来源并行，各自独立地「下载 → 校验 → 写 `cache/<名字>.json` 快照（临时文件加改名，0600）→ 用一个事务整体替换并写 `meta_state`」。事务里任何一步失败都整体回滚，旧行和旧的 `meta_state` 不变。因为快照先写，事务失败时快照会比库新；P1-7 从快照重建时要记住这一点。
    - 空数据不能清掉好数据：SaltMeta 里没有国服曲目、落雪四个列表加起来是空的、列表形状不对，都是 `UPSTREAM_ERROR`，已有数据保留。落雪的四个列表只要有一个失败，整个收藏品就算失败：半新半旧的收藏品会让版本牌子的进度算错。
    - 结果：每个来源给一个 `{source, ok, ...}`，成功的带 `fetchedAt` 和数量（曲库还带合并掉的重复宴谱），失败的带 `error` 和 `keptFetchedAt`（还保留着的旧数据是什么时候拉的，没有就是 `null`）。任何一个来源失败，命令以失败退出：错误码和 `retryable` 取第一个失败的来源（曲库在前），消息把所有失败都列出来，两个来源各自的结果在 `error.sources`。
    - `refresh --offline` 是 `USAGE`，在碰网络和磁盘之前就拒绝；`refresh` 遇到别的进程持有 `metadata` 锁是 `SYNC_IN_PROGRESS`（`error.holder` 有 `pid` 和 `since`），什么都不下载；持有者崩溃、锁过期之后会被接管；命令结束时无论成败都释放锁。`refreshCatalog` 把「锁被占」作为返回值交给调用方，所以 P1-7 的 `ensureMetadata` 可以选择继续用旧缓存。
    - **偏离原计划**：P1-6c 原本还包括过期检查，现在挪到 P1-7。过期检查（`ensureMetadata`）要和「从库里读出曲库」一起才用得上，放在读库的这一步里才能一起测；本步只有显式的 `refresh`。第 24 条里 `ensureMetadata` 的设计备忘不变，改由 P1-7 实现。
    - 时间：输出里的时间写成本机时区加偏移（`2026-11-11T09:12:03+08:00`，`util/time.ts` 的 `formatLocalTime`），库里存毫秒时间戳。
    - `toCliError` 从 `cli.ts` 挪到 `src/toCliError.ts`：`catalog/refresh.ts` 要把每个来源的异常也转成 `CliError`，而 `cli.ts` 依赖命令层，不挪会成环。测试 harness 加了 `now` 选项（命令看到的时钟）；`help.test.ts` 里「还没有命令」的用例改用空注册表，因为真正的注册表现在有 `refresh`。
    - 测试：`tests/catalog/store.test.ts`（真实的固定数据：50 首、183 张谱、20 个版本，SD/DX 的 `meta_id`，宴谱的空值，合并后的重复宴谱，替换和回滚）、`snapshots.test.ts`、`tests/commands/refresh.test.ts`（成功、`--offline`、一个来源失败而另一个照常更新、保留旧数据并说明它的时间、连接失败、超时、格式版本、非 JSON、空数据、形状错误、锁）、`util/time.test.ts`。全部用模拟网络，没有真实请求。
27. **P1-7 拆成三步：读库（P1-7a）、静态数据（P1-7b）、过期检查（P1-7c）**：
    - 拆分原因同第 24 条：每步一个提交，各自能单独验证。
    - P1-7a：`catalog/load.ts` 的 `loadMusic`、`loadCollections` 把库里的行还原成网页端的内存结构。曲目和谱面（含 `chart.music` 回指和 `chartList`，由 core 的 `restoreCachedMusicData` 建）、`cnVersions`，以及落雪的四个列表（用 `raw` 重建，再交给 core 的 `mapLXNSCollections`，所以版本牌子也一样）。宴谱缺的值（`bpm`、`charter`、`notes` 里的 `null`）还原成 `null`，和网页端一样；没有的可选字段（`stat`、`aliases`）不出现在对象里。没刷新过时返回 `undefined`。每次读都是一份新副本，一个命令改了它不会影响下一个。
    - P1-7a 的测试：`tests/catalog/load.test.ts` 用 `toEqual` 证明还原的结果和 core 从同一份固定文档构建的结果逐项相等（曲目、谱面、版本、收藏品映射），还查了回指的同一性、宴谱的空值、搜索索引、新副本和后一次刷新覆盖前一次。
    - 给 P1-7b 的设计备忘（还没写代码）：库里收藏品的 `kind` 改成设计里的六个名字 `plate`、`title`、`icon`、`frame`、`character`、`partner`（落雪的 `trophy` 改叫 `title`），`refresh` 输出的 `counts` 也跟着用这些名字；`replaceCollections` 只删落雪的四类，不碰静态的两类。新增迁移 3：`courses`、`course_tracks`（带 `chart_key`，能直接和 `charts` 连接）。静态数据（旅行伙伴、搭档、段位）用 `meta_state` 里 `static` 一行的 `builder`（`static-1/<数据内容的 sha256 前 12 位>`）判断要不要重写：数据文件一变就自动重写，不用记得改版本号，开发时也不会读到旧的。**万花筒的数据不进库**：设计里没有对应的视图，`kaleidxscope` 命令直接读 core 的静态数据（偏离了 P1-7 原来的描述）。
    - 给 P1-7c 的设计备忘（还没写代码）：`ensureMetadata` 只处理这次命令要用的来源。「过期」是没有这一行，或者 `now − fetchedAt ≥ metadata.maxAgeHours`（0 表示每次都刷新）；「要重建」是 `builder` 和当前的不同。要重建时不联网，用 `cache/` 里这个来源的快照重建，`fetchedAt` 沿用旧值；快照没有或读不了就当作没有缓存。要下载（过期、没有缓存、重建不了）又没有 `--offline` 时，只刷新需要的来源：撞锁就用旧缓存继续（没有旧缓存是 `SYNC_IN_PROGRESS`，不等待）；下载失败有旧缓存就带 `STALE_METADATA`（`fix: "saltnet refresh"`），没有就报该来源的错。`--offline` 不下载：有缓存而且过期就带 `STALE_METADATA`，没有缓存是 `OFFLINE_NO_CACHE`。结果还给调用方 `meta.dataAsOf` 要的时间（`catalog`、`collections`）。
28. **P1-7b 的实现**：
    - 库里收藏品的 `kind` 用设计里的名字：落雪的四类是 `title`（原来的 `trophy`）、`icon`、`plate`、`frame`，随 CLI 版本写入的两类是 `character`（旅行伙伴）和 `partner`（搭档）。行的构造变了，所以 `CATALOG_BUILDER` 从 `catalog-1/…` 升到 `catalog-2/…`；`refresh` 输出的 `counts` 和 `meta_state.detail` 也用这些名字（落雪接口地址里的 `trophy` 是上游的名字，不动）。`replaceCollections` 只删落雪的四类，反过来静态数据的重写只删 `character`、`partner`，互不影响。
    - 迁移 3 `courses`（`STRICT`）：`courses`（id、position、name、模式 id 和名字、`base_dani_id`、`is_locked`、`unlock_course_id`、血量规则 `life_initial`、`life_recovery`、四个 `damage_*`）和 `course_tracks`（`course_id`、`position`、`chart_key`、`music_id`、`title`、`difficulty`）。`chart_key` 就是 `<曲目 id>-<难度>`，和 `charts.chart_key` 同一个格式，所以一首曲目能直接 `JOIN` 到谱面；国服曲库里没有的曲目只是连不上，不报错。旧库升级时迁移 3 只加表，不动已有的曲库行（有测试）。迁移 2 里 `collections` 表的注释补上了静态的两类，没有改表结构（迁移 2 还没发布过）。
    - `catalog/static.ts`：`staticBuilder()` 是 `static-1/<指纹前 12 位>`，指纹是下面这些数据的 sha256：段位（含 `courseSourceVersion` 和 `courseNetOpenId`）、旅行伙伴、旅行伙伴的流派表、搭档；前面的数字是这些行的构造方式，改了就加一。`ensureStaticData(store, now)` 在 `meta_state` 的 `static` 一行的 `builder` 相同时什么都不做（读一行就够，所以每个命令都可以调用），不同时在一个事务里整体重写三张表的静态行，并在事务里再查一次，因为等写锁的时候别的进程可能刚写过。`fetched_at` 记写入的时间，`detail` 记各类数量、`courseSourceVersion` 和 `courseNetOpenId`。它由 P1-7c 的 `ensureMetadata` 在读库之前调用；`refresh` 命令本身不碰它。
    - 测试：`tests/catalog/static.test.ts`（10 个：段位和血量规则逐列相等、曲目顺序、旅行伙伴和搭档的 `raw` 能还原成原数据、`course_tracks` 和 `charts` 按 `chart_key` 连接的数量等于网页端 `getCourseCharts` 的匹配数、`meta_state` 内容、数据相同时不重写、数据不同时重写、和落雪四类互不影响、`loadCollectionLists` 不会读到静态的两类）；`tests/store/migrations.test.ts` 加了两个（表的集合、旧库升级保留曲库行）；`store.test.ts` 和 `refresh.test.ts` 改用新的 `kind` 名字。
    - **偏离原计划**：P1-7 原本写「万花筒、段位、旅行伙伴、搭档随 CLI 版本写入」，万花筒这部分不做（第 27 条已说明理由：设计里没有它的视图，命令直接读 core 的数据）。
29. **P1-7c 的实现（`ensureMetadata`）**：
    - 入口是 `catalog/ensure.ts` 的 `ensureMetadata(deps, kinds)`：`kinds` 是这次命令要读的来源（`"catalog"` 曲库、`"collections"` 收藏品），只处理这些。命令里用 `commands/metadata.ts` 的 `useMetadata(args, ctx, kinds)`，它从 `ctx` 和 `--offline` 拼出依赖。返回已经读好的数据（和网页端相同的结构）、`dataAsOf`（给 `meta.dataAsOf`，只含要的项，时间带本机时区偏移）和 `warnings`；返回值的类型随 `kinds` 变，要 `["catalog"]` 就只有 `catalog` 一项。进来先 `ensureStaticData`（读一行 `meta_state`，没变就不写）。
    - 每个来源的状态和处理（第 24、27 条的备忘在这里定稿）：**新鲜**（有行、`builder` 是现在的、没到 `metadata.maxAgeHours`）直接读；**`builder` 不同**不联网，用 `cache/` 里的快照重建，`fetchedAt` 沿用原来的下载时间，`--offline` 下也重建；快照没有、不是 JSON、格式版本不对、转换不了、没有曲目或收藏品是空的，都算没有缓存；**过期**（`now − fetchedAt ≥ maxAgeHours`，0 表示每次都过期）就下载，失败、`--offline`、撞锁时用旧行并带 `STALE_METADATA`；**没有可用的行**就下载，失败就报错，`--offline` 是 `OFFLINE_NO_CACHE`，撞锁是 `SYNC_IN_PROGRESS`（不等待）。`fetchedAt` 在未来（时钟被拨回）不算过期。
    - 只下载到期的来源：`refreshCatalog` 多了 `sources` 参数，结果按它给的顺序。两个来源各自处理：一个失败不影响另一个已经下载好的（有旧行的那个带警告；没有旧行的那个让命令失败，但另一个已写入的数据保留）。没缓存又下载失败时，错误码用第一个失败的，消息列出每个来源的原因，`retryable` 和 `fix` 沿用。
    - 警告和错误的内容：`STALE_METADATA` 每个来源一条，写明小时数、上次下载的时间和原因（`--offline 不联网`、`刷新失败（…）`、`另一个 saltnet 进程正在刷新`），`fix` 是 `saltnet refresh`；`OFFLINE_NO_CACHE` 点出缺哪些来源，`fix` 也是 `saltnet refresh`（要先联网刷新一次）；`SYNC_IN_PROGRESS` 和 `refresh` 命令共用 `refreshBusyError`，`error.holder` 有 `pid` 和 `since`。
    - 并发：重建不拿 `metadata` 锁，而是在写入的事务里再查一次 `builder`，别的进程这时已经重建或下载过就不写（否则旧快照会盖掉更新的行，还把 `fetchedAt` 写旧）；下载拿 `metadata` 锁。新增 `Store.read(work)`：在 SQLite 的一个延迟事务里做几次查询，拿到一致的视图，不挡写入也不被写入挡。`loadMusic` 和 `loadCollections` 用它，所以另一个进程在中途提交刷新时，读到的不会是这次下载的曲目配上次下载的谱面，时间也和读到的行是一份。
    - 重构：`buildCatalog`（转换并拒绝没有曲目的文档）从 `refreshMusic` 里拆出来，下载和重建共用。
    - 测试：`tests/catalog/ensure.test.ts`（32 个：首次使用、只处理要的来源、静态数据只写一次、新鲜/刚到点/`maxAgeHours`/0/时钟拨回、过期后下载成功、失败、一个失败一个成功、没缓存的来源失败时另一个仍保留、`--offline` 的各种情形、别的进程在刷新、`builder` 不同时的重建和各种坏快照、别的进程抢先重建时不覆盖）；`tests/commands/metadata.test.ts`（8 个，用一个测试专用的命令走完整的 `runCli`，查 `meta.dataAsOf`、`warnings`、退出码 5）；`tests/store/store.test.ts` 加了 `store.read` 的 6 个（含一个反例：不用 `read` 的两次读取会不一致）。实现后我手工破坏了两处，去掉重建时的再检查、把过期判断改成 `>`，各有测试变红，之后恢复。

30. **P1-8 的实现（引用解析）**：
    - 代码在 `cli/src/catalog/songs.ts`（`buildSongCatalog`）、`cli/src/refs/difficulty.ts`、`song.ts`、`chart.ts`，另有 `util/fold.ts` 的 `foldName`（NFKC 加小写，只用来比较）和 `util/closest.ts` 新增的 `closestItems`（一个条目可以有几个名字，按最近的算；加了长度差剪枝，`closestMatches` 改为调用它，行为不变）。`chartKey(musicId, grade)` 成了命令行这边唯一写谱面 key 的地方，`catalog/store.ts` 也改用它。
    - **「一首歌」是 SaltMeta 的一个条目**：网页端把它的 SD 面和 DX/宴会面存成两个 `Music`（id 差 10000），`buildSongCatalog` 把它们合回一首歌：`id` 是 SaltMeta id，`musicId` 是这首歌被引用时用的曲目 id（有 SD 面用 SD id，否则用 DX id），别名取两面的并集。候选里的 `ref` 就是 `musicId`；`type` 是 `SD`、`DX`，两面都有的歌是 `SD+DX`（规格只写了 SD 和 DX，两面都有时没有别的写法；谱面的 `type` 仍然只有 SD 或 DX）。
    - 纯数字永远当曲目 id，找不到也不回退到标题（规格：标题是数字的歌要先 `search`）。找不到时给的候选是：id 加 10000 的 DX 歌（忘了加偏移的常见情形）、标题或别名正好是这个数的歌，`fix` 是 `saltnet search <数字>`。`数字-数字` 在曲目引用里取这张谱所在的歌，谱面必须存在。
    - 文字引用的顺序：原样标题、忽略大小写和全半角的标题、原样别名、忽略大小写和全半角的别名（规格写「精确别名」，我让它也先原样后折叠）、搜索索引。每一步命中一首就是找到，命中多首是 `AMBIGUOUS_REF`，一首都没有才下一步。`TRUST` 唯一命中 695，`trust` 命中 695 和 11726，所以有歧义，和规格一致。
    - **搜索索引这一步只认标题和别名，不认曲师**：库里存的索引还包含曲师，所以先用它筛出候选，再对这几首现算标题和别名的索引确认是歌名命中。否则 `song Youna` 会解析成「Link」，把曲师名当歌名用，是误判。规格只写了「搜索索引（简繁、拼音、罗马音）」，没有说含不含曲师；按曲师搜留给 P1-9 的 `search`。
    - 错误里的内容：`AMBIGUOUS_REF` 最多列 10 首，更多时写明总数和「只列出前 10 首」，并给 `search` 的 `fix`；`NOT_FOUND` 列最多 5 个最接近的（标题和别名的编辑距离，阈值同 `closestMatches`）；候选都按曲目 id 升序。回显用户输入只用 `echo`（短而朴素的词），带空格的标题不回显，消息改说「这个引用」，`fix` 也不带原文。`ErrorCandidate` 加了 `difficulty` 和 `level`（给谱面候选）。
    - 谱面引用：谱面 key 里已经有难度，再给难度参数必须一致，否则 `USAGE`；曲目引用不给难度是 `USAGE`；难度先于曲目检查，不认识的难度是 `USAGE` 并附最接近的写法；纯数字 id 只在这个 id 自己那一面找（`10146 rem` 找不到就是 `NOT_FOUND`，消息写「的 DX 部分」，候选是整首歌的谱面，里面能看到 SD 面的 `146-4`）；标题或别名两面都有这个难度是 `AMBIGUOUS_REF`，候选是两个谱面 key（带 `type`、`difficulty`、`level`），只有一面有就取那一面。**`--type` 对所有写法都是筛选**：id 或 key 的类型不符是 `NOT_FOUND`，并指出另一面的谱面 key（我没有把它当用法错误）。
    - 难度的写法：`bas/adv/exp/mas/rem/utage`、`basic/advanced/expert/master/re:master/remaster`、`0`–`4` 和 `10`、`绿黄红紫白宴`（也收繁体的 `綠黃紅`），不分大小写和全半角；标签用 core 的 `getChartDifficultySearchLabel`（`BASIC` 到 `Re:MASTER`，宴谱 `UTAGE`），不认识的 grade 原样写数字而不是冒充 MASTER。`--diff` 之类选项要用的枚举，等 P1-9、P1-10 真要用时再从这张表导出。
    - 测试：`tests/refs/difficulty.test.ts`（34 个）、`tests/catalog/songs.test.ts`（18 个）、`tests/refs/song.test.ts`（40 个：数字、谱面 key、各步的顺序、合并的宴谱、简繁和拼音和罗马音、曲师不算歌名、10 首上限、找不到时的候选和不回显）、`tests/refs/chart.test.ts`（27 个）、`tests/util/closest.test.ts` 加了 6 个。用固定的 SaltMeta 数据，规格里的两首「Link」和 `TRUST`/`Trust` 的例子都在其中；这份数据里没有的情形（标题压过别名、别名压过索引）用手造的小曲库。实现后我手工破坏了四处，把别名放到折叠标题前、索引不排除曲师、忽略 `--type`、数字找不到时回退到标题，各有测试变红，之后恢复。

31. **P1-9 拆成三步，并补上 `--with related`**：
    - 拆分原因：搜索要同时改 core（网页端共用，必须带 `pnpm build` 验证）和 CLI（排序、命令、引用解析），`song`/`chart` 又要写谱面行、评级和 combo 的标签、物量和统计的输出，一个提交太大。P1-9a 只动 core：`createMusicSearchVariants(text)` 返回 `{kind, text}[]`（`kind` 是 `text`、`pinyin`、`romaji`），顺序和去重与原来完全一致，`createMusicSearchIndex` 改为由它拼出，所以库里和网页端缓存里已有的索引不用重建（`MUSIC_SEARCH_INDEX_VERSION` 仍是 1）；测试里留一份原算法的拷贝，对固定数据逐项比对。P1-9b 是 `search` 命令和曲目搜索，P1-9c 是 `song` 和 `chart`。
    - **补一步 P1-14b**：设计 3.2 写了 `song --with related` 和 `chart --with related`，原计划没有安排。它要用收藏品、段位、万花筒三方的数据，放在 P1-14（收藏品）之后做。`chart --with` 的 `stages`、`friends`、`history`、`position`、`all` 依赖成绩，随 P2 加；P1 的 `--with` 只有 `related`。
    - 设计 3.2 说 `chart` 默认带成绩和简洁版吃分表。P1 没有成绩，吃分表要 P2-7 到 P2-9 把计算搬进 core 之后才有，所以 P1 的 `chart` 只有基本信息、谱师、物量和统计，`score` 和 `b50` 恒为 `null`；P2-18 起带成绩，P2-22 起带吃分表。

32. **P1-9b 的实现（`search` 和曲目搜索）**：
    - 引擎是 `catalog/search.ts` 的 `searchSongs(catalog, text)`，返回按相关度排好序的 `{song, score, matchedBy}`。`matchedBy` 的取值（`MATCH_KINDS`）是 `id`、`title`、`alias`、`pinyin`、`romaji`、`artist`、`charter`。规格 3.2 只写了标题、别名、拼音、罗马音，但网页端的搜索框也认曲师和谱师，数字则是 `song` 等命令接受的曲目 id，所以 `search` 都找，并在 `matchedBy` 里说明是怎么找到的；`resolveSong` 只认其中的 `title`、`alias`、`pinyin`、`romaji`（`NAME_MATCH_KINDS`），曲师和谱师的名字不能当歌名用（第 30 条）。
    - 匹配规则和网页端一样：规范化后的文本（全半角、大小写、标点和空格都不算，简体繁体一样）包含在某个拼写里。库里存的 `searchIndex`（曲目的标题、曲师、别名，谱面的谱师）只用来预筛：不含这段文本的歌直接跳过，不用现算它每个字段的拼写；没有索引的曲目（不是用共用的索引函数建的）筛不掉，所以预筛不会漏掉完整检查能找到的歌。真实数据（1440 首）上最坏的情形（`a`，命中 1376 首）0.43 秒。
    - 排序，一首歌取它最好的一次命中：标题原样相同 100、标题忽略大小写和全半角后相同 90、曲目 id 85、别名原样相同 80、别名折叠后相同 70、标题规范化后相同 60、别名规范化后相同 55、标题以文本开头 50、标题包含 40、别名包含 30、拼音或罗马音包含 25、曲师 20、谱师 10；分数相同按曲目 id 升序，所以同一份曲库和同一段文本永远给出同一个顺序。这样 `search` 的第一首就是 `song` 会解析成的那首（`TRUST` 的 695 在前，`Trust` 的 11726 在前），数字文本里 id 命中的歌排在只是标题包含这个数字的歌前面。数字文本既是曲目 id（SD 的 id 和 DX 的 id 都算，`11726` 找得到 DX 歌，`1726` 找不到）也是普通文本。
    - `resolveSong` 的最后一步改用 `searchSongs`：只留命中名字的歌，候选仍按曲目 id 升序，行为不变。`Song` 多了 `genre`（`search` 要显示）；`bpm` 留到 P1-9c，只有 `song` 用它。
    - `search <文本…>`：几个词用空格连起来，不用加引号，所以 `search 1 46` 搜的是文本「1 46」，不是 id 146；空文本是 `USAGE`；没有命中不算错（退出码 0，`items` 为空，`page.total` 是 0）；`--limit` 默认 10，规格 4.5 写明 `search` 是 10、其他列表是 50。每项是 `musicId`、`title`、`artist`、`genre`、`type`（`SD`、`DX` 或 `SD+DX`）、`matchedBy`。曲库过期、联网失败时用旧数据照常搜，并带 `STALE_METADATA` 警告。
    - 测试：`tests/catalog/search.test.ts`（28 个）和 `tests/commands/search.test.ts`（12 个）由 Gemini 3.8 Flash 按我写的行为说明写出；手造曲库的构造函数挪到 `tests/madeCatalog.ts`（我加了 `charter` 选项），`song.test.ts`（42 个）复用它。我核对了每个断言的期望来自行为说明和固定数据，而不是实现的输出，然后手工破坏实现 43 处（排序的每一档、id 只认 SD 或只认 DX、预筛的每条规则、`matchedBy` 的顺序、各个输出字段、默认 `--limit`、词的连接、警告透传、候选顺序……）。第一轮有 7 处没被发现：曲师和谱师的先后（两处）、词的连接、警告透传、`artist` 字段、候选顺序、「取最强关系」。前六处我补了 4 个测试和 1 条断言，全部变红；最后一处等价（简体化后的标题拼写总会给出同样的最强关系），没有测试能区分，代码保留（它写明了意图）。
    - 委托的经过：第一次运行没有产出，因为无头模式遇到不在白名单里的命令（`pnpm test:cli`）会放弃整次运行并丢掉改动；把它和 `pnpm test` 加进白名单、在提示里写明能用的命令之后，第二次成功（416 秒），补丁对实现没有异议。

33. **P1-9c 的实现（谱面行、`song`、`chart`）**：
    - 谱面行（`catalog/chartRow.ts` 的 `chartRow`）是设计 4.4 的结构：`chartKey`、`musicId`、`title`、`type`、`difficulty`、`level`、`constant`、`fitConstant`、`version`、`score`、`b50`，以后所有列谱面的命令都用它；`score` 和 `b50` 现在恒为 `null`，P2 带上成绩时再填，键不变。`constant` 不是正数时（宴谱上游给的是 0）是 `null`，`fitConstant` 同理。`version` 是这一面曲目的 `from`（国服版本名），所以一首歌的 SD 面和 DX 面可以不同（`146-3` 是 `maimai PLUS`，`10146-3` 是 `舞萌DX`）；`musicId` 同样是这一面的 id。
    - `chart` 另加 `charter`、`notes`、`stats`（设计 4.4：这三项占篇幅大，只在 `chart` 里给）。`charter` 没有或只有「-」时是 `null`。`notes` 是 `tap`、`hold`、`slide`、`touch`、`break`、`total`：SD 谱没有 `touch`（`null`，`total` 不含它）；宴谱的物量上游没有，转换成网页端结构时 `slide` 和 `touch` 被写成了 0，那不是物量，所以 tap、hold、break 都缺时整组都是 `null`；只缺一部分时缺的是 `null`，`total` 也是 `null`。`stats` 是 `samples`、`avgAchievements`、`avgDxScore`、`stdDevAchievements`、`rankDist`（`D` 到 `SSS+` 十四档）、`comboDist`（`none`、`FC`、`FC+`、`AP`、`AP+`），没有统计时是 `null`；键用游戏里的写法（4.5）。
    - **取整**（规格没写，我定的）：上游的拟合定数和统计有十五位小数，输出按网页端显示的精度取整：`fitConstant`、`avgAchievements`、`stdDevAchievements` 四位，`avgDxScore` 两位。取整只在输出这一层，P2 的 `b50 --mode fit` 照样按原始值算 rating。
    - `refs/status.ts` 只放现在要用的：`RANKS`、`COMBOS`、`rankLabel`、`comboLabel`（`null`、`FC`、`FC+`、`AP`、`AP+`）；sync 的标签和 `--achieved` 的条件解析到 P2 再加。
    - `song <曲目>`：曲目用 `resolveSong` 的全部写法；返回 `musicId`、`title`、`artist`、`genre`、`bpm`（宴谱是 `null`，`Song` 因此多了 `bpm`）、`aliases`（两面的并集）、`type`、`charts`（谱面行，SD 在前，各自从易到难）。位置参数是单个值，含空格的标题要加引号。当前用户的成绩（设计 3.2 写了）随 P2 加，`--with related` 是 P1-14b。
    - `chart <谱面> [难度] [--type sd|dx]`：写法见第 30 条，`--type` 是枚举，写错是 `USAGE`。标题重名的两首歌是曲目层的 `AMBIGUOUS_REF`（候选是两首歌，换成 id 加难度就行）；同一首歌两面都有这个难度时才是谱面层的 `AMBIGUOUS_REF`（候选是两个谱面 key）。成绩、吃分表和 `--with` 的 `stages`、`friends`、`history`、`position`、`all` 随 P2 加。
    - 在真实的公开 SaltMeta 数据上（临时 `SALTNET_HOME`）跑过 `song 146`、`song 标39`、`chart 146-3`、`chart 110018-10`、各种出错的写法和 `--format text`：真实数据里宴谱有拟合数据和统计，固定数据里没有，所以固定数据测不到「宴谱有统计」，只能靠手造的谱面。
    - 测试：`tests/refs/status.test.ts`（6 个）、`tests/catalog/chartRow.test.ts`（17 个）、`tests/commands/song.test.ts`（11 个）、`tests/commands/chart.test.ts`（11 个）由 Gemini 3.8 Flash 按我写的行为说明写出，`tests/commandRun.ts` 是它抽出的共用函数（`search` 的测试也改用了它，12 个仍然通过）。我逐条核对了期望值来自固定数据和行为说明（输出键的顺序、固定数据里每个谱面的定数、物量、统计），然后手工破坏实现 49 处（各个字段、取整位数、物量的 SD/DX 差异、宴谱的整组 `null`、`total` 的缺项规则、`charter` 的修剪、统计的分布顺序、`--type` 的处理、元数据和警告的透传……）。第一轮 4 处没被发现：`constant` 不是有限数时的 `null`、`fitConstant` 不是正数时的 `null`、`chart` 的 `meta.dataAsOf`，以及把 `!stat` 改成 `stat === undefined`。前三处我补了 1 个测试和 2 条断言，三处都变红；最后一处等价：库里读出的谱面没有统计时 `stat` 是 `undefined`，从不会是 `null`，统计对象也不会是假值，没有测试能区分，代码保留。
    - 委托的经过：第一次运行（201 秒）没有产出，因为 Gemini 用了 `pnpm --filter saltnet-cli vitest run …`，不在白名单里，无头模式放弃整次运行；放宽白名单（`--filter`、`exec` 的写法）并在提示里列出能用的命令之后，第二次成功（659 秒）。

34. **P1-10 的实现（`charts` 的筛选）**：
    - `charts` 一次只做筛选和分页：选项是 `--level`、`--constant`、`--diff`、`--version`、`--search` 和列表命令共有的 `--limit`、`--offset`、`--fields`，结果是 `data.items`（和 `song`、`chart` 同一种谱面行）加 `meta.page`。顺序固定为网页端的游戏内顺序（`createGameOrderComparator(MusicSort)`：难度高的在前，同一难度里新曲在前）；`--sort`、`--group-by` 是 P1-11（`--stats` 要用成绩，推到 P2，见第 35 条），所以现在写 `--sort` 会得到「未知选项」的 `USAGE`。`MusicSort`（`@core/music/sort.json`）网页端和 CLI 共用，不进数据库。
    - **`--fav` 推迟到 P2-25**：收藏夹的表和 `fav` 命令是 P2 的内容，P1 里没有任何办法建出一个收藏夹，现在加一个永远找不到名字的过滤选项只是死代码。P2-25 把 `favorites` 表、`fav` 命令和 `charts --fav` 放进同一个提交。这只是调整先后，没有改设计文档里 `charts` 的参数表。`--recent` 同理（依赖成绩变化记录，P2）。`--gate`、`--course`、`--plate`、`--collection` 是 P1-12。
    - `--level` 把等级放在同一条数轴上：`13` 是 13，`13+` 是 13.5。区间两端都含，所以 `13..14` 含 `13`、`13+`、`14`，不含 `14+`；要含就写 `13..14+`。单个值是精确匹配（`13+` 不含 `13`）。设计文档只写了区间格式，没有说 `+` 怎么算，这是照游戏里的写法定的：`13+` 比 `13` 难、比 `14` 容易。宴谱等级末尾的 `?` 可写可不写，比较时忽略，所以 `--diff utage --level 13` 找得到 `13?`。两端不是等级、或下限大于上限都是 `USAGE`。
    - `--constant` 区间两端都含，没有定数的谱（宴谱，核对时是 0 或缺失）一律不通过，包括只写一端的情况。
    - `--diff` 的取值和写法来自 P1-9a 的 `DIFFICULTIES`（`mas`、`master`、`3`、`紫` 都行，不分大小写和全半角），输出统一成短名。不写 `--diff` 时不含宴谱（和设计文档 3.3 一致：宴谱只有写了 `utage` 才返回）；写了就只要这些，所以 `--diff mas,utage` 两种都有。
    - `--version` 是列表选项，多个值取并集。每个值按从严到宽的顺序找，哪一步先找到就用哪一步：完整版本名（不分大小写和全半角）→ 省略 `maimai ` 或 `舞萌` 前缀的写法（`green`、`plus`、`dx 2024`；`plus` 只指 `maimai PLUS`，不是所有 PLUS）→ 牌子字（所有带这个字的版本，真实数据里 `真` 同时是 `maimai` 和 `maimai PLUS`）→ 只有一个版本名包含的片段（`2024`）。一个片段对应多个版本是 `AMBIGUOUS_REF`，候选的 `ref` 就是完整版本名；完全找不到是 `NOT_FOUND`，候选是最像的版本名，一个都不像就列最新的 8 个。版本表用 `catalog.metadata.cnVersions`（SaltMeta 的 `versions`），谱面的版本是 `music.info.from`。
    - `--search` 用 `search` 同一套匹配（`searchChartEntries`，在 `catalog/search.ts` 里）：歌的标题、别名、拼音、罗马音、曲师或 id 命中，就取这首歌的全部谱面；只有谱师命中的歌，只取那个谱师做的谱，和网页端按谱面搜谱师一致（`chart.info.searchIndex` 是每张谱自己的）。网页端的搜索还会匹配达成率、combo 和 sync 文本，这是成绩相关的，不照搬，CLI 用 P2 的 `--achieved`/`--missing`。
    - 真实公开数据（临时 `SALTNET_HOME`，离线）核对：共 5702 张谱，非宴谱 5637、宴谱 65；`--level 13..14` 1072 张、`13..14+` 1151 张；`--constant 13.7` 131 张；`--version 真` 378 张（`maimai` 186 张加 `maimai PLUS`）；`--diff utage --level 13` 20 张；`--version zzzz` 是 `NOT_FOUND` 且带候选，`--level abc` 是 `USAGE`。
    - 「谱面有定数」只有一个定义：`chartRow.ts` 的 `constantOf`（正的有限数，否则 `null`）。谱面行的 `constant` 和 `--constant` 筛选都用它，不会出现一边认 0、另一边不认的情况。
    - 测试：`tests/refs/level.test.ts`（12 个）、`tests/refs/version.test.ts`（12 个）、`tests/catalog/chartQuery.test.ts`（9 个）、`tests/commands/charts.test.ts`（7 个）、`tests/catalog/search.test.ts` 里的 `searchChartEntries`（5 个）和 `tests/madeCatalog.ts` 的 `charters` 参数，大部分由 Gemini 3.8 Flash 按我写的行为说明写出；说明里的期望值是我用独立脚本从固定数据算出来的（等级的几份列表我另外又算了一遍，逐项相同）。它报告了两处和说明不一致，都是说明写得不准，代码没有错：谱师 `ニャイン` 做的谱还有 `146-2`（说明里的列表不全，本来就要它从固定数据算）；固定数据里有几首歌不在 `MusicSort` 里（`10030`、`10225`、`11726`、`12025` 和几首宴谱），同一难度下它们的排序分数相同，所以「相邻两张的分数严格递减」只对在表里的歌成立，它据此改了断言。
    - 我逐条核对期望值之后手工破坏实现 57 处（等级的正则和换算、区间两端是否包含、反向区间、版本匹配的每一步和候选个数、`chartQuery` 的每个筛选和排序、宴谱的默认排除、定数的判断、只有谱师命中时只取那个谱师的谱、命令层的每个选项和 `meta`）。第一轮 7 处没被发现：`levelInRange` 对非等级的判断、版本的完整名精确匹配（`舞萌DX` 不该因为 `舞萌DX 2021` 里也有它而变成歧义）、`resolveVersions` 对首尾空格的处理、「找不到」时候选个数的上限、空白的搜索词（它不等于没有搜索）、没有谱师的谱。我补了 6 个断言或测试，前六处都变红；最后一处是等价的：`createMusicSearchVariants` 本身对空文本返回空表，`byCharter` 里的 `!!charter` 只是给类型用的。把「有定数」改成共用的 `constantOf` 之后又补了 5 处破坏，全部被发现。`charts --search ""` 是 `USAGE`（解析器不接受空值），不是空结果。
    - 委托的经过：这一次一次成功（788 秒），提示里列出能用的命令之后没有再被拒；快照里不含 `.env*`。

35. **P1-11 的实现（`charts` 的排序、分组和分页）**：
    - **这一步只做 `--sort default|constant|version`、`--asc`/`--desc` 和 `--group-by constant|version|level|difficulty`。** 设计 3.3 里的其他排序（`achievements`、`rating`、`playcount`、`recent`、`gain`）和分组（`rank`、`combo`、`sync`）要用成绩，加上 `--stats`、`--achieved`/`--missing`、`--recent`，都放在 P2-19 和 P2-23；现在写这些值是 `USAGE`，P2-19 要同步改 `tests/commands/charts.test.ts` 里对应的断言。
    - **方向**（规格没细说，我定的）：每个 `--sort` 都有自己的「自然方向」，默认就是它，`--desc` 可以不写；`--asc` 反过来。`default` 是网页端的顺序（难度高的在前，同一难度里新曲在前），`--asc` 就是整个反过来；`constant` 是定数高的在前；`version` 是版本新的在前。`--asc` 和 `--desc` 一起写是 `USAGE`，而且在取元数据之前就报，不会白白联网刷新。
    - **没有值的谱排在最后，不管往哪个方向排**：宴谱没有定数；谱面的版本不在 SaltMeta 的版本表里（以后新版本先出现在曲库里时可能发生）也没有位置。
    - **相同的谱按谱面 key（曲目 id，再难度）从小到大排，两个方向都是**，所以同样的数据和参数永远给出同样的顺序（设计 4.5）。代价是 `--asc` 不是默认顺序在并列处的逐项倒序，只是依据反过来。
    - **`default` 的顺序**复用网页端的 `createGameOrderComparator(MusicSort)`，原样，没有改 `sort.json`。固定数据里 `10030`、`10225`、`11726`、`12025` 和多数宴谱的 id 不在 `MusicSort` 里，它们在同一难度里并列，网页端对并列项的顺序取决于输入顺序，CLI 用谱面 key 定下来。`allChartEntries`（没有排序参数时的顺序）也用同一个比较函数。
    - **分组**：结果放在 `data.groups`，每组 `{key, count, items}`。`key` 是这组共有的值，写法和谱面行一致：定数写一位小数（`13.7`）、等级照数据（`13+`、宴谱的 `13?`）、难度是短名、版本是版本名；宴谱没有定数，写了 `--diff utage` 时它们自成一组，`key` 是 `null`，排在最后。组的顺序固定：定数从高到低、版本从新到旧、等级从难到易、难度从 BASIC 起；`--sort` 和 `--asc` 只排组里的谱，不改组的顺序。等级一样的组（`13` 和 `13?`）、版本表里没有的版本，按 `key` 的文字顺序排，不依赖谁先出现。
    - **分页对每一组分别生效**：`--limit` 和 `--offset` 取每组的第几条到第几条，`count` 是这一组一共有几张（不是这一页的条数），所以 agent 看得出每组还有没有。分组的结果没有 `meta.page`（一个总数、一个 `nextOffset` 对多个组没有意义）；`meta.dataAsOf` 和警告照常带。tsv 把所有组合成一张表、第一列是 `group`，text 是每组一个标题 `<key>（<count> 条）`加一张表（输出层 P1-4 就是这样定的）。
    - **测试**：`tests/catalog/chartSort.test.ts`（17 个）、`tests/catalog/chartGroups.test.ts`（13 个）、`tests/commands/charts.test.ts` 新增 14 个（共 21 个）和 `tests/madeChart.ts`（做一张编出来的谱的小工具），其中 43 个由 Gemini 3.8 Flash 按我写的行为说明写出，1 个（分组结果也带 `STALE_METADATA`）是我补的；期望值来自我用独立脚本从固定数据算出来的结果（175 张非宴谱，难度分组 42/42/42/42/7，等级 21 组、版本 20 组、定数 60 组，加宴谱的 `null` 组）。`cli` 的测试共 816 个。
    - **手工破坏实现 44 处**：谱面 key 的比较、各排序的比较和方向、没有值的排最后、版本位置的查找、并列时的次序、不改输入数组、各分组的 `key` 写法和位置、组的排序、`allChartEntries` 用游戏顺序、命令层的方向检查（要在取元数据之前）、选项的接线、每组分页、`count`、`meta`、警告。第一轮只有一处没被发现：分组的结果丢掉了 `STALE_METADATA` 警告（非分组的结果有测试，分组的没有）；我补了测试，再跑这一处变红。
    - **委托的经过**：测试和文档交给 Gemini 3.8 Flash，一次成功（481 秒），快照里不含 `.env*`；这一次说明和代码之间没有出入。我逐项核对了它写的期望值，并改掉了它在 AGENTS.md 里写得不通的一句。

36. **P1-12 的实现（`charts` 的 `--gate`、`--course`、`--plate`、`--collection`）**：
    - **四个选项都只收一个值**，可以和别的条件一起写，结果是所有条件的交集（门、段位、牌子、收藏品各自算成一个谱面 key 的集合，`chartQuery` 的 `within` 取它们的交集，再过其余筛选）。`--gate` 和 `--course` 的写法是随 CLI 带的静态数据解析的，所以在取元数据之前就解析，写错了不会白白联网；`--asc` 和 `--desc` 的检查仍然最先。`--plate` 和 `--collection` 要用落雪的收藏品，只有写了其中之一才取它们，`meta.dataAsOf.collections` 也只在这时才有；两份元数据都过期时有两条 `STALE_METADATA`（曲库在前，收藏品在后）。`--offline` 下 `--gate`、`--course` 只要曲库的缓存就能跑，`--plate`、`--collection` 没有收藏品缓存时是 `OFFLINE_NO_CACHE`（退出码 5）。
    - **查找的步骤**统一在 `refs/named.ts`（设计 3.1 里「id 或名称」那一条）：先看整个写法是不是某一项的 id、名称或简称（NFKC、不分大小写、不分全半角），整名命中不止一项是 `AMBIGUOUS_REF`；整名没有命中时，再看这段文字是不是**只有一项**的名称含有的一部分（`蓝`、`裏`），多项含有也是 `AMBIGUOUS_REF`；都没有是 `NOT_FOUND`。`AMBIGUOUS_REF` 最多列 10 个候选（多了就在消息里说「只列出前 N 个」），`NOT_FOUND` 列编辑距离最近的 5 个，没有近的就列兜底的清单（门是全部 10 个）。消息里回显写法用 `echo`（只回显短而普通的写法），候选的 `ref` 是可以直接换进去的写法。
    - **门**：`blue`、`蓝色之门`、`蓝门`、`蓝` 都是蓝门；`之门` 有七个门，是 `AMBIGUOUS_REF`，候选的 `ref` 是 id。结果是这个门的**钥匙曲目和各个选曲池里每首歌的全部难度**（宴谱照例只有写了 `--diff utage` 才出现），难度用 `--diff` 选，和规格 3.3 一致。没开放的门也能查，和曲库里有没有这些歌无关（曲库里没有的歌不出现）。**这里要更正我先前的一个想法**：门的数据里其实有难度，每个血量阶段（`lifePhases[].difficulty`）都带，网页端据此为每首歌只选一张谱（`getKaleidxscopePreferredGrade`）。`charts --gate` 不做这件事，因为规格要的是「门的曲目」，难度由 `--diff` 决定；「当前阶段每首歌一张谱」的视图是 P1-13 的 `kaleidxscope <门>`。钥匙曲目有一部分不在任何选曲池里（白门的 `11612`，红门的全部钥匙曲目），所以两部分都要算，测试里用白门核对。
    - **段位**：id（`551010`）、名称（`十段`）或只有一个段位的名称含有的一部分（`裏`、`真九`）；id 只整个匹配，`5510` 不是十段。结果按段位的**出场顺序**：`--sort default`（默认）第一首在前，`--asc` 反过来；写了 `--sort constant` 或 `version` 就按那个依据。曲库里没有的曲目直接不出现，剩下的顺序仍然连续。`charts.ts` 的 `--sort default` 在没有写 `--course` 时还是网页端的游戏内顺序。
    - **牌子**：只收版本牌子（`極`、`将`、`神`、`舞舞` 四类），写法有单个牌子（`熊極`）和网页端并成一个标签的写法（`熊華極`），后者对应标签里的第一个牌子（同一标签里的牌子要求相同）；也接受只有一个牌子或标签含有的一部分。不做简繁转换，`极` 找不到 `極`；`覇者` 这样不是版本牌子的要用 `--collection`，`--plate 覇者` 是 `NOT_FOUND`。一个版本牌子一定有条件（落雪数据里没有条件的牌子不会被归成版本牌子），但条件里可以没有曲目，这时和收藏品一样是 `USAGE`。
    - **收藏品**：`类型:id`（类型有 `plate`、`title`、`icon`、`frame`、`character`、`partner`，不分大小写，id 的前导零按数字读，找不到时回显写法原样）或整个名称。**不做名称的一部分匹配**：几千个名字里，一部分对应的是一堆而不是一项。单写一个数字不行（`5102` 是 `NOT_FOUND`），类型是 id 的一部分。名称重复很多（真实数据里有 308 个名字不止一项用），重复时是 `AMBIGUOUS_REF`，候选的 `ref` 是 `类型:id`；固定数据里 `デフォルト` 是 `plate:1`、`icon:1`、`frame:1`，`从整体中随机选择` 是 `plate:2`、`title:2`、`icon:2`、`frame:2`。
    - **没有曲目条件的收藏品没有谱面可选**：这样的收藏品（真实的落雪数据里，称号 3032 项中有 1460 项、头像 1059 项中有 1041 项、背景 353 项中有 296 项、姓名框 400 项中有 295 项没有曲目条件，旅行伙伴和搭档全都没有）选 `--collection` 是 `USAGE`（退出码 2），消息里写明名称和 `类型:id`，不是一个空结果，因为空结果会让 agent 以为「这个收藏品的曲目都没有谱面」。条件里有曲目、但国服曲库里没有这些曲目的谱面（固定数据里的 `千本桜`，曲目 125）是正常的空结果（`items: []`，`total: 0`）。真实的落雪数据里没有哪个收藏品把曲目条件和别的条件混在一起，也没有要求宴谱的。
    - **测试**：新增 67 个——`tests/refs/` 的 `named`（11）、`gate`（6）、`course`（8）、`plate`（5）、`collection`（11），`tests/catalog/chartSets.test.ts`（6）、`chartQuery` 的 `within`（2）、`chartSort` 的 `order`（3），`tests/commands/chartsSets.test.ts`（15，含两处改过的曲目和落雪数据）。`cli` 的测试共 883 个。期望值（谱面 key 和它们的出场顺序）是我用独立脚本从固定数据和核心的数据里算出来的；固定数据里的收藏品、版本牌子、门和段位的事实也都核对过。
    - **手工破坏实现 126 处**（解析的每一步和上限、各集合的内容、交集、`within` 与其余筛选的配合、排序里 `order` 的用法、命令层的接线、取元数据的时机、`dataAsOf` 和警告、各条 `USAGE` 的文字、选项的互相串用）。第一轮 124 处里有 6 处没被发现：收藏品的 `类型:id` 里 id 的回显、名称里混进 id（单写数字也能找到）、门的集合漏掉钥匙曲目（固定数据里每个门的钥匙曲目恰好也在选曲池里，要用白门核对）、`within` 之后别的筛选（搜索）被跳过、`--gate` 和 `--course` 一起写时互相串了写法。我补了 6 个断言或测试，加上牌子的 `USAGE` 路径（固定数据里所有版本牌子都有曲目条件，要改动落雪数据才走得到，补了 2 处破坏），8 处全部变红；没有等价的破坏。
    - **委托的经过**：测试和文档交给 Gemini 3.8 Flash，一次成功（672 秒），快照里不含 `.env*`。我写的说明里有一处错：把 `title:5101`（千本桜）说成没有曲目条件，其实它要求曲目 125，只是国服没有这首歌的谱面；Gemini 用 `it.fails` 标出来并报告了，我把它改成「空结果」，另用真的没有曲目条件的 `title:1`、`title:20`、`plate:101`、`icon:1`、`frame:2` 和一个旅行伙伴测 `USAGE`。它写的 `"熊華极".replace(...)` 这样绕弯的断言，和一个「缺省的 `order` 和显式 `undefined` 的结果相同」（自己跟自己比）的测试，我也改成了具体的期望值。上面那 6 个断言或测试、牌子的 `USAGE` 测试和 `title:5101` 的两个测试是我手写的。
37. **P1-13 的实现（`course list`、`course show`、`kaleidxscope` 和 `--at` 的时间解析）**：
    - **`course` 是两个字的命令组**（`course list`、`course show`，`COMMAND_GROUPS` 里给了说明），`kaleidxscope` 是单个命令；三个命令都不写数据，类别是 `gameplay`。成绩（`--user`）在 P2 加进来，现在谱面行里的 `score` 和 `b50` 恒为 `null`。
    - **`course list` 和不带门的 `kaleidxscope` 是静态的**：段位和门的数据随 CLI 一起发布，所以它们不要曲库、不联网、不建数据目录，结果没有 `meta.dataAsOf`，`--offline` 也照常成功。`course show` 和 `kaleidxscope <门>` 要曲库（一个段位的曲目、一个门的歌都要在曲库里找谱面），取元数据的方式和 `chart` 一样：过期就刷新，刷新失败用旧数据并带 `STALE_METADATA`，`--offline` 没有缓存是 `OFFLINE_NO_CACHE`。段位、门和 `--at` 都在取元数据之前解析，写错了不会白白联网。
    - **`course list` 的行**：`{id, name, mode, locked, unlockCourse, trackCount, life}`。`mode` 是模式名（段位认定、真段位认定）；`unlockCourse` 是要先通关的段位 `{id, name}`，不用解锁的是 `null`（核心数据里用 `unlockCourseId` 1001 表示没有，这个魔数不输出）；`life` 是 `{initial, recovery, damage: {perfect, great, good, miss}}`，字段名照核心数据，`baseDaniId` 没有用处，不输出。`recovery` 网页端只写成「恢复 +N」，核心数据里也没有说明；我按游戏里段位认定的规则理解成每首曲目结束后恢复的血量，手头没有游戏的数据可以核对，所以字段名不动，说明文字如果有出入只改说明。
    - **`course show`**：`course list` 的那一行，加 `tracks` 和 `missing`。`tracks` 是曲库里有的曲目，按出场顺序，每个是谱面行加一个 `track`（第几首，从 1 起，缺的曲目也占位，所以缺一首时 `track` 会跳号），`chartKey` 可以直接传给 `chart`；`missing` 是曲库里没有的曲目（新曲先出现在段位里、曲库还没收录时会发生，固定数据里就有很多），每个 `{track, chartKey, musicId, title, difficulty}`，`title` 取段位数据里的。一首曲目在一个段位里出现两次就列两次，不去重。
    - **`kaleidxscope`**：不写门是总览 `{at, gates}`，10 个门（没开的也在）各一行：id、名称、简称、区域、`opened`、`openedAt`、`keyCondition {summary, songCount}`、`currentPhase`、`nextPhase`；写了门是 `{at, 总览里的那些, description, lifeNote, phases, chartDifficulty, keyCondition {…, songs, pending}, pools}`。`phases` 是整个血量日历，每档 `{startsAt, endsAt, difficulty, life, status}`：一条血是数字，最终门是 `{first, second}`；`status` 是 `past`、`current` 或 `future`，刚好在开始的那一刻算 `current`；最后一档的 `endsAt` 是 `null`。`currentPhase` 是已经开始的最后一档，门没开时是 `null`；`nextPhase` 是第一个还没开始的，当前档就是最后一档时是 `null`。`opened` 用门自己的 `openedAt` 和 `--at` 比（和网页端 `getOpenedKaleidxscopeGates` 的判断一样，刚好在开放那一刻算开）。
    - **门里的歌怎么选谱**（和网页端一致，用核心的 `resolveKaleidxscopeSongChart`）：每首歌一张谱，难度用 `--diff`，没写就用当前血量阶段的难度（BASIC 取 BASIC、EXPERT 取 EXPERT、Re:MASTER 取 Re:MASTER，其余取 MASTER；门没开、没有当前阶段时取 MASTER）；这首歌没有那个难度时依次用 MASTER、EXPERT、它有的第一张，所以每行自己的 `difficulty` 才是准的，`chartDifficulty` 只说「查的是哪个难度」。歌按 music id 精确查（`146` 只有标准谱，`10146` 只有 DX 谱，不会串）。曲库里一张谱都没有的歌放进 `pending`（`{musicId, title}`）：新曲先出现在门里、曲库还没收录时会发生，固定数据里所有门的歌都是这样；`songCount` 是数据里点名的曲目数（`songs` 加 `pending`）。曲池带 `unlistedDescription` 的（乱码的第三曲，实际打的是乱码版曲目）和网页端一样不列曲目，`songs` 和 `pending` 都是空的，只有那句说明。`--diff` 不写门是 `USAGE`；它不接受 `utage`（门里的歌不是宴谱）。
    - **`--at`**：按指定的时间算开了哪些门、血量在哪一档，默认是现在。解析放在新的 `refs/time.ts`（`parseTime`、`parseTimeOption`）：ISO 8601，`T` 可以换成一个空格，秒和小数可以不写（小数只取前 3 位，截断不四舍五入），时区写 `Z`、`+08:00`、`+0800` 或 `+08`；没写时区就按本机时区算，只写日期就是那天本机时区的零点；不存在的时间（2 月 30 日、24 点、60 分、年份小于 100）是 `USAGE`，不会悄悄进位。设计 4.1 说 `--since` 还要接受 `7d`、`24h` 这样的相对时长，到 `history` 那一步加到这个模块里，`--at` 只收绝对时间。
    - **`parseTime` 只留必要的检查**：月份写成 0 或 13 会让 `Date.UTC` 的年份变化，小时写成 24 以上会让日期变化，所以只比较年和日就能发现；单独再比月和小时是多余的（第一轮破坏检查里「去掉月份检查」改不出任何不同，是等价的破坏），我把这两处删了，注释里写明为什么只比年和日。分钟和秒写成 60 只会进位到小时或分钟，所以这两个要单独限制在 59 以内。
    - **时间都按本机时区写**（设计 4.5）：血量日历原本是北京时间发布的，东八区以外的机器上看到的是换算后的时间。Gemini 写的测试比较的是时刻（`new Date(x).getTime()`），这样数据里的时间被原样输出（没换成本机偏移）也能通过，破坏检查里就有 4 处因此没被发现。现在 `tests/zone.ts` 的 `useTimeZone` 在测试文件里把 `TZ` 固定成 `America/New_York`（冬令 UTC-5，夏令 UTC-4，既不是 UTC 也不是东八区），断言写成完整的字符串（如 `2026-01-22T21:00:00-05:00`），并且这五个测试文件在 `TZ=Asia/Shanghai`、`America/New_York`、`UTC`、`Pacific/Auckland` 下各跑了一遍，都通过。
    - **没做的**：成绩（`--user`、每首歌自己的 `score`）在 P2；`charts --gate` 不变，仍是门涉及的全部难度的谱（见第 36 条）。
    - **验证**：五个测试文件共 101 个测试（Gemini 写了 92 个，我补了 9 个和若干断言），CLI 全部 65 个文件 984 个测试。写给 Gemini 的说明里的期望值，我都先用真实的离线数据（1440 首歌、5702 张谱）核对过。破坏检查共 134 处（`time.ts` 34、`courseView.ts` 21、`gateView.ts` 45、`course.ts` 13、`kaleidxscope.ts` 21），第一轮 135 处里 13 处没被发现：一位数的月份（`2026-1-01` 被接受）、多余的月份检查（等价，见上）、`locked`、`trackCount` 和 `track` 的字段顺序没有断言、4 处时间没换成本机偏移（见上）、一首歌既没有要的难度、也没有 MASTER 和 EXPERT 时「取第一张」的退路没测、一首歌在门里出现两次时被去重没测、以及 2 处「先解析再取元数据」的断言其实是空的（同一个数据目录里前面的调用已经把曲库缓存好了，之后不联网本来就是对的），改成每个用例用全新的数据目录，并断言数据目录根本没有建出来。补完以后 134 处全部变红，没有幸存的。
    - **「第一张谱」是最难的那张**：`resolveKaleidxscopeSongChart` 最后的退路是传进去的谱面里的第一张，命令传进去的谱面是游戏的顺序（最难的在前），所以一首没有指定难度、也没有 MASTER 和 EXPERT 的歌给出的是它最难的那张，不是最简单的；网页端传的是曲目页当前排序下的谱面，退路取到哪张取决于排序，CLI 固定用游戏的顺序；测试里写明了。
    - **委托的经过**：测试和文档交给 Gemini 3.8 Flash，一次成功（585 秒），快照里不含 `.env*`。说明里给出的期望值都先用真实数据核对过，Gemini 照着写，没有提出分歧。它写的 AGENTS.md 里有两处我手工改了：一处括号多了一个，一处把 `parseTime` 和 `parseTimeOption` 写混了。上面的 9 个测试、`tests/zone.ts` 和破坏检查之后的所有断言是我手写的。
38. **P1-14 的实现（`collection list` 和 `collection show`）**：
    - **`collection` 是两个字的命令组**（`COMMAND_GROUPS` 里给了说明），类别 `collection`，不写数据。用户的数据（是否拥有、进度、每张谱做没做）要到 P2 才有，现在 `owned`、`progress` 和 `done` 恒为 `null`，先占着位置，到时候只是填上值，不改名也不删字段（设计 4.4）。设计里的 `--all`、默认只列没做完的、按拥有状态筛选和 `collection list` 的「大致进度」都跟着用户数据，放在 P2-24。
    - **`collection list` 只要收藏品，不要曲库**：命令只调 `useMetadata(["collections"])`，数据目录是空的时只请求落雪的四个列表（trophy、icon、plate、frame），不请求 SaltMeta；`meta.dataAsOf` 只有 `collections`，过期的警告也只有「收藏品（落雪）」一条。`--offline` 下没有缓存是 `OFFLINE_NO_CACHE`，有缓存就一个请求也不发。
    - **行的字段**：`{ref, kind, id, name, genre, color, description, songCount, owned, progress}`。`ref` 是 `类型:id`（如 `title:5108`），可以直接给 `collection show` 和 `charts --collection`；`genre` 是游戏里把它归在哪一类，搭档没有，是 `null`；`color` 只有称号有（Normal、Bronze、Silver、Gold、Rainbow），其他类型一律 `null`，哪怕数据对象上带着 `color`；`songCount` 是获取条件点名的不同曲目数，按 music id 数（`dx` 的曲目 id 小于 10000 时加 10000，和核心的 `getSaltNetMusicIdForChartType` 一致，`standard` 和 `utage` 用原来的 id），不同条件里的同一首只算一次，没有曲目条件的是 0。
    - **顺序和筛选**：先按类型（plate、title、icon、frame、character、partner），再按落雪列表里的顺序；`--kind` 写的顺序不影响结果（`--kind frame,plate` 还是牌子在前），只收这六个英文名，写错是 `USAGE`，在联网之前就报。`--search` 只搜名称：不分大小写和全半角（NFKC 加小写），先去掉两端的空白，不做简繁转换，不搜分类、描述和 ref（描述多是「全曲/BASIC～MASTER/ALL PERFECT」这类固定写法，搜进去会命中一大批）；只有空白是 `USAGE`，同样在联网之前，不建数据目录。
    - **`collection show` 的引用**：`类型:id`（类型大小写都行）或完整的名称，用 `resolveCollection`，不做名称的一部分匹配；名称很短又常重名（`デフォルト` 同时是牌子、头像和背景的名字），重名时是 `AMBIGUOUS_REF`，候选的 ref 写成 `类型:id`，可以直接拿去重试。先取收藏品并解析引用，然后才取曲库，所以写错或有歧义的引用不会去下载曲库（测试里断言了这时只发了落雪的四个请求）。
    - **`collection show` 的结果**：`{collection, missing, items}`。`collection` 是列表里的那一行加 `requirements`，也就是获取条件，每条 `{difficulties, rank, combo, sync, songCount}`：`difficulties` 是要求的难度（`null` 是任意难度都行，数据里写空列表也当作任意），`rank`、`combo`、`sync` 是至少要达到什么（不要求的是 `null`，三个都是 `null` 就是打过就行），`songCount` 是这一条适用于几首歌。`items` 是条件点名的谱面，谱面行（`chartRow`）加 `done`，顺序和 `charts` 一样，`--limit` 和 `--offset` 只翻 `items`，`collection` 和 `missing` 总是完整的，`page.total` 是谱面数。没有曲目条件的收藏品（多数称号、头像和背景，所有旅行伙伴和搭档）`items` 是空的，命令照常成功，获取方式只有 `description` 里那句话。
    - **`missing`**：条件点名、但曲库里没有的歌（多半是国服还没有的歌），每首 `{musicId, title}`，同一首只出一次，按数据里的顺序，标题用最先点名它的那条条件里的写法。歌在曲库、只是没有条件要的难度，不算缺。
    - **`meta` 和警告**：`dataAsOf` 同时有 `catalog` 和 `collections`，警告先曲库后收藏品（和 `charts` 一致）；两个都过期又都刷新不了时有两条 `STALE_METADATA`，只有收藏品过期时一条。`--offline` 下只存了收藏品、没有曲库时是 `OFFLINE_NO_CACHE`，信息里点名「曲库（SaltMeta）」。
    - **新增 `syncLabel`**（`refs/status.ts`）：`SyncStatus` 在游戏里的写法 `SYNC`、`FS`、`FS+`、`FDX`、`FDX+`，没有是 `null`（评级和连击的 `rankLabel`、`comboLabel` 早就有）。
    - **真实数据**：落雪的真实列表加上随 CLI 带的静态数据，一共 5783 个收藏品（姓名框 400、称号 3032、头像 1059、背景 353、旅行伙伴 917、搭档 22），分类都有值，只有搭档的分类是 `null`，旅行伙伴和搭档的 `description` 是空串。固定测试数据是 966 个（27 个落雪的加 917 个旅行伙伴和 22 个搭档），其中几个收藏品点名的歌曲库里没有（`plate:409506`、`title:5101`、`title:158511` 等），所以 `missing` 有真实的测试数据。写给 Gemini 的说明里的期望值，都先用固定数据和探测脚本核对过。
    - **没做的**：`owned`、`progress`、`done` 的值、`--all`、默认只列没完成的、按拥有状态筛选（P2-24）；`song` 和 `chart` 的 `--with related`（用到这首歌或这张谱的收藏品、段位和门）是下一步 P1-14b。
    - **验证**：新增 30 个测试（`status` 2 个、`collectionView` 13 个、`collection` 15 个，Gemini 写了 28 个，我补了 2 个），CLI 全部 67 个文件 1014 个测试。破坏检查共 86 处（`status.ts` 7、`collectionView.ts` 48、`collection.ts` 31），第一轮 85 处变红，1 处没被发现：同一条条件里把同一首歌点了两次时，这一条自己的 `songCount` 不去重（Gemini 的用例里重复的歌只检查了整个收藏品的 `songCount`）。补了这个测试以后 86 处全部变红，没有幸存的。
    - **委托的经过**：测试和文档交给 Gemini 3.8 Flash，一次成功（559 秒），快照里不含 `.env*`，没有提出分歧，AGENTS.md 的改动和说明里要求的一致。它的报告说 `tsc` 是干净的，我重跑后 `collection.test.ts` 报了 26 处 TS7006（命令输出的 `json.data` 是 `any`，回调参数没有类型），照 `charts.test.ts` 的写法加了 `ListOutput` 和 `ShowOutput` 两个类型；另一个手补的测试是 `collection show --fields`（只投影 `items`，`collection` 和 `missing` 不受影响，未知字段是 `USAGE`）。
39. **P1-14b 的实现（`song` 和 `chart` 的 `--with related`）**：
    - **含义**：`related` 是「用到这首歌（或这张谱）的东西」：条件点名了它的收藏品、把它排成曲目的段位、拿它做钥匙歌或曲池歌的门。一首歌用到的东西，是它的任何一张谱用到的东西的并集（SD 和 DX 是两面，条件点名哪一面就是哪一面）。三种东西各走 `charts` 的 `--collection`、`--course`、`--gate` 用的同一套规则，所以「一张谱出现在 related 里」和「那个 `charts` 筛选会给出这张谱」是一回事；测试里用四个属性测试逐张谱对着核心函数核对（收藏品对 `collectionChartEntries`，段位对 `courseCharts`，门对 `gateCharts`，整首歌对它每张谱单独的结果）。
    - **只有写了 `--with related` 才有**：不写时 `data` 里没有 `related`、不去取落雪的收藏品，`meta.dataAsOf` 只有 `catalog`，和以前完全一样。`--with` 是逗号分隔的列表（`related,related` 可以），目前只收 `related`，别的值（包括 `all`）是 `USAGE`，在联网之前就报，不建数据目录。设计里 `chart` 的 `--with` 还有 `stages`、`friends`、`history`、`position` 和 `all`，它们要用户的成绩，跟着 P2 加。
    - **取收藏品的时机**：先取曲库、解析曲目或谱面，然后才取落雪的四个列表，所以写错的引用不会去下载收藏品（测试里断言这时只发了 `META_URL` 一个请求）。请求顺序是曲库在前、收藏品在后，和 `collection show` 相反（那边要先解析收藏品引用）。`meta.dataAsOf` 同时有 `catalog` 和 `collections`，警告先曲库后收藏品；`--offline` 下没有缓存收藏品是 `OFFLINE_NO_CACHE`，信息点名「收藏品（落雪）」；收藏品过期而曲库没过期时只有一条警告。
    - **`related` 的形状**：`{collections, courses, gates}`，三个键永远都在，没有就是 `[]`。
        - `collections[]` 是 `collection list` 里的那一行（十个键）加 `requirements`：只列点名了这首歌的条件（不是整个收藏品的全部条件），按数据里的顺序，每条是 `collection show` 里的条件（`difficulties`、`rank`、`combo`、`sync`、`songCount`）再加 `charts`，也就是这条条件对这首歌的哪几张谱适用（谱面 key，按谱面的顺序）。条件和行里的 `songCount` 仍然是整条条件、整个收藏品点名的歌数，不是「只数这一首」。条件点名了这首歌、难度也要符合才算（没写难度，或写了空列表，就是任意难度），判断用核心的 `requirementMatchesChart`。`title:5102` 只点名 DX 的《39》，所以 `song 146` 的 `charts` 是 `10146-0`～`10146-3`，而 `chart 146-3`（SD）的 `related` 三个列表都是空的。顺序是 `collection list` 的顺序（牌子、称号、头像、背景、旅行伙伴、搭档，各自按落雪列表的顺序），不按 ref 或 id 另排。
        - `courses[]` 是 `course list` 里的那一行加 `tracks`：这首歌在这个段位里是第几首，每条 `{track, chartKey, difficulty}`，`track` 从 1 起；同一张谱在一个段位里出现两次就列两条；`trackCount` 是整个段位的曲数，不是命中的曲数；`unlockCourse` 的名字在传进来的同一份段位列表里查，查不到是 `null`。顺序是 `course list` 的顺序。
        - `gates[]` 是 `{id, name, shortName, region, key, pools}`：`key` 是钥匙条件有没有点名这首歌，`pools` 是它在哪几个曲池里，每个 `{track, label}`（没有 `label` 的是 `null`），按曲池的顺序。门只按歌（music id）认，不看难度，和 `charts --gate` 一致；门在这里是静态的，不带 `opened`，开没开放看 `kaleidxscope`。顺序是 `kaleidxscope` 总览的顺序。
    - **乱码门里加密的曲池**：以前 `gateCharts` 把门里所有曲池的歌都算进去，包括乱码门第 3 首那个带 `unlistedDescription` 的曲池（歌 11879，播的是乱码谱面，不是一张普通谱）；网页的总览和 `gateDetail` 早就不列它。现在 `chartSets.ts` 多了 `listedPools` 和 `gateMusicIds`，`gateCharts`（也就是 `charts --gate noise`）和 `related` 都不再把它当作这个门要的歌，三处一致。国服的曲库里没有 11879，所以对现在的真实数据没有影响，只是把规则讲齐。
    - **代码放在哪**：`catalog/relatedView.ts` 是纯函数 `relatedTo(charts, sources)`，`sources` 带全部收藏品，段位和门不给就用随 CLI 带的那份（给空数组就是没有，测试里靠这个造出做出来的段位和门）；`commands/withRelated.ts` 是 `withOptions()`（`song`、`chart` 把它展开进自己的 `options`）和 `loadRelated(args, ctx, charts)`（没写 `related` 就返回 `undefined`，不碰网络；写了就 `useMetadata(["collections"])` 再 `relatedTo`）。P2 要往 `--with` 里加成绩类的值时，也加在这里。`collectionView.ts` 的 `requirementRow` 现在导出了。
    - **没做的**：`--with` 的 `all`、`stages`、`friends`、`history`、`position`（P2）；`related` 里收藏品的 `owned`、`progress`（随用户数据，P2-24）。
    - **验证**：新增 41 个测试（`relatedView` 19 个、`chartSets` 3 个、`song` 10 个、`chart` 9 个，Gemini 写了 40 个，我补了 1 个），CLI 全部 68 个文件 1055 个测试。四个属性测试拿核心里另外写好、另外测过的函数来核对：固定测试数据里的每一张谱对着 966 个收藏品（`collectionChartEntries`）和随 CLI 带的全部段位（`courseCharts`），门里点名的 235 首歌对着 `gateCharts`，再加「整首歌的结果 = 它每张谱单独结果的并集」。破坏检查共 90 处（`relatedView.ts` 55、`withRelated.ts` 8、`chartSets.ts` 7、`song.ts` 11、`chart.ts` 9），第一轮 88 处变红，2 处没被发现：段位的输出顺序（倒过来、按 id 排）。Gemini 的段位用例里同时命中的段位只有一个，我补了「两个段位同时命中、列表顺序和 id 顺序相反」的测试，补完 90 处全部变红，没有幸存的。
    - **委托的经过**：测试和文档交给 Gemini 3.8 Flash，一次成功（766 秒），快照里不含 `.env*`，没有提出分歧。这次的说明里特别写了「`json.data` 是 `any`，回调参数要写类型」和「`tsc` 的输出要原样引用」，它报告 `tsc` 干净，我重跑后确实干净（上一步是 26 处 TS7006）；AGENTS.md 的四处改动和说明里给的原文一致。
40. **P1-15 的实现（`status` 和 `config`）**：
    - **`status`**：不联网，也不创建数据目录（数据库文件不存在就不打开：`database` 是 `{exists: false, schemaVersion: null}`，两项数据都是 `missing`）。`data` 是 `{version, home, database, metadata, mergedDuplicates}`，`metadata` 是 `{maxAgeHours, catalog, collections}`，后两项各是 `{source, label, state, fetchedAt, ageHours, upstreamVersion, counts}`；`meta.dataAsOf` 只列已经存下来的来源（`catalog`、`collections`）；`warnings` 现在恒为空。
        - **`state`**：`missing`（没存过）、`other-version`（存的行是别的版本的 CLI 建的，下次用到时会重建）、`stale`（超过 `metadata.maxAgeHours`，下次用到时会重新下载）、`fresh`。过期用 `ensureMetadata` 同一个判断（`isExpired` 现在导出了），所以正好到 `maxAgeHours` 就算过期，`maxAgeHours` 为 0 时一直是过期；`other-version` 排在过期前面，因为不管多新鲜都要重建。`ageHours` 保留一位小数，时钟比下载时间还早时是 0，不会是负的。过期不算警告：`status` 本来就是用来看这些的，警告留给真正去读数据的命令。
        - **`counts` 和 `mergedDuplicates`**：`counts` 是下载时记下的数量（曲库是歌、谱面、版本，收藏品是各类各几个），取 `meta_state.detail` 里的数字；`mergedDuplicates` 是最近一次下载曲库时合并掉的上游重复宴谱（设计 3.1 说要在 `status` 里列出），读不懂的条目丢掉，每条只留 `id`、`title`、`mergedTitles`。
        - **用户和凭据还没有**：设计 3.2 的 `status` 还要列用户列表和凭据状态，这一步没有用户可列，所以没做；P2-15（`user` 命令）加 `users`，P3-14（落雪 token）加凭据状态并由 `status` 给出 `LXNS_EXPIRING`，两处的计划行已经写上。
    - **`config`** 是一个命令组 `config list|get|set|unset`（设计里只有一行 `config`）：`list`、`get` 不改任何东西（effect `none`），`set`、`unset` 是 `local`；四个都设了 `allowBadConfig`，配置坏了也能用它们去修。
        - **行**：`{key, value, source, default, env, type, description}`，顺序固定。`value` 是现在生效的，`source` 是它从哪来（`env`、`file`、`build`、`default`），`default` 是没有环境变量和 `config.json` 时的值（构建时带进来的默认值也算，并像输入的值一样整理，例如去掉地址结尾的 `/`；`defaultConfigValue` 从 `resolveConfig` 里提了出来，两边用同一份），`env` 是覆盖它的环境变量名，`type` 是用话说的取值范围。`config list` 的 `data` 是 `{file, items, problems}`，`problems` 是读配置时发现的全部问题（含 warning），`meta.page` 照常，`--limit`、`--offset`、`--fields`、`--format tsv` 都能用。
        - **键只认完整的名字**：点号连接的全名，不分大小写和全半角（`resolveSetting`）；不做「名字的一部分」或最后一段的简写，因为 `set` 和 `unset` 要写文件，认错了比报 `NOT_FOUND` 糟得多。`NOT_FOUND` 带最接近的键（`metadata.maxAgeHour` 只给 `metadata.maxAgeHours`），差得远就给表里的前 10 项。
        - **`set`**：值先按这项设置的类型检查（`parseConfigText`），不合法是 `USAGE`，信息 `设置 <键> 应该是…`；数字和枚举回显收到的值，地址和文字不回显，因为可能带凭据。结果是这项设置现在的样子，`changed` 放最前面：文件里原来就是这个值时 `changed` 是 `false`，不写文件（文件一个字节不动）。环境变量比 `config.json` 优先，所以环境里已经设了的话 `set` 照样写文件，结果里 `source` 还是 `env`、`value` 还是环境的值，调用方一看就知道。
        - **`unset`**：去掉这一项，组空了就连组一起去掉，什么都不剩时文件是 `{}`；没有文件、没有这个组或这一项时什么也不写，也不建目录，`changed` 是 `false`。
        - **`config.json` 的写法**：整个文件读成普通 JSON，只改这一项，别的（这个版本不认识的设置、别的组、原来的顺序）原样保留；写回去是两个空格缩进加结尾换行，新的组加在最后；组不是对象（例如 `"lxns": 5`，它本来就是个错误）就整个换掉。文件不是合法 JSON、不是 JSON 对象、或者读不了时，`set` 和 `unset` 都不碰它，报 `USAGE`，信息里写明「没有改动，请先修好或删掉 <路径>」，因为重写会丢掉用户写的东西；只是某一项的值不合法（例如 `"maxAgeHours": "abc"`）不算，可以直接 `set` 改好或 `unset` 去掉。数据目录不存在时由 `set` 建（目录 0700、文件 0600）。
        - **整份文件一次写好**：`runtime/files.ts` 的 `writeFileAtomic` 先写同目录里的临时文件，再改名盖过去，别的进程读到的要么是旧的要么是新的；`catalog/snapshots.ts` 以前自己写这一段，现在也用它。
    - **措辞**：配置问题和 `config set` 的错误信息里，「应该是」后面的取值说明以字母或数字开头时（`1 到 3650 的整数`、`json 或 text`、`http 或 https 地址`）原来紧贴着「应该是」，现在中间有一个空格（`应该是 1 到 3650 的整数`）；以汉字开头的（`非空文字`）不变。`tests/runtime/config.test.ts` 里两处旧期望随之改了。这是已有消息的措辞改动，错误码和别的内容都没变。
    - **代码放在哪**：`commands/status.ts`、`commands/config.ts`；`catalog/statusView.ts`（`sourceStatus`、`mergedDuplicatesOf`；`ensure.ts` 的 `isExpired` 和 `HOUR_MS` 导出供它用）；`runtime/configFile.ts`（`setConfigEntry`、`unsetConfigEntry`）、`runtime/configRows.ts`（`settingRow`、`settingRows`）、`runtime/files.ts`（`writeFileAtomic`）；`refs/setting.ts`（`resolveSetting`）。`tests/commandRun.ts` 的 `commandIn` 多了 `env` 选项，测试用它给一次运行加或去掉环境变量。
    - **验证**：新增 106 个测试（`files` 7、`configFile` 20、`configRows` 4、`setting` 7、`statusView` 10、`status` 10、`config` 命令 39、`runtime/config` 9；Gemini 写了 96 个，我补了 10 个），CLI 共 75 个文件 1161 个测试。破坏检查共 124 处（`files.ts` 7、`configFile.ts` 24、`configRows.ts` 11、`setting.ts` 8、`runtime/config.ts` 7、`statusView.ts` 22、`status.ts` 19、`commands/config.ts` 24、`index.ts` 1、`snapshots.ts` 1），第一轮 123 处里 121 处变红，2 处没被发现：`set` 的结果里 `changed` 不在最前面，和 `config get` 里用户代理的默认值带 CLI 版本（只在 `list` 里测过）。我补了对应的测试，再加上第 124 处「`set` 和 `unset` 的结果行用了另一个版本号」，三处全部变红，没有幸存的。
    - **我补的测试**：读 Gemini 的测试时我看出几处缺口，先补了 7 个测试（`set` 和 `unset` 的键不分大小写和全半角；`config.json` 整个是 `null`、数字、字符串、`true`，或者其中的组是 `null`、数组；字符串 `"12"` 不等于数字 12），以及几条断言（`maxAgeHours`、`clientId` 单独写也是 `NOT_FOUND`；100 分钟的 `ageHours` 是 1.7；`mergedDuplicates` 里缺标题、缺 `mergedTitles`、混着数字的条目要丢掉；`config unset --help` 和 `config get --help` 的副作用说明）。第一轮破坏检查是在这些都加上之后跑的；检查之后又补了上面说的 3 个测试。Gemini 对 `-1` 只断言了错误码，我改成断言完整的消息（负数是值，不是选项）。
    - **委托的经过**：测试和文档交给 Gemini 3.8 Flash，一次成功（640 秒），快照里不含 `.env*`。它提出一个分歧：`status --pretty` 的缩进，我的说明写成了 4 个空格，其实 `--pretty` 是每层 4 个空格、`data` 里的键在第二层，所以是 8 个；是说明写错了，Gemini 照实报告、没有去改这个测试，我把它改成检查信封的 `"v"`（4 个空格）和 `"version"`（8 个空格）。`tsc` 它报告干净，我重跑后确实干净；AGENTS.md 的四处改动和说明里给的原文一致，我另外在 `tests/commandRun.ts` 那句后面补了「测试可以加或去掉环境变量」。
41. **P1-16 的实现（`sql` 命令和对外视图）**：
    - **设计 2.2 改了做法：在内存沙盒里跑，而不是在只读连接上装 authorizer**：设计写的是「`sql` 用只读连接执行，再用 `setAuthorizer` 限制成只能读这些视图」。试下来这条路不严：SQLite 报告对视图的读取时，给 authorizer 的是底层表的 `SQLITE_READ`，不带「是通过哪个视图读的」，所以 `SELECT count(*) FROM <底层表>` 和 `SELECT count(*) FROM <视图>` 在 authorizer 眼里没有区别，放行后者就放行了前者；查询里用 CTE 起一个和视图同名的名字，还能冒充视图的上下文。目标没变（只能读这些视图、写不了东西、读不到基础表，设计的验收标准里也这么写），办法换成让查询根本够不到基础表：每次执行开一个内存数据库，只把查询里写到的视图复制进去（`CREATE TABLE` 加 `INSERT … SELECT`，列的类型保留），然后断开真正的数据库，用户的 SQL 在只有这些副本的连接里跑。设计文档的那句话同一个提交里改了，`AGENTS.md` 也写了。
        - **复制的时候**：真正的数据库用 `file:` 地址加 `?mode=ro` 以只读 `ATTACH`（路径用 `pathToFileURL`，空格、`?`、`#`、`%` 都转义，Windows 路径也是这个形式），复制所有视图和 `readAlso`（`sql` 用它读各来源的下载时间）在同一个事务里，所以是同一份快照（WAL 下另一个进程这时写入，快照里没有，有测试），复制完 `DETACH`，再装限制。没有写到任何视图的查询不打开数据库文件，所以 `SELECT 1` 在数据目录还不存在时也能跑，也不会建出它。
        - **限制有三层**：authorizer 默认拒绝，只放行 `SELECT`、`RECURSIVE`、对这几个视图副本的 `READ`（表名转成小写再比，SQL 名字本来就不分大小写）、`json_each`、`json_tree`、`jsonb_each`、`jsonb_tree` 和普通函数（`load_extension`、`fts3_tokenizer`、`readfile`、`writefile`、`edit` 除外）；`PRAGMA query_only = ON`；`enableDefensive(true)`（这个 Node 默认就是 defensive，沙盒自己也要一次，不靠 Node 的默认；SQLite 自己默认是关的）。后两层在 authorizer 之外，测试里把 authorizer 摘掉来验证它们。
        - **试出来的几件事**：所有被 authorizer 拒绝的语句错误码都是 23（`SQLITE_AUTH`），但话不一样（多数是 `not authorized`，`VACUUM` 是 `authorization denied`，读 `sqlite_master`、`pragma_*`、`dbstat` 是 `access to … is prohibited`），所以 `runQuery` 靠错误码认，信息换成统一的一句（`这条语句不被允许：…`，`fix` 是 `saltnet schema --views`）；单独一条 `REINDEX` authorizer 根本没问到，但沙盒里没有索引，什么也不做（`query_only` 也会拦真的写入）；`jsonb_each`、`jsonb_tree` 一开始被拒绝而 `json_each`、`json_tree` 能用，两者都只是拆给定的 JSON，所以放行，`pragma_*` 表函数和 `dbstat` 继续拒绝；`readfile`、`writefile`、`edit` 在这个构建里不存在（`no such function`），列在拒绝名单里只是防以后；`load_extension` 和 `fts3_tokenizer` 存在，被 authorizer 拒绝（单参数的 `fts3_tokenizer` 会泄露一个指针）。
    - **`runQuery`**：一次只执行一条语句（后面再有语句是 `SQL_ERROR`，末尾的分号、空白和注释可以），空查询或只有注释是 `SQL_ERROR`；结果的列名重复（`SELECT a, a`）是 `SQL_ERROR`，因为行是以列名为键的对象；整数以 BigInt 读，在 JavaScript 安全范围内给数字，超出给文本，浮点的无穷大给 `null`，BLOB 给十六进制文本；行是没有原型的对象，叫 `__proto__` 的列也安全；读到第 `limit + 1` 行就停（`truncated`），不会把一个跑不完的查询读光。`runQuery` 本身不拦写入，拦写入的是沙盒（测试里对普通数据库执行 `INSERT` 来说明这一点）。SQLite 的错误是调用者的错，所以都是 `SQL_ERROR`（退出码 2），带 SQLite 自己的话；`no such table` 和 `no such column` 的 `fix` 是 `saltnet schema --views`。
    - **`sql` 命令**：`sql <查询…>`，多个词用空格连起来，选项 `--limit`（默认 1000，1 到 10000）和 `--fields`，没有 `--offset`（查询自己用 `LIMIT … OFFSET …`）；effect `none`，输出 `data.items`。`meta` 是 `{dataAsOf, viewsVersion, columns, limit, truncated}`，`dataAsOf` 只有查询用到的视图依赖的来源（`catalog`、`collections`）的下载时间，用到的来源先用 `ensureStored` 弄成最新（和别的命令同一套：过期就刷新，刷新失败用旧的并给 `STALE_METADATA`，`--offline` 没缓存是 `OFFLINE_NO_CACHE`）。截断时带 `TRUNCATED` 警告（没到上限时建议用 `--limit` 要更多，到了 10000 就只建议缩小范围）。没有 CPU 或时间限制：写不完的 `WITH RECURSIVE` 要从外面结束进程，`--help` 里写了。SQL 以 `-` 开头（比如第一行是注释）会被当成选项，要写 `sql -- <查询>`，`--help` 里也写了。查询只在字符串或注释里提到某个视图的名字，这个视图也会被复制（多花一点时间，不影响结果），同样写在说明里。
    - **`ensureStored` 和 `useStoredMetadata`**：`ensureMetadata` 前半段拆成 `ensureStored`（写入随 CLI 带的静态数据，再检查并刷新要求的来源，只返回警告，不读行），`sql` 只要这一半；`ensureMetadata` 调它，行为不变。`useStoredMetadata(args, ctx, kinds)` 是命令用的入口。`SOURCE_OF_KIND` 现在导出。传进来的重复种类先去重（测试里有）。
    - **对外视图**（`catalog/views.ts`；`PUBLIC_VIEWS` 里每个视图有名字、一句话说明、依赖哪些来源、各列的名字类型和说明、`SELECT` 文本；`VIEWS_VERSION = 1`，视图有不兼容的改动就加一，报在 `meta.viewsVersion` 里）：`v_charts`（28 列）、`v_collections`（8 列）、`v_collection_targets`（10 列）、`v_course_tracks`（16 列）。视图只以 `SELECT` 文本的形式存在于代码里，数据库里不建视图，所以不需要迁移；`v_collection_targets` 不另存表，在查询时用 `json_each` 从 `collections.required` 展开。规则和 `chart`、`collection show`、`course show` 输出的一样（测试把整份固定数据的视图结果和这些命令用的构造函数逐行比较：183 张谱面、966 个收藏品、176 个条件）：
        - **`v_charts`**：`difficulty` 是难度名；`constant` 不大于 0 时是 `NULL`（0 在上游表示未知），`fit_constant` 同理并四舍五入到 4 位；`charter` 去掉两端的空格、制表符、换行、U+00A0 和 U+3000，空串和 `-` 是 `NULL`；音符数 SD 谱四个数、DX 谱五个数（touch 在 break 前），`tap`、`hold`、`break` 三个都没有时整条谱面没有物量（`notes_slide`、`notes_touch` 也是 `NULL`，因为宴会谱上游放的零不是物量），有一项未知时 `notes_total` 是 `NULL`；统计里的 `rank_dist`、`combo_dist` 是 JSON，缺的计数算 0，没有统计时是 `NULL`；`music_id` 是目录用的曲目 id（DX 谱和宴会谱是 SaltMeta 的 id 加 10000，已经不小于 10000 的不再加），`song_id` 是 SaltMeta 的 id。排序是歌的位置、难度。
        - **`v_collections`**：`ref` 是 `类型:id`；牌子、称号、头像、姓名框的 `genre` 没有时是空串，旅行伙伴和搭档保持 `NULL`；`color` 只有称号有（`Normal`、`Bronze`、`Silver`、`Gold`、`Rainbow`，不分大小写，认不出的算 `Normal`）；`description` 不会是 `NULL`；歌的数量按曲目 id 去重计数。排序是类型（牌子、称号、头像、姓名框、旅行伙伴、搭档，不认识的类型排最后）再按位置。
        - **`v_collection_targets`**：一个条件里的每首歌、每个难度一行，条件从 1 起编号，条件没写难度的行 `difficulty` 是 `NULL`；排序是收藏品的顺序、条件、歌、难度。
        - **`v_course_tracks`**：`track` 从 1 起，`unlock_course_id` 只在课程上锁时给；排序是课程位置、曲序。不用下载任何东西（静态数据）。
        - **为 P2 留的**：视图只加不改：P2 给 `v_charts` 加默认用户的成绩列，加 `v_scores`、`v_score_events`、`v_rating_history`、`v_user_items`、`v_favorites`，每次加列或加视图时 `VIEWS_VERSION` 加一；计划里 P2-12 和 P2-25 的行已经写上。`schema --views`（P1-17）从 `PUBLIC_VIEWS` 生成，`sql` 的说明和错误的 `fix` 已经指向它，P1-17 的行写上了。
    - **代码放在哪**：`commands/sql.ts`、`commands/metadata.ts`（`useStoredMetadata`）；`store/sandbox.ts`（`openSandbox`）、`store/query.ts`（`runQuery`）；`catalog/views.ts`（`PUBLIC_VIEWS`、`VIEWS_VERSION`、`viewsMentionedIn`、`fetchedAtOf`）、`catalog/ensure.ts`（`ensureStored`）。
    - **验证**：新增 133 个测试（`sandbox` 51、`query` 13、`views` 44、`sql` 18、`ensure` 7；Gemini 写了约 113 个，我补了约 20 个），CLI 共 79 个文件 1294 个测试。破坏检查共 158 处有效的改动（`sandbox.ts` 32、`query.ts` 24、`views.ts` 81、`sql.ts` 15、`ensure.ts` 和 `metadata.ts` 5、`index.ts` 1）：第一轮 9 处没被发现，其中 SB09（想把所有函数都拒绝）写错了，改完其实和原来一样，换成 SB09b，被发现；另外 8 处是测试的缺口，补了测试之后都被发现：`query_only` 和 `enableDefensive` 这两层（把 authorizer 摘掉再试写入，另外盯住 `enableDefensive(true)` 确实被调用）、`fts3_tokenizer` 没被拒绝、忙等待时间的选项没人看（用 `PRAGMA busy_timeout` 读）、`meta.limit` 写死、`ensureStored` 不去重、只知道 `tap` 的谱面的 slide 和 touch 被当成没有物量。最后只剩 1 处等价的：SB32 把拒绝名单的比较改成区分大小写，因为 SQLite 交给 authorizer 的是登记的小写函数名（`Fts3_Tokenizer` 照样被拒绝），`toLowerCase()` 只是一层保险。
    - **我补的测试**：读 Gemini 的测试时看出的缺口。`sandbox` 补了 6 个（`jsonb_*`、同一快照、忙等待时间、对外函数的拒绝、authorizer 摘掉后的两层、`enableDefensive` 被调用），并把 7 个锁定测试改成断言错误码 23；`views` 补了约 11 个（行的顺序 4 个、曲目 id 的规则、四类收藏品的空 `genre` 4 个、旅行伙伴的 `genre`、课程的 `unlock_course_id`）加上若干音符数用例和断言，还把一个原样写进去的 U+3000 改成转义；`sql` 补了不带视图时 `--offline` 也能跑的测试和 `meta.limit` 的断言；`ensure` 补了 2 个（重复种类）。
    - **改掉的代码**：视图名放行表原来区分大小写（一个叫 `V_Mixed` 的视图读不了，现在转小写，有测试）；`fetchedAtOf` 的多行 `if` 补了花括号（`antfu/curly`）；`jsonb_each`、`jsonb_tree` 放行。
    - **委托的经过**：测试和文档交给 Gemini 3.8 Flash，一次成功（974 秒，快照里不含 `.env*`）。它报告了 7 处「分歧」，全是我的说明写错了：我要求所有 authorizer 拒绝都是 `not authorized`，实际错误码都是 23，话不同；它照说明写了测试，测试失败，它如实报告了。我先用探测弄清真实行为（见上）再改测试。
    - **要留意的**：(a) 用到视图的查询每次都要复制视图，P1-19 在真实数据上量一下耗时；(b) `v_charts` 和 `chart` 输出的对照在固定数据上逐行一致，SQLite 的 `round`、`trim` 与 JavaScript 的舍入、去空白在边角上会不会有差别，P1-19 用真实数据再对一次；(c) 以只读方式 `ATTACH` WAL 数据库可能留下 `-shm`、`-wal` 文件，无害，P1-19 看一下有没有留下别的；(d) Windows 路径的 `file:` 地址我没法在这里验证。
42. **P1-16b 的实现（每条命令的 `data` 都有 JSON Schema）**：
    - **为什么多出这一步**：设计 4.7 要 `schema <命令>` 给出 `data` 的 JSON Schema，测试表里也写着「每个命令都有 schema」。原计划把它放在 P1-17 里一起做；可是十六条命令的输出形状要逐个写出来，写出来还得有测试保证没写错，所以拆成单独一步，P1-17 只管把它们读出来。写的时候又发现 `pnpm lint` 一直没检查两个目录（见下面「顺带发现的」），所以还多出 P1-16c。
    - **写法**（`output/schema.ts`）：schema 是普通数据（`JsonSchema`），只用各家校验器都认的关键字（`type`、`enum`、`const`、`properties`、`required`、`additionalProperties`、`items`、`anyOf`、`description`）；构造函数有 `str`、`int`、`num`、`bool`、`strEnum`、`strEnumOf`、`literal`、`alwaysNull`、`anything`、`list`、`dictionary`、`anyOf`、`nullable`、`object`、`extend`。
        - **对象是封闭的**：`object` 写出的对象带 `additionalProperties: false`，所有键都必须有，除非列在 `optional` 里；可以是 `null` 的字段要明写 `nullable(…)`，没有「缺了就等于 null」这回事。所以命令多打印一个没写进 schema 的字段、或少打印一个，测试都会失败。给 `object<接口>` 带上类型参数时，TypeScript 也会要求接口的每个键都有说明；`extend<整体, 底>` 在已有的对象上加字段（`chart` 的数据就是谱面行加上 `notes`、`stats`、`related`），只要求写整体比底多出来的键。
        - **每个节点都要有 `description`**（`nullable` 加进去的 `{ type: "null" }` 这一种写法除外），`anyOf` 至少两种写法。注册表测试里的 `lintSchema` 查这些规则，也查对象和字典有没有写 `type`；它有自己的 4 个测试（一个合格的 schema，三类不合格的）。
        - **枚举不会和代码走样**：值来自运行时的常量（`DIFFICULTIES`、`MATCH_KINDS`、`RANKS`、`COMBOS`、`SYNCS`、`DOWNLOADED_SOURCES`；`SYNCS` 是这一步加的，和 `RANKS`、`COMBOS` 并列在 `refs/status.ts`），或者用 `strEnumOf<联合类型>`：它要的是 `Record<联合类型, string>`，TypeScript 会逼着每个成员都写上、多写一个也报错，写的解释进 `description`。只有联合类型、没有运行时数组的几处（`KaleidxscopeDifficulty`、`KaleidxscopePhaseStatus`、`SourceState`、`ConfigSource`）走这一条。
        - **只描述 `data`**：`meta` 和 `warnings` 不在 `dataSchema` 里（设计 4.7 只要求 `data`）；P1-17 若要给出 `meta` 的字段，另想办法，不要塞进这里。
    - **共用的形状**在 `catalog/schemas.ts`：谱面行 `chartRowSchema`（`collection show` 的 `collectionChartRowSchema` 和 `course show` 的 `courseTrackRowSchema` 是它的 `extend`）、`songTypeSchema`、`searchItemSchema`、收藏品和它的条件（`collectionRowSchema`、`requirementRowSchema`）、段位（`courseInfoSchema`）、门的阶段（`phaseRowSchema`）、`pendingSongSchema`、`relatedSchema`、`sourceStatusSchema`、`settingRowSchema`、`mergedDuplicateSchema`；只有一条命令用的形状写在它自己的文件里。
    - **P2 要记得改的**：`score`、`b50`（谱面行）、`owned`、`progress`（收藏品）、`done`（收藏品里的谱面行）现在是 `alwaysNull`，描述里写着「用户数据加入之前恒为 null」；P2 给它们真正的形状时改掉这几处（值一变就不再是 `null`，测试会提醒）。
    - **和命令行为有关的两处**：`refresh` 失败是抛出的 `CliError`（`error.sources` 里写每个来源怎么了），不是 `data`，所以 `data.sources` 里只有成功的来源，schema 也只写成功的写法（用 `literal` 区分 SaltMeta 和落雪收藏品两种结果）；`status` 里的 `metadata.maxAgeHours` 是 `number`（设置允许小数，0 到 8760），不是整数。
    - **Ajv**：`ajv` ^8.20.0 作为 `saltnet-cli` 的 devDependency（只有测试用，不进打包产物）；锁文件多出 `ajv`、`fast-uri`、`json-schema-traverse`、`require-from-string` 四个包和一份 `@vitest/mocker` 的快照。`tests/dataSchema.ts` 用 `strict: true, allErrors: true, allowUnionTypes: true` 建校验器，给出 `schemaErrors`、`expectConforms`、`expectValidSchema`。
    - **顺带发现的**：antfu 的默认忽略名单里有 `**/output`，所以 `pnpm lint` 从 P1-4 起就没检查过 `cli/src/output/` 和 `cli/tests/output/`。用 `eslint --no-ignore` 看，里面所有文件都是干净的，没有遗留问题。改配置是 P1-16c（原打算放进 P1-19，拆出来是因为它和文档无关）；在那之前，改这两个目录要手动跑 `pnpm exec eslint --no-ignore cli/src/output cli/tests/output`，`AGENTS.md` 里写着。
    - **代码放在哪**：`output/schema.ts`（构造函数）、`catalog/schemas.ts`（共用形状）、各命令文件里的 `dataSchema`、`refs/status.ts`（`SYNCS`）、`tests/dataSchema.ts`（Ajv）、`tests/output/schema.test.ts`、`tests/commands/dataSchemas.test.ts`。
    - **验证**：新增 103 个测试（`output/schema` 36、`commands/dataSchemas` 67），CLI 共 81 个文件 1397 个测试。每条命令都用真实运行的结果对照它的 schema，另有故意写错的结果（多一个键、少一个键、类型不对）必须被拒绝。对声明式的 schema，改源码做破坏检查没什么意义（改一个字符几乎总会让某个测试失败，也说明不了 schema 够不够严），所以改做覆盖分析：用一个临时的脚本（不进仓库）给 schema 里的每个节点记下真实输出走过没有——`null` 和非 `null`、`anyOf` 的每种写法、可省略的键有和没有、数组空和非空；最后 264 个节点，没有缺口。固定数据产生不出的情形（带歌的门、`unlockCourse.name` 为 `null`、`missing` 为空列表）用手写的样本过一遍 schema。
    - **委托的经过**：schema 和测试交给 Gemini 3.8 Flash（1183 秒，补丁 99 771 字节，快照里不含 `.env*`）；构造函数（`output/schema.ts`）、Ajv 辅助、模型的几份 schema 和第一个测试是我先写的，给它当样子。它报告 `tsc`「干净」，实际有 6 处类型错误（把整个接口当类型参数传给 `extend`）；把 `maxAgeHours` 写成了整数；`refresh` 里写了一种永远出现不了的失败写法；枚举值是照抄成字面量的。这些都是我改的：`extend` 的类型改成 `<T extends Base, Base>`，`maxAgeHours` 改 `num` 并加小数的测试，`refresh` 只写成功的写法，枚举改成上面两种来源。
    - **我补的**：`strEnumOf`、`literal`、有类型的 `extend` 和它们的测试，`lintSchema` 和它的 4 个测试，约 22 个补覆盖的场景（上面覆盖分析找出来的缺口）。
