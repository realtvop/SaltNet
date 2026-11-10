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

- [ ] P0-14 `refactor(songs): extract page query helpers into a module without behavior changes`：只做原样搬动，不改一行逻辑，用网页端实测对照
- [ ] P0-15 `test(query): snapshot songs query helpers with fixed data`：筛选、排序、分组、统计在固定数据上的现状快照（新增脚本 `test:query`）
- [ ] P0-16 `refactor(core): move songs query helpers to shared/core/query`：快照不改动，原样通过

**收尾**

- [ ] P0-17 `docs: update agents guide for shared/core`：整理 `AGENTS.md` 的结构说明、命令和测试；网页端实测（曲目页、谱面弹窗、收藏品页，含前进/后退），结论记入「实现中的决定」

### P1 骨架和曲库

完成标准：首次刷新之后，即使离线也能回答曲库方面的问题。

- [ ] P1-1 `build(cli): scaffold saltnet-cli workspace package`：`cli/` 包、esbuild 打包到 `cli/dist/saltnet.mjs`、`bin`、Vitest、类型检查；根脚本 `test:cli`、`build:cli`，`pnpm check` 带上 cli 的类型检查；`.gitignore` 和 `.prettierignore` 加上 `cli/dist`
- [ ] P1-2 `feat(cli): add runtime paths and config loading`：`SALTNET_HOME`、`config.json`、环境变量覆盖、构建时从网页端 `.env` 带入默认值（后端主备地址、渲染服务地址、落雪 client id）
- [ ] P1-3 `feat(cli): add command registry and argument parser`：命令注册表、解析器、`--help`、未知参数返回 `USAGE`
- [ ] P1-4 `feat(cli): add output envelope, error codes and formats`：外层结构、错误码与退出码、json/tsv/text、`--fields`、分页、stdout/stderr 约定
- [ ] P1-5 `feat(cli): add sqlite store with migrations and locks`：`node:sqlite`、WAL、`user_version` 迁移、迁移前备份、锁
- [ ] P1-6 `feat(cli): refresh catalog and collections into the store`：拉取 SaltMeta 和落雪收藏品，整体替换写入，原始快照存 `cache/`，过期检查、`--offline`、`refresh`；合并上游重复的宴谱
- [ ] P1-7 `feat(cli): load catalog from the store into core structures`：从 SQLite 还原成和网页端相同的内存结构；静态数据（段位、万花筒、旅行伙伴、搭档）随版本写入
- [ ] P1-8 `feat(cli): resolve song, chart and difficulty references`：引用解析、歧义与候选、数字标题、难度写法
- [ ] P1-9 `feat(cli): add search, song and chart commands`
- [ ] P1-10 `feat(cli): add charts filters`：level、constant、version、diff、search、utage、fav 的筛选
- [ ] P1-11 `feat(cli): add charts sorting, grouping and paging`
- [ ] P1-12 `feat(cli): add charts gate, course, plate and collection filters`
- [ ] P1-13 `feat(cli): add course and kaleidxscope commands`
- [ ] P1-14 `feat(cli): add collection list and show commands`（不含进度）
- [ ] P1-15 `feat(cli): add status and config commands`
- [ ] P1-16 `feat(cli): add read-only sql views and sql command`：对外视图、只读连接、`setAuthorizer`
- [ ] P1-17 `feat(cli): add schema and guide commands`：从注册表生成
- [ ] P1-18 `test(cli): add offline end-to-end test on the bundled artifact`：灌入固定数据，不联网跑一遍指南里的示例；接进 CI
- [ ] P1-19 `docs: update agents guide for cli phase 1`；用真实的公开接口做一次真实刷新来验证（临时 `SALTNET_HOME`）

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

- [ ] P2-12 `feat(cli): add user and score tables with read-only views`：迁移 2
- [ ] P2-13 `feat(cli): add user repository on top of the store`
- [ ] P2-14 `feat(cli): add confirmation codes for destructive commands`：预览、确认码、退出码 6
- [ ] P2-15 `feat(cli): add user management commands`：`user list/show/add/edit/remove/default`
- [ ] P2-16 `feat(cli): add backup import and export`：v0/v1、凭据拆分、`--keep-lxns`、`FILE_EXISTS`
- [ ] P2-17 `test(cli): cover backup round trip with a web v1 fixture`
- [ ] P2-18 `feat(cli): add scores to song, chart and charts output`：谱面行、`--user`、`STALE_SCORES`、`NO_SCORES`、`PARTIAL_SCORES`
- [ ] P2-19 `feat(cli): add charts score filters, stats and score grouping`：`--achieved`、`--missing`、`--recent`、`--stats`、按成绩排序和分组
- [ ] P2-20 `feat(cli): add b50 and rating commands`
- [ ] P2-21 `feat(cli): add history command`
- [ ] P2-22 `feat(cli): add calc command and chart stages`：阶段表、`chart --with`
- [ ] P2-23 `feat(cli): add b50 gain to stages and charts --sort gain`
- [ ] P2-24 `feat(cli): add collection progress to collection and charts`
- [ ] P2-25 `feat(cli): add fav commands`
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
- [ ] P3-14 `feat(cli): serialize lxns token refresh across processes`：锁、重读、原子写、`invalid_grant`、`LXNS_REAUTH_REQUIRED`、`LXNS_EXPIRING`
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
