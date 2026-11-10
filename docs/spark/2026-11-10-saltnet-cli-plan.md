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
- [ ] P1-6c `feat(cli): refresh catalog and collections into the store`：拉取 SaltMeta 和落雪收藏品，整体替换写入，原始快照存 `cache/`，过期检查、`--offline`、`refresh`；合并上游重复的宴谱
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
