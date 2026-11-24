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
- 谁来做每一步、每一步怎么走，见下一节「分工与流程」。

## 分工与流程

2026-11-14 起，实现分给四个角色，**Opus 是总协调**。三个工具都通过各自的命令行工具启动，由协调者自己用 Bash 调用，不需要用户动手；脚本、快照的做法和试过什么在 [`2026-11-10-saltnet-cli-tools/`](./2026-11-10-saltnet-cli-tools/README.md)，让新的协调会话接着往下做的启动提示是同一个目录里的 `coordinator-prompt.md`。

| 角色   | 谁                                                                          | 做什么                                                                                                                                                                                      | 怎么调用            |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 协调   | Opus                                                                        | 判断每一步归谁；设计决定（写进「实现中的决定」）；写 brief；验补丁（不通读，见下面第 4 条）、合进工作区；跑完整验证；更新计划和 `AGENTS.md`；提交；最终报告。几行的修正和文档措辞自己直接做 | —                   |
| 简单活 | Gemini 3.8 Flash (Medium)，Antigravity 的 `agy`                             | 搬模块（`refactor(core): move …`）、给已经写好的代码补测试（包括拿固定数据存快照的测试）、写文档草稿                                                                                        | `delegate-agy.sh`   |
| 新东西 | Codex GPT 6.2 Sol (high)，`codex exec`（2026-11-23 之前是 GPT 5.6 Sol）     | 新命令、新逻辑、数据库迁移、同步和绑定流程，以及需要读懂设计才切得对的重构                                                                                                                  | `delegate-codex.sh` |
| 审查   | Codex GPT 6.2 Sol (high)，`codex exec`，可再加 `codex review --uncommitted` | 每完成一个 part（P2、P3、P4），把上次审查之后的提交整体审一遍（2026-11-17 起，之前是每一步审）                                                                                              | `review-codex.sh`   |

步骤行末尾的 `〔简单〕`、`〔新〕`、`〔协调〕` 是建议的分工（`〔协调〕` 是协调者自己做，不外包；拿不准就按 `〔新〕`）。协调者可以改，改了要在「实现中的决定」里写一句。

**每一步的流程**（一步一个 commit 不变）

1. **分类**：看步骤行末尾的标记。
2. **写 brief**（模板 `brief-template.md`）：目标、要读的文件、设计文档里相关的原文、硬性规则（照抄下面「开发与测试约束」）、验证命令、要它汇报什么。brief 要自足：工具看不到这次对话，也不知道设计文档写了什么。测试的期望值由协调者独立算好写进 brief，不让工具用被测代码去算期望值。
3. **交出去**：脚本在快照里跑工具，拿回 `patch.diff` 和 `response.txt`。快照里没有 `.env*`、真实的 `.git` 和 `~/.saltnet`，工具不联网、不提交、不装依赖。
4. **验补丁**：**不通读补丁**（用户 2026-11-16：「你不应该在别的agent写完代码后完整阅读，这太浪费了」）。只看工具的汇报（`response.txt`）和改了哪些文件（`files.txt`），自己跑 `tsc`、ESLint 和相关测试。**工具说「干净」「通过」不算数**（Gemini 说过 `tsc` 干净，实际有 6 处类型错误）。读代码是第 6 步审查的事；协调者只打开审查意见、失败的检查、要做的设计决定或敏感的地方（凭据、账号、数据库写入、`.env` 的值）指向的那几段。
5. **打进工作区**（`git apply`）并修正：小问题自己改；成块的问题写成新的 brief 再交（带上它上一次的补丁和具体的问题）。同一处两轮还不对，就换「新」的工具或者自己做，并在决定里写下原因。
6. **审查**：**不再每一步审**（用户 2026-11-17：「不要频繁review，完成一整个part后再整体review」）。一步做完，完整检查（第 9 条）和破坏检查（第 7 条）都过了就提交。一个 part（P2、P3、P4）的步骤全部提交以后，用 `REVIEW_BASE=<上次审过的提交> review-codex.sh` 把那以后的提交整体审一遍；改动太大、一次审不透时按区域拆成几个并行的审查，算同一轮。brief 列出范围里的每一步和它的重点（范围里有新功能或涉及凭据、账号、数据库的步骤时加 `REVIEW_BUILTIN=1`；搬模块的步骤重点是「行为有没有变」）。逐条核实：对的在后续提交里改掉，不对的在决定里记一句为什么不改。纯文档步骤协调者自己审，不跑审查。
7. **测试够不够**：新逻辑的测试做破坏检查（`mutate.py`：写出有代表性的改动，每一个都要被测试发现，漏网的补测试）；声明式的数据（比如 JSON Schema）改做覆盖分析。
8. **文档**：勾计划、在「实现中的决定」里写这一步（编号接着往下）、更新 `AGENTS.md`。
9. **验证并提交**：`finish.sh <步骤>`（动了网页端代码或 `shared/core` 要加 `--build`），全部通过后 `commit.sh`。提交说明的 `AI assistance:` 写清楚谁做了什么：哪个工具写了什么、审查提了几条改了几条、协调者手写了什么。

**几条规矩**

- 工具只在快照里工作。凭据、二维码、第三方写入、舞萌账号相关的代码，brief 里写明只用模拟 HTTP 测试，数据一律虚构；`SALTNET_HOME` 一律指到临时目录。
- 互不重叠的步骤（改的文件不同、不依赖对方的结果）可以同时交给不同工具，各自在自己的快照里做；补丁由协调者一个一个合进工作区、一个一个验证和提交，提交的顺序不变。
- 工具跑得久（`agy` 约 10 到 20 分钟），用后台运行，结束时会通知，不要轮询。
- 工具失败了：看 `response.txt` 和 `run.log`，改 brief 重来；连续两次失败就换工具或者自己做，并在决定里记一句。如果会话的权限设置不允许启动某个工具，也由协调者自己做那一步，不停下来提问，最终报告里说明。
- 两个 Codex 模型的 id 要先确认能用（见 `README.md`），分别放在环境变量 `CODEX_MODEL_WRITE`、`CODEX_MODEL_REVIEW` 里。
- 开新的 Codex 任务（写代码或审查）之前，先用 `codex-quota.py` 查剩余额度（用户 2026-11-17）。每周的窗口用得多时，Codex 只做新功能、难的重构和每个 part 的审查，其余交给 Gemini。

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
- [x] P1-16c `build(lint): lint the cli output directories`：antfu 的默认忽略名单里有 `**/output`，所以 `pnpm lint` 一直没看过 `cli/src/output/` 和 `cli/tests/output/`（用 `eslint --no-ignore` 看是干净的）；改配置让它们进来，并删掉 `AGENTS.md` 里 `pnpm lint` 一条后面的提醒（见第 42 条）〔简单〕
- [x] P1-17 `feat(cli): add schema and guide commands`：从注册表生成；`schema <命令>` 的 `data` 部分直接用每条命令的 `dataSchema`（第 42 条）；`schema --views` 列出 `PUBLIC_VIEWS` 里每个视图的说明、依赖的来源和各列，并给出 `VIEWS_VERSION`（`sql` 的说明和错误的 `fix` 已经指向它，见第 41 条）〔新〕
- [x] P1-18 `test(cli): add offline end-to-end test on the bundled artifact`：灌入固定数据，不联网跑一遍指南里的示例；接进 CI〔新〕
- [x] P1-18b `fix(cli): give metadata downloads time when there is nothing to fall back on`：8 秒的 `metadata.timeoutMs` 只用在有缓存可以退回的自动刷新；第一次下载、存的数据用不了、显式的 `refresh` 改用 `network.timeoutMs`；超时的 `NETWORK` 错误在 `fix` 里写明该调大哪个设置（第一次真实刷新 2 MB 的 SaltMeta 用了 7 秒，8 秒就报错）〔新〕
- [x] P1-19a `perf(cli): parse each collection condition once in v_collection_targets`：这个视图每一行都把整条条件（含几千首歌）的 JSON 重新解析一遍，真实数据上一次 `sql` 要 1.9 秒；改成每条条件只解析一次，行、列和顺序都不变，`VIEWS_VERSION` 不变〔新〕
- [x] P1-19 `docs: update agents guide for cli phase 1`；用真实的公开接口做一次真实刷新来验证（临时 `SALTNET_HOME`）；顺带在真实数据上对照 `v_charts` 与 `chart` 的结果、量一下 `sql` 复制视图的耗时、看一下只读 `ATTACH` 有没有留下多余文件（见第 41 条）〔协调〕

### P2 本地成绩

完成标准：导入网页端备份后，B50、rating 和牌子进度都和网页端一致。

**P2-0 先抽这一期要用的模块**

- [x] P2-1 `refactor(core): move user types, rating history and score lookup to shared/core`：`chart/scoreLookup.ts` 依赖 `user/type.ts`，所以和它一起搬；`chart/rating/` 也在这一步搬〔简单〕
- [x] P2-2 `refactor(core): move score history diff, estimate and presentation to shared/core`（`test:score-history`）〔简单〕
- [x] P2-3 `refactor(core): move backup codec, user identity and data migration to shared/core`〔简单〕
- [x] P2-4 `refactor(b50): extract page query helpers into a module without behavior changes`〔简单〕
- [x] P2-5 `test(query): snapshot b50 query helpers with fixed data`〔简单〕
- [x] P2-6 `refactor(core): move b50 query helpers to shared/core/query`〔简单〕
- [x] P2-7 `refactor(chart): extract chart info calculations into a module without behavior changes`：吃分表、B50 底分、涨分所需的计算〔简单〕
- [x] P2-8 `test(query): snapshot chart info calculations with fixed data`〔简单〕
- [x] P2-9 `refactor(core): move chart info calculations to shared/core/query`〔简单〕
- [x] P2-10 `refactor(core): split chart position calculation from its localforage cache`〔新〕
- [x] P2-11 `refactor(core): move collection progress and ownership logic to shared/core`：`collections.vue`、`CollectionProgress.vue` 里的拥有状态和进度判断〔新〕

**P2 的 CLI 部分**

- [x] P2-12 `feat(cli): add user and score tables with read-only views`：迁移 4（原写迁移 2，见第 62 条）；对外视图加上 `v_scores`、`v_score_events`、`v_rating_history`、`v_user_items`、`v_user_characters`，`v_charts` 加上默认用户的成绩列（只加列不改名，`VIEWS_VERSION` 加一；用户数据怎么进沙盒见第 41 条）〔新〕
- [x] P2-13 `feat(cli): add user repository on top of the store`〔新〕
- [x] P2-14 `feat(cli): add confirmation codes for destructive commands`：预览、确认码、退出码 6〔新〕
- [x] P2-15 `feat(cli): add user management commands`：`user list/show/add/edit/remove/default`；`status` 同时加上 `users`（用户列表和各用户的成绩更新时间），P1-15 的 `status` 还没有用户〔新〕
- [x] P2-16 `feat(cli): add backup import and export`：v0/v1、凭据拆分、`--keep-lxns`、`FILE_EXISTS`〔新〕
- [x] P2-17 `test(cli): cover backup round trip with a web v1 fixture`〔简单〕
- [x] P2-18 `feat(cli): add scores to song, chart and charts output`：谱面行、`--user`、`STALE_SCORES`、`NO_SCORES`、`PARTIAL_SCORES`〔新〕
- [x] P2-19 `feat(cli): add charts score filters, stats and score grouping`：`--achieved`、`--missing`、`--recent`、`--stats`、按成绩排序和分组〔新〕
- [x] P2-20 `feat(cli): add b50 and rating commands`〔新〕
- [x] P2-21 `feat(cli): add history command`〔新〕
- [x] P2-22 `feat(cli): add calc command and chart stages`：阶段表、`chart --with`〔新〕
- [x] P2-23 `feat(cli): add b50 gain to stages and charts --sort gain`〔新〕
- [x] P2-24 `feat(cli): add collection progress to collection and charts`〔新〕
- [x] P2-25 `feat(cli): add fav commands`：`favorites` 表（迁移）、`fav` 命令和 `charts --fav`（后者从 P1-10 挪来，见第 34 条）；对外视图加上 `v_favorites`（`VIEWS_VERSION` 再加一）〔新〕
- [x] P2-26 `test(cli): extend offline end-to-end test with scores`〔简单〕
- [x] P2-27 `docs: update agents guide for cli phase 2`；把 `AGENTS.md` 里 `cli/` 那一大段拆成分条（第 50 条）；对照验证：同一份备份，CLI 的 B50、rating、牌子进度与网页端逻辑的结果逐项一致（并在浏览器里打开网页端对照）〔协调〕

### P3 同步和绑定

完成标准：不打开网页端，也能完成「绑定 → 同步 → 查询」；落雪二次授权的问题有了结论（需要用户实测，所以只能做到「流程实现、取值可配置、列入手动测试清单」）。凡是涉及凭据和账号的地方都只用模拟 HTTP 测试。

**P3-0 先抽这一期要用的模块**

- [x] P3-1 `refactor(core): move diving-fish client to shared/core with injected config`〔简单〕
- [x] P3-2 `refactor(core): move lxns client, token and upload to shared/core`（`test:oauth`）〔简单〕
- [x] P3-3 `refactor(core): move saltnet backend client to shared/core with injected urls`〔简单〕
- [x] P3-4 `refactor(core): extract sync fetching and merging from the update worker`：进度走回调，不再调提示条；worker 只剩消息收发〔新〕
- [x] P3-5 `refactor(core): split lxns oauth flow from browser session handling`：PKCE、授权链接、回调校验、换 token 进 core〔新〕

**P3 的 CLI 部分**

- [x] P3-6 `feat(cli): add credentials file and http client`：`credentials.json` 0600、原子写入；超时、只读请求重试一次、`saltnet-cli/<版本>` UA、主备地址切换〔新〕
- [x] P3-7 `feat(cli): add sync_runs journal and sync locks`〔新〕
- [x] P3-7b `feat(cli): refuse import and user remove during a sync`：导入和删除用户在写事务里检查同步锁，有同步在进行就返回 `SYNC_IN_PROGRESS`；导入成功在 `sync_runs` 里记一条 `import`〔新〕
- [x] P3-8a `refactor(core): move sync result application to shared/core`：网页端收到同步结果后的处理（`applySyncUpdate`）和成绩历史批次生成事件的部分（`buildScoreHistoryBatchEvents`）搬进 core，给 CLI 的同步共用；网页端行为不变〔简单〕
- [x] P3-8 `feat(cli): add sync from diving-fish and lxns`：水鱼 Import-Token、水鱼用户名（含公开 B50）、落雪；写入事务〔新〕
- [x] P3-9 `feat(cli): add in-game sync with qr and fast update`：全量、快速更新、补全、`QR_REQUIRED`/`QR_INVALID`〔新〕
- [x] P3-10 `feat(cli): upload synced scores to diving-fish and lxns`：`UPLOAD_FAILED`、`--no-upload`〔新〕
- [x] P3-10b `fix(cli): keep printed sync and bind fixes runnable`：以 `-` 开头的 uid 和文件名、`df-token -`、`df-name` 的用户名、没有来源时的绑定命令（决定 96、98）〔新〕
- [x] P3-11 `feat(cli): add sync --all and --dry-run`〔新〕
- [x] P3-12 `feat(cli): add user bind and unbind for in-game, diving-fish tokens and names`〔新〕
- [x] P3-13 `feat(cli): add lxns two-step bind`：授权记录、回调链接、暂存 token、`--callback -`〔新〕
- [x] P3-14 `feat(cli): serialize lxns token refresh across processes`：锁、重读、原子写、`invalid_grant`、`LXNS_REAUTH_REQUIRED`、`LXNS_EXPIRING`（由 `status` 给出；同一步给 `status` 加上凭据状态：有没有、是否过期，按本地记录判断，不联网也不输出凭据本身）〔新〕
- [x] P3-15 `feat(cli): confirm identity changes on bind`：`hasStrongIdentityChanged`；按内容绑定的确认、原位换成新 uid、清空旧成绩和历史、凭据跟着搬（决定 102）〔新〕
- [x] P3-15b `feat(cli): follow sync.qrOtherAccount on qr sync`：「二维码属于另一个账号」的处理做成配置项〔新〕
- [x] P3-16 `test(cli): cover sync and bind flows with mocked http`：四种来源、全量与快速、上传成败、`invalid_grant`、两个进程同时刷新、撞锁、token 不出现在任何输出里〔简单〕
- [x] P3-17 `docs: update agents guide for cli phase 3`〔简单〕

### P4 账号操作和收尾

完成标准：网页端能做的事 CLI 都能做（nearcade 除外）。

- [x] P4-1 `feat(cli): add ingame check-login`：只用模拟 HTTP 测试；不做 `clear-tickets`（决定 95）〔新〕
- [x] P4-2 `feat(cli): add ingame backup export`：游戏格式的备份文件，`FILE_EXISTS`/`--overwrite`〔新〕
- [x] P4-3 `feat(cli): add b50 --image through the render client`：复用 `shared/rendering`〔新〕
- [x] P4-4 `feat(cli): finish agent guide and skill output`：手写部分、`guide --skill`〔新〕（手写的部分由协调者写）
- [x] P4-5 `test(cli): run every guide example in the end-to-end test`〔简单〕
- [x] P4-6 `docs: finish agents guide and cli notes`：`AGENTS.md` 终稿、安装与全局链接的说明〔协调〕
- [x] P4-7 最终全量检查（不产生 commit，结果写进最终报告）：`pnpm check`、`pnpm lint`、`pnpm build`、全部 `test:*`、`render-service` 测试、`cli` 测试与端到端〔协调〕

## 最终报告要有的内容

全部做完（P4-7 之后）写一份最终报告给用户看；不 push，不开 PR。要有：

- **(a) 每一期**：完成标准有没有达到、怎么验证的、结果。
- **(b) 实现中的决定和对设计的改动**：把「实现中的决定」整理成给人看的形式，特别要列出：lint 需要 `eslint-plugin-format` 和存量违规的基线（`eslint-suppressions.json`），前两个提交当时没法 lint；改 lockfile 时清掉了一个过期的 `database` importer；根 `package.json` 和 `pnpm-workspace.yaml` 的基线计数改动；`.env` 里三个公开的服务地址有一次出现在我自己的工具输出里（不是凭据，没有写进任何文件）；cli 的 ESLint 配置关了 `style/quotes` 和 `unicorn/number-literal-case`；`--fav` 和 `favorites` 表从 P1-10 推到 P2-25（第 34 条）；`--stats`、按成绩排序和分组、`--achieved`、`--missing`、`--recent` 推到 P2-19、P2-23（第 35 条）；`config` 做成命令组、`status` 还没有用户和凭据（第 40 条）；`sql` 改成内存沙盒（第 41 条，设计第 149 行改了）；每条命令的 `data` 有 JSON Schema 和 `ajv`、`pnpm lint` 没检查 `output` 目录（第 42 条）；分工（第 43 条）。
- **(c) 用户要用真实账号手动测的**：落雪两步绑定（连同设计「待确认」的第 1、2 条）、舞萌全量更新和快速更新、上传到水鱼和落雪、清除非法票券。
- **(d) 网页端我没法亲自检查的**：开发服务器的 HTML5 history 模式、B50 图片渲染、真实账号的流程、nearcade。
- **(e) 安装和全局链接的命令**：写出来，但不执行；以及 `guide --skill` 的安装办法（不往 `~/.claude/skills` 里装东西）。
- **(f) 委托记录**：P1 的大部分步骤交给了 Gemini 3.8 Flash（`agy`：每次用了多久、每一步我补了多少测试、它说「干净」而实际有错的几次）；2026-11-14 起由 Opus 协调，Codex GPT 5.6 Sol 写新功能，GPT 6.1 Sol 审查（各自做了哪些步骤，审查提了几条、几条是真的）。
- **(g) 分支上不是我们做的提交**：`1a2ede8`（`.env`）、`1712f63`（游戏接口出错时显示友好的提示，提交说明写着由 Codex GPT-6 协助）和 `eafa00f`（网页端搜索排序），都是用户自己的。

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
43. **分工改成四个角色（2026-11-14）**：
    - **起因**：用户决定从 P1-17 起由 Opus 做总协调（「超级统筹开发」），用 Antigravity 里的 Gemini 3.8 Flash (Medium) 做简单任务、Codex 的 GPT 5.6 Sol (high) 做新东西、GPT 6.1 Sol (high) 做 code review，并说明 Codex 用 `codex` 命令行。计划里新增「分工与流程」一节，每个没勾的步骤行末尾加了 `〔简单〕`、`〔新〕`、`〔协调〕`；「最终报告要有的内容」一节把原先只存在记忆里的清单写进了计划。
    - **怎么分类**：`〔简单〕` 是搬模块和抽模块（P2-1 到 P2-9、P3-1 到 P3-3，有快照测试兜底）、给写好的代码补测试（P2-17、P2-26、P3-16、P4-5）、文档草稿（P3-17）和一行配置（P1-16c）；`〔新〕` 是新命令、新逻辑、迁移、同步和绑定流程，以及要读懂设计才切得对的重构（P2-10、P2-11、P3-4、P3-5）；`〔协调〕` 是对真实的公开数据或网页端做验证和写终稿的步骤（P1-19、P2-27、P4-6、P4-7）。P3-16 是最难写的「简单」步骤（两个进程同时刷新、token 不出现在任何输出里）：brief 要逐条列出场景，并做破坏检查。P4-4 的代码归 `〔新〕`，手写的指南文字由协调者写。
    - **脚本放进了仓库**：`docs/spark/2026-11-10-saltnet-cli-tools/`（`delegate-agy.sh`、`delegate-codex.sh`、`review-codex.sh`、`verify.sh`、`finish.sh`、`commit.sh`、`mutate.py`、`brief-template.md`、`coordinator-prompt.md`、`README.md`）。它们是 P1 期间用的脚本整理出来的，路径从仓库位置推出来；这个目录是开发过程的辅助，不是产品代码，分支做完后可以整个删掉（最终报告里提一句）。
    - **交给工具的永远是快照**：一个没有远端的独立 git 仓库，提交 `base`，`node_modules` 链进去，没有 `.env*`、真实的 `.git` 和 `~/.saltnet`。写代码的两个脚本以「现在磁盘上的样子」为 `base`，工具的改动就是补丁；审查的脚本以最后一次提交为 `base`、把未提交的改动叠在上面，所以 `git diff base` 恰好是被审查的改动，沙盒只读。
    - **试过的**：在一个玩具仓库里把三个脚本各跑了一次：`agy` 16 秒、`codex exec` 29 秒（沙盒 `workspace-write`，补丁正确）、审查 78 秒（发现了删掉的文件和新增的文件，没有 `.env`）；快照函数单独试过：删除的文件、未跟踪的文件、被改的 `.env` 都按预期。调用方式用的是用户 `~/.codex/config.toml` 里的默认模型 `gpt-6-luna`，**没有**用过 GPT 5.6 Sol 和 GPT 6.1 Sol 的模型 id（没有默认值，必须设 `CODEX_MODEL_WRITE`、`CODEX_MODEL_REVIEW`；第一次用之前先确认 id 能用）。
    - **审查为什么用 `codex exec`**：`codex review --uncommitted` 不能带自定义说明（试过，报「`--uncommitted` cannot be used with `[PROMPT]`」），所以带 brief 的审查走 `codex exec -s read-only`；自带的 `codex review --uncommitted` 作为可选的第二意见（`REVIEW_BUILTIN=1`）。试跑里第二意见指出了脚本自己的一个真问题（`SALTNET_WORK` 给相对路径时，第二意见的输出写到了快照目录里；已改成先转成绝对路径，有试过），带 brief 的那一遍只指出了没写进 brief 的改动，所以两遍各有用。
    - **没试过的**：用真实的步骤、真实的模型 id 跑；`verify.sh`、`finish.sh`、`commit.sh` 在新的位置上是这次提交和下一次提交用的，第一次真跑就是它们的验证。
44. **P1-16c 的实现（`pnpm lint` 检查两个 `output` 目录）和两个 Codex 模型的 id（2026-11-15）**：
    - **改法**：antfu 的默认忽略名单（`GLOB_EXCLUDE`）里有为构建产物准备的 `**/output`，所以 `cli/src/output/` 和 `cli/tests/output/` 一直被跳过。`eslint.config.js` 的 `ignores` 末尾加了两条取反的规则 `!cli/src/output/`、`!cli/tests/output/`（ESLint 9 的全局忽略可以把目录放回来），没有整条去掉 `**/output`：git 跟踪的文件里叫 `output` 的目录只有这两个，以后别处真有叫 `output` 的构建产物，默认照样跳过。antfu 也支持 `ignores: originals => …` 的函数写法把 `**/output` 删掉，范围太大，没用。
    - **验证**：不带 `--no-ignore` 跑 `pnpm exec eslint cli/src/output cli/tests/output` 是干净的（和 P1-16b 用 `--no-ignore` 看到的一样）；在两个目录里各放一个有违规的探针文件，单独 lint 这个文件和整仓的 `pnpm lint` 都报出了它的违规（探针不提交）。`AGENTS.md` 里 `pnpm lint` 一条后面的提醒换成「配置只放回了这两个目录，别处新建叫 `output` 的源码目录要照样加进去」；`coordinator-prompt.md` 的「踩过的坑」同样改了。
    - **分工**：计划里标的是 `〔简单〕`，实际是两行配置加一句文档，交给 Gemini 一次要 10 到 20 分钟，按「几行的修正协调者自己做」由我直接做；审查照常跑了一遍（也是 `review-codex.sh` 第一次用真实的模型 id 跑）。
    - **两个 Codex 模型的 id**：`codex debug models` 列出的模型目录里有 `gpt-5.6-sol`（GPT-5.6-Sol）和 `gpt-6.1-sol`（GPT-6.1-Sol），各用 `codex exec -m <id> -s read-only --ephemeral "reply ok"` 试过，都回答 `ok`，所以 `CODEX_MODEL_WRITE=gpt-5.6-sol`、`CODEX_MODEL_REVIEW=gpt-6.1-sol`，没有去问用户。`README.md` 和 `coordinator-prompt.md` 写上了。
    - **两个脚本的毛病（第一次真跑就暴露了）**：(a) `finish.sh` 把 `verify.sh` 的输出接给 `grep`，没开 `pipefail`，所以最后打印的 `finish exit=<n>` 是 `grep` 的退出码，验证失败了也是 0；加了 `setopt pipefail`。(b) `verify.sh` 原来把所有 `test:*` 和 `check`、`lint` 同时启动，每个 vitest 又各自占满所有核，网页端测试的 5 秒超时会被挤爆（这次 `test:collection-index`、`test:music-data`、`test:music-search`、`test:oauth` 超时，单独跑都过）；改成测试脚本一个接一个跑、和 `check`、`lint` 并行，整套反而从 2 分钟缩到 1 分半，全部通过。所以以后看结果要看每一行的 `ok`/`FAIL`，不要只看最后一行。
    - **分支上的第三个用户提交**：`1712f63 fix: display friendly game API failure messages`（改了网页端的 `BindUserDialog.vue`、`updateUser.worker.ts`、`SaltNet/index.ts`）也是用户自己的提交，启动提示里只列了两个；「最终报告要有的内容」的 (g) 补上了它。
45. **P1-17 的实现（`schema` 和 `guide`）（2026-11-16）**：
    - **都从注册表生成**：`commands/describe.ts` 是 `--help`、`schema`、`guide` 共用的描述（用法行、参数、选项、错误码）。`help.ts` 原有的几个辅助函数挪进去以后，`--help` 的输出一字不变：原有的 `help.test.ts` 不改就通过。
    - **`schema` 的三种形式**：
        - 不带参数是索引：命令和命令组、分类、副作用级别、全局选项、每个退出码的含义和它下面的错误码、全部错误码（退出码、默认是否可重试、说明）、警告码，以及外层结构本身的 JSON Schema（`envelope.schema`）和它的版本历史 `ENVELOPE_CHANGES`。
        - `schema <命令>` 给出用法、参数、选项、示例和可能出现的错误码。选项写明类型、默认值、可选值和别名、列表项、区间、最小最大值，不适用的写 null。示例带 `saltnet ` 前缀，可以直接复制运行。`data` 原样是 `spec.dataSchema`（第 42 条）。
        - `schema --views` 给出 `VIEWS_VERSION`、`VIEWS_CHANGES`，以及每个视图的说明、依赖的来源和各列。不给 SELECT 原文，因为表的结构是内部细节（第 41 条）。
        - 命令组（`schema config`）报 `AMBIGUOUS_REF`，候选是组里的命令。不存在的命令报 `NOT_FOUND`，候选是最接近的命令名。`--views` 和命令名一起写报 `USAGE`。
    - **公开的错误码要和实际一致**：
        - 每条命令都隐含 `INTERNAL` 和 `USAGE`。
        - 要让元数据保持最新的命令共用 `METADATA_ERRORS`（`NETWORK`、`UPSTREAM_ERROR`、`OFFLINE_NO_CACHE`、`SYNC_IN_PROGRESS`、`DB_LOCKED`）。原来各写各的，都漏了后两个。
        - `errorCodes.test.ts` 把每条命令的每个示例放在七种情形下跑：离线、断网、上游 500、灌好固定数据、`metadata` 锁被占、数据库被另一个连接写锁住、还要迁移时被写锁住。失败时的错误码必须在这条命令公开的清单里。测试还证明锁冲突的两个错误码真的会出现。
        - 默认可重试的只有 `NETWORK`、`SYNC_IN_PROGRESS`、`DB_LOCKED`。每次失败的 `error.retryable` 才是那一次的结论。
    - **`guide`**：输出 Markdown 文本，和 `--help` 一样不套外层结构（设计 4.2）。
        - 内容分两部分。手写部分在 `guide/handwritten.ts`：开头、五条规则、每个退出码「怎么办」。`guide/markdown.ts` 从注册表生成其余部分：按分类的命令参考（没有命令的分类不出现）、全局选项、错误码表、警告表和视图列表。
        - 同一个构建永远输出同样的文字。`guide --skill` 和术语表留给 P4-4。
    - **配置坏了也能读说明**：`schema` 和 `guide` 都允许配置有错（`allowBadConfig`），也不会建数据目录。测试里注入可以辨认的构建默认值，先确认它们确实生效（`config get` 看得到）。然后确认 `schema`、每条命令的 `schema <命令>`、`schema --views` 和 `guide` 的输出里都没有这些值。
    - **没有失败会带 `meta` 或 `warnings`**：外层结构的 schema 允许失败时带这两个字段，但现在没有哪条命令会这样失败，所以没写这样的测试，以后有了要补。
    - **委托的经过**：
        - 主体交给 Codex（GPT 5.6 Sol）。`errors.ts` 的三张表（退出码含义、错误码说明、默认可重试）和 `handwritten.ts` 是我先写的。它的补丁 `tsc` 干净、1420 个测试通过，对 brief 没有异议。
        - 审查（GPT 6.1 Sol，加 Codex 自带的 `review --uncommitted`）提了 5 条，都核实过。两处文字不对，我改了：`INTERNAL` 不只是 saltnet 的缺陷，也可能是数据目录读写失败或数据库损坏；指南说「每条命令都输出 JSON」，漏了设计 4.2 的例外。三处测试不够强：没测锁冲突；外层结构没测 `command: null` 和 `--fields`；没测构建默认值会不会泄露。Codex 自带的审查没有意见。
        - 补测试先交给 Gemini，两次都没有产出，因为无头模式拒绝了某条命令。第一次是 brief 没按模板列出能用的命令；第二次补上了仍然被拒，日志里看不出是哪一条。按「两轮不对就换工具」改交 Codex，一次完成。
        - 破坏检查：16 处改动起初发现了 15 处，漏掉的 `command: null` 我补了测试。补测试以后又试了 3 处，`status` 去掉 `DB_LOCKED` 没被发现：WAL 模式下另一个连接的写锁不挡读。我加了「还要迁移时被写锁住」这种情形，最后全部被发现。
    - **协调方式改了**：做这一步时用户指出，协调者不该通读工具写的补丁，太浪费。流程改成只看汇报和文件列表、自己跑检查、读代码交给审查（`b7c2c48`）。这一步的主体补丁是改流程之前通读的；补测试的补丁没有通读，只看了汇报，跑了测试和破坏检查。
    - **并行**：这一步收尾时，P1-18、P1-18b、P1-19a 已经各自在 Codex 的快照里开工，快照里带着这一步未提交的改动。
46. **P1-18 的实现（打包产物的离线端到端测试）（2026-11-16）**：
    - **怎么隔离**：`cli/e2e/bundle.test.ts` 用 `build.mjs --outfile` 把产物写进临时目录，不碰 `cli/dist/`。构建时五个 `VITE_*` 变量都填编造的 `.invalid` 值；进程变量优先于 `.env` 文件，空值也算，所以开发者机器上的真实值进不了这个产物。子进程只继承 `PATH`、`TMPDIR` 等少数变量，`HOME` 和 `SALTNET_HOME` 都是临时目录，`TZ=Asia/Shanghai`。每个子进程最多跑 60 秒：`spawnSync` 会卡住事件循环，Vitest 自己的超时管不了。
    - **网络**：`--import` 预加载 `e2e/fetch-preload.mjs`，把 `fetch` 换掉，不开端口。`serve` 模式用固定数据回答两个公开元数据地址；`deny` 模式拒绝一切请求并记日志，测试结束时日志必须是空的。
    - **步骤**：
        - 先读 `schema` 公开的外层结构 schema 和每条命令的 `data` schema。之后每个成功的 JSON 输出，都整体对照外层结构的 schema。
        - 用 `config list` 确认五个构建默认值编进了产物：五项的 `default` 都是编造的值；没被环境变量覆盖的两项，`source` 是 `build`。
        - 用产物自己的 `refresh` 灌数据。
        - 查第一阶段的验收标准：`status` 两个来源都是 fresh；`charts --level 13+ --diff mas` 离线可用，结果都是 13+ 的 MASTER；`search 39` 离线可用，第一个是曲目 146「39」，按标题找到。三者的 `data` 都要合 schema。
        - 把 `guide` 里的每条示例放在种子数据的一份副本上跑一遍。示例从 bash 代码块里解析，条数要和注册表对得上。`refresh` 的示例联网（`serve`），其余都加 `--offline`。
    - **每条示例的要求**：
        - 退出码都是 0。
        - JSON 输出：`command` 对，`data` 合这条命令的 schema。
        - TSV 输出：和同一条命令的 JSON 结果逐格对比，表头等于 `--fields`。投影过的 `data` 不完整，所以这时只对照外层结构的 schema。stderr 只允许 `# ` 开头的注释行，因为 TSV 把 `meta` 和警告写到 stderr（设计 4.2）。
        - 其他格式的 stderr 必须是空的，所以 Node 的实验警告之类会被发现。
    - **改了一条示例**：`charts --plate 熊華極 --diff mas` 改成 `charts --plate 真極 --diff mas`，因为固定数据里没有熊華極。
    - **接线**：
        - `cli` 加了 `test:e2e`，根目录加了 `test:cli-e2e`；`verify.sh` 跑根目录的每个 `test:*`，自然包括它。
        - CI 加了两步，`pnpm test:cli` 和 `pnpm test:cli-e2e`。
        - `eslint-suppressions.json` 多了 5 条：工作流的 `yaml/indent` 21→25，根 `package.json` 的 `jsonc/indent` 57→58。这两个文件原来就有这条规则的遗留问题，新行沿用文件原来的缩进。
        - 整个测试约 5.5 秒。
    - **委托的经过**：
        - Codex（GPT 5.6 Sol）写的。`tsc` 干净，1420 个单元测试和端到端测试都通过。它指出 brief 有两处做不到：TSV 的 stderr 不可能是空的；CI 加步骤必然增加工作流的 suppression。都照它说的办。
        - 审查（GPT 6.1 Sol）提了 5 条，都核实过，由我改：子进程没有超时；没验证构建默认值编进了产物；成功的外层结构只查了 `v` 和 `ok`；`search 39` 没查 `data`；TSV 输出是什么都能通过。
        - 破坏检查：把一条示例改成不存在的牌子、TSV 输出换成 `broken`、去掉构建默认值的 `define`、`search` 返回空列表、外层结构去掉 `warnings`，五处都被发现。
47. **P1-18b 的实现（按有没有退路选下载的期限）（2026-11-16）**：
    - **在哪里选**：`ensure.ts` 先逐个来源检查，必要时用 `cache/` 重建别的版本存的数据，这之后才知道有没有能退回的数据，所以期限在这之后按来源选：
        - 有能用的旧数据：`metadata.timeoutMs`（8 秒）。失败了就退回旧数据，带 `STALE_METADATA`。
        - 没有能用的数据：`network.timeoutMs`（15 秒）。包括从没下载过，也包括别的版本存的、`cache/` 里又没有能用的原始文件。
        - 显式的 `saltnet refresh` 一律用 `network.timeoutMs`。
        - `ensureDeps` 给 `ensure.ts` 两个 `fetch`，各带自己的期限。
    - **超时的 `fix`**：`createHttp` 多了 `timeoutKey`。超时（发请求和读响应两个阶段都算）的 `NETWORK` 错误在 `fix` 里写明调大哪个设置、怎么调；连接被拒之类的错误不带。
    - **等价的改动**：短期限超时总是退回旧数据，而 `STALE_METADATA` 的 `fix` 是 `saltnet refresh`（它用长期限），所以写着 `metadata.timeoutMs` 的 `fix` 实际不会出现在输出里。破坏检查里把这个键名改错不会被发现，这是等价的改动。
    - **两项设置的说明**改成写明各管哪些下载。
    - **委托的经过**：
        - Codex（GPT 5.6 Sol）写的，对 brief 没有异议。
        - 审查（GPT 6.1 Sol，加 Codex 自带的审查）没找到缺陷，指出两处测试不够强：别的版本存的数据重建不了时用哪个期限没测；读响应阶段的超时没测 `fix`。补测试交给 Codex，源码没有改。
        - 破坏检查：对调长短期限、都用短的、都用长的、`refresh` 用短的、`fix` 里写死键名、所有失败都当超时、重建不了的旧数据也当退路、读响应阶段写错键名，8 处都被发现。
    - **顺带改了 P1-17 的测试**：`errorCodes.test.ts` 原来把每条命令的每个示例、七种情形放在一个测试里跑，三百多次命令。单独跑 4.5 秒；这一步的整套检查和 Gemini 的任务同时跑，机器很忙，它超过了 20 秒的期限。现在拆成每条命令一个测试，内容不变；去掉 `METADATA_ERRORS` 里的一项，拆开以后照样被发现。
48. **提交信息不再写 `AI assistance:`（2026-11-16）**：
    - 从 P1-18b 起，Claude Code 的系统指示要求提交信息和 PR 描述里不加署名行，项目规则要求也一样。`AI assistance:` 一行写的是哪个模型做了什么，属于署名，所以不再写，只留 `Validation:`。
    - 谁做了什么照旧写在这里每一步的决定里。
    - 仓库里的 `commit.sh` 没有改，提交用 scratchpad 里去掉这一行的副本。README 要求在 PR 里说明用了哪些 AI 工具，开 PR 时由用户决定怎么写。
49. **P1-19a 的实现（`v_collection_targets` 每条条件只解析一次）（2026-11-16）**：
    - **原因**：这个视图把收藏品条件展开成每首歌、每个难度一行。`rank`、`combo`、`sync` 三列原来每一行都对整条条件的 JSON 调一次 `json_extract`，而一条条件可能含几千首歌，等于每行把那段大 JSON 重新解析一遍。
    - **做法**：
        - 视图的构造器加了可选的 `prefix`。`v_collection_targets` 用 `WITH collection_conditions AS MATERIALIZED (…)` 先把每条条件的这三个字段取出来，每条条件一次，再和歌、难度连接。难度仍是 LEFT JOIN，排序不变。
        - 沙盒复制视图用的是 `INSERT INTO … <prefix> SELECT …`。这个 CTE 只在复制时存在，用户的查询看不到也碰不到它，用户自己写同名的 CTE 也不冲突。
    - **结果不变**：
        - 新测试把旧的 SELECT 原样写在测试里，和新视图在固定数据的 176 行上逐行比较。
        - 真实数据（51 277 行）上，新旧两个产物各跑一次：每一列取 `quote()`，按视图顺序拼起来，sha256 相同。
        - `VIEWS_VERSION` 不变。
    - **快了多少**：真实数据上，`saltnet sql "SELECT count(*) FROM v_collection_targets"` 整条命令（含启动 Node 和复制视图）各跑 5 次，中位数从 1.85 秒降到 0.33 秒。
    - **委托的经过**：
        - Codex（GPT 5.6 Sol）写的，对 brief 没有异议。审查（GPT 6.1 Sol）没有意见；它的沙盒跑不了测试，测试和真实数据的对照是我跑的。
        - 破坏检查：难度改成 INNER JOIN、歌和难度的排序对调、`fc` 读成 `fs`、条件序号加一，4 处都被发现。去掉 `MATERIALIZED` 结果不变、只影响速度，测试不管速度，这一处没被发现是预期的。
50. **P1-19：第一阶段在真实数据上的验证（2026-11-16）**：
    - **真实刷新**：在临时 `SALTNET_HOME` 里用默认设置跑 `saltnet refresh`，整条命令 4.6 秒，stderr 没有输出。SaltMeta 有 1440 首歌、5702 张谱、20 个版本，合并了上游重复列出的 2 首宴谱；落雪收藏品有称号 3032、头像 1059、名牌板 400、背景 353。之后 `status` 两个来源都是 fresh。P1-18b 以前，同样的下载在 8 秒处超时过一次（那次 curl 用了 7 秒）。
    - **`v_charts` 与命令的输出对照**（第 41 条要留意的 (b)）：在真实数据上，`charts` 的 5702 张谱与 `v_charts` 逐列一致；抽查的 91 张谱和 4 张宴谱，`chart` 与 `v_charts` 也一致。SQLite 的 `round`、`trim` 和 JavaScript 在这些数据上没有差别。宴谱在 `v_charts` 里写成大写的 `UTAGE`。
    - **复制视图的耗时**（第 41 条 (a)）：整条 `sql` 命令（含启动 Node）的中位数，`v_charts` 约 0.11 秒，`v_course_tracks` 约 0.06 秒，`v_collection_targets` 原来 1.85 秒，P1-19a 以后 0.33 秒。
    - **留下的文件**（第 41 条 (c)）：每条命令结束后，数据目录里只有 `saltnet.db` 和 `cache/` 里的两个原始文件，没有 `-wal`、`-shm`。只读 `ATTACH` 不留文件，也不改数据库文件的修改时间。
    - **没法在这里验证的**（第 41 条 (d)）：Windows 路径的 `file:` 地址。写进最终报告。
    - **`AGENTS.md`**：写明怎么运行打包产物、代理从 `saltnet guide` 和 `saltnet schema` 开始，以及 `config list`/`config get` 的输出带着 `.env` 的默认值、不要贴到公开的地方。`cli/` 那一段已经很长，拆成分条留到 P2-27：P2-1、P2-2 的补丁还没提交，它们改的正是这一段前面几行，现在拆会让补丁对不上。
51. **P2-1 的实现（2026-11-16）**：
    - Gemini 搬的，纯移动：`user/type.ts`、`user/ratingHistory.ts`、`chart/scoreLookup.ts` 和 `chart/rating/` 的三个文件进了 `shared/core`。搬过去的文件只改了 import 行，别的文件只改了 import 路径。`user/type.ts` 的 `LXNSAuth` 原来从网页的 `@/components/integrations/lxns` 拿，现在直接从 `shared/core/integrations/lxns/type.ts` 拿。网页那个模块本来就是转出这个类型，所以还是同一个。
    - 审查只找到一处：补丁把搬过去的 `scoreLookup.ts`、`user/type.ts` 的 `perfectionist/sort-imports` 豁免调高了（前者从没有到 1，后者从 1 到 2），等于藏住了 import 顺序带来的新违规。改成按 ESLint 要的顺序排这几行 import（先类型，按路径排，再值）。两个文件都不再违反这条规则，两条豁免都删掉。
    - 搬模块的补丁，验证时只看审查和检查指到的地方（不通读补丁），检查包括 `pnpm build`。
52. **P2-2 的实现（2026-11-16）**：
    - Gemini 搬的，纯移动：`type.ts`、`candidates.ts`、`estimate.ts`、`presentation.ts` 进了 `shared/core/user/scoreHistory/`。文件夹外的代码都经由 `scoreHistory/index.ts` 拿这些名字，它改成从 `@core/…` 转出，所以文件夹外一行没改。留在网页端的 `repository.ts`、`queue.ts`、`backup.ts` 和 `queue.test.ts` 只改了 import 路径。
    - 这个补丁是叠在 P2-1 的原始补丁上做的。P2-1 提交前改过豁免文件（第 51 条），补丁里豁免文件那一段就对不上了，所以这一段由我重做：删掉四个旧路径的条目；三个新路径各记下 ESLint 仍报的非格式规则（`candidates.ts` 的 `import/consistent-type-specifier-style` 2、`perfectionist/sort-named-imports` 1，`estimate.ts` 和 `presentation.ts` 的 `import/consistent-type-specifier-style` 1 和 2），数目都和旧条目一样；`type.ts` 没有剩下的违规，不记。改了 import 的网页文件，计数都没变。
    - 审查没有发现问题。
53. **P2-3 的实现（2026-11-16）**：
    - Gemini 搬的：`userIdentity.ts` 进了 `shared/core/user/scoreHistory/`，`migrateData.ts` 和它的测试进了 `shared/core/user/`，都是纯移动，导入它们的文件只改了路径，`test:score-history` 指向搬过去的测试。`scoreHistory/backup.ts` 拆成两半：纯编解码搬进新的 `shared/core/user/backup.ts`（`UserDataBackupV1` 加了 `export`，`decodeUserDataBackup` 和它用的私有函数原样），另加 `encodeUserDataBackup(users, events, exportedAt)`，返回的对象字面量和原来 `createUserDataBackup` 里的一字不差。网页端的 `createUserDataBackup` 先等成绩历史导出完，再用 `Date.now()` 调它；`replaceImportedUserData` 和 `recoverPendingUserDataImport` 留在网页端；`decodeUserDataBackup` 和类型 `DecodedUserDataBackup` 由网页端的 `backup.ts` 转出，文件夹的 barrel 导出的名字不变。
    - Gemini 碰到一条被拒绝的命令就停了，没写报告。所以另外核对了：搬走的编解码代码在新文件里逐字出现（只多了 `export`），ESLint、`shared/core` 的类型检查和 `test:score-history` 都过，豁免条目没有调高；审查的说明里也请它找没做完的地方。
    - 审查没有找到行为上的问题，只指出现有测试不比较备份的字节，也不检查 `exportedAt` 是在导出成绩历史之后取的。前一条补了 `shared/core/user/backup.test.ts`（放进 `test:score-history`）：固定的用户、成绩历史和导出时间要编码成一字不差的 JSON（两段 base64 用 Node 的 Buffer 另算，不经过被测的编码函数），解码要还原出同样的内容，超过一个编码分块（0x8000 字节）的成绩历史也要能来回。后一条没补：`createUserDataBackup` 只有两行，`Date.now()` 在 `await` 之后一眼可见，要测它得把 IndexedDB 的导出挂起来。
54. **P2-4 的实现（2026-11-16）**：
    - Gemini 抽的：`b50.vue` 的纯查询逻辑原样搬进 `src/components/data/chart/b50Query.ts`（P2-6 再整体搬进 `shared/core/query/`）：`ComboFilterMode`、`selectB50Charts`（原来 `chartsByNewness` 的计算体，四个模式开关成了 `options` 的字段）、`recordsHaveLastChangedAt`、`createMusicChartMap`、`sumChartRatings`，以及 `convertDFRecordToChart`、`getSourceRecords`、`filterByComboStatus`、`sortCharts`、`calculateRating`、`normalizeConstant`。页面保留原来的名字做薄包装，模板一字未改。
    - 临时加了 `saltnet/prettier-owned-b50-query`（P2-6 删掉）。新模块没有剩下的违规，不记豁免；`b50.vue` 的计数只降不升，`style/arrow-parens` 那一条删掉。
    - 包装在调用前就读出所有参数，所以 `chartsByNewness` 多依赖了几个响应式值（数据还没载入时也会读 `musicChartMap` 和模式开关）。这些读取没有副作用，也不会抛错，结果不变。
    - 验证：一次性的差异测试把上一提交里页面的旧代码（按行切出来，配上假的 `computed` 和 ref）和新模块放在一起跑：三份曲目表（两份带合成的 `fit_diff`）× 70 组成绩 × 四个开关的 24 种组合，共 5040 个场景逐个 `toStrictEqual`，另外比对边界值和 200 轮排序。26 处故意的单行改动全被它抓到。第一轮有两处没抓到（`fitDiff > constant` 改成 `>=`，`ds` 为 NaN 时不回退到定数），因为测试数据里没有恰好等于定数的 `fit_diff`，也没有两位小数的定数（一位小数的定数经过 `normalizeConstant` 不变，回退与否结果一样）；补上这两种数据后全部抓到。P2-5 的 brief 把这两种情况列成了明确的用例。审查没有发现问题。
55. **P2-5 的实现（2026-11-16）**：
    - Gemini 写的快照测试 `src/components/data/chart/b50Query.test.ts`（P2-6 随模块一起搬走）：固定的曲目表加上种子 20261116 生成的合成成绩和 `fit_diff`，六种用户数据（只有 detailed、只有 b50、两者都有、detailed 是空对象但有 b50、没有数据、没有 `lastChangedAt`）× 六个页面模式，外加原样曲目表上的六个模式，每个场景存一份紧凑的文本摘要，选项按页面的方式构造（`pc50` 只在 `recordsHaveLastChangedAt` 为真时打开）。明确的用例覆盖 35/15 的上限、排序的各级比较、`calculateRating`、`normalizeConstant`、映射不到的成绩和宴会场谱面、nb50 恰好相等的边界、拟合定数的回退链（13.75 → 13.8）、两种连击筛选、只有 B50 的数据、`recordsHaveLastChangedAt`，以及不改动传入的数据。原样的曲目表里只有 8 张新版本的非宴会谱面，所以 15 的上限只在合成谱面上测。
    - 审查指出三种改动这份测试抓不到：摘要里没有转换后的连击、同步、评级、DX 分和更新时间；没有用例能区分稳定排序和多加一级按 ID 的比较；nb50 用例里成绩的 `ds` 总等于谱面定数。我又用 P2-4 的 26 处单行改动直接测这份测试（不接旧代码），找出第四处：拟合模式下 `fit_diff` 为 NaN 时回退到谱面定数。四处都由我补上：摘要每行加上这五个字段（重新生成的快照去掉这些字段后与原来逐字相同），另加三个用例。之后 26 处改动加上针对审查的 7 处，共 33 处全被抓到。
    - 测试记下了页面原有的这些行为，这一步不改：`recordsHaveLastChangedAt` 把空的 `detailed: {}` 当成有详细数据，`getSourceRecords` 在不要求详细数据时却会退回 B50 列表；nb50 拿没有取整的 `fit_diff` 和定数比较，而且不看成绩的 `ds`；`fit_diff` 为 NaN 或无穷时回退链停在这一步，不看 `ds`，直接用没有取整的谱面定数；`sortCharts` 最后没有按 ID 比较，各项都相同的谱面保持传入的顺序；`fitConstant` 不在 `ChartScore` 的类型里，测试要转型才能读到。
    - 没有再把旧页面代码接进这份测试对照一次：P2-4 的差异测试已经表明，新模块和旧代码在 5040 个场景里结果完全一致。
56. **P2-6 的实现（2026-11-16）**：
    - Gemini 搬的：`b50Query.ts`、它的测试和快照文件用 `git mv` 搬成 `shared/core/query/b50.ts`、`b50.test.ts` 和 `__snapshots__/b50.test.ts.snap`，只改了 import（`@core/…` 改成相对路径）。快照文件逐字节相同，测试不带 `-u` 也通过。`b50.vue` 改从 `@core/query/b50` 导入，导入行的位置没动，豁免计数不变；`saltnet/prettier-owned-b50-query` 删掉了。
    - `AGENTS.md` 里 `pnpm test:query` 那一条补上了 B50 页的快照（P2-5 漏了）；P2-8 的 brief 也要求补上谱面信息的部分。
57. **P2-7 的实现（2026-11-16）**：
    - Gemini 抽的：`ChartInfo.vue` 里吃分表、显示模式和 B50 底分的计算原样搬进 `src/components/data/chart/chartInfoQuery.ts`（P2-9 再搬进 `shared/core/query/chartInfo.ts`）：`RatingDisplayMode`、`ratingModeOrder`、`getChartRatingTables`、`getAvailableRatingDisplayModes`、`resolveRatingDisplayMode`、`selectDisplayedRaTable`、`getLowestRaInSection`、`getLowestRaInChartOrSection`。页面保留原来的名字做薄包装，模板一字未改。
    - B50 某一类是空数组时，算底分会抛 `TypeError`（`section[section.length - 1]` 是 `undefined`），旧代码只在简洁模式、表长于三行时才读它。所以 `selectDisplayedRaTable` 收一个取值函数（`getBaseRa`），只在原来读的地方调用；抛错本身原样保留，最终报告里会提。包装会提前读出 `currentChartScore` 等值：没有谱面时这些计算都先返回 null，不会抛错，只是多了几个响应式依赖。
    - Gemini 这次跑完 `pnpm lint` 就停了，没有报告，也没更新豁免文件，补丁里还夹着两个临时文件。我去掉临时文件后应用补丁，和 P2-6 改过的 `eslint.config.js`、`AGENTS.md` 用三方合并解决冲突，豁免由我自己更新：`ChartInfo.vue` 的计数只降不升，`antfu/curly` 一条删掉；新模块里不带花括号的 `if (!chart) return {…}` 是从页面带过来的，记一条 `antfu/curly`，P2-9 随文件搬走。Gemini 写的包装让 `style/comma-dangle` 多了 4 处（Prettier 的 `trailingComma: "es5"` 不许在调用参数末尾加逗号，两边没法同时满足）。我把包装改成块体，每个调用写在一行里；类型单独用 `import type` 导入，放在第一条 import 后面。这样各项计数都不再上升。
    - 验证：一次性的差异测试把旧页面的代码（按行切出来，配上假的 `computed` 和 ref，并统计 `currentUser` 被读了几次）和新的包装加模块放在一起跑。8 个种子 × 600 组输入，共 4800 个场景，逐个比对阶段表、可选模式、三种首选模式的回退、显示的行、是否读了底分、分类底分和最终底分（值或抛出的错误），全部一致，其中 512 个场景抛错，937 个场景读了底分。24 处故意的单行改动抓到 23 处；没抓到的是 `resolveRatingDisplayMode` 最后的 `available[0]`：页面上的可选模式总包含简洁，这一行走不到，P2-8 的明确用例会覆盖它。
    - 审查没有发现问题。
58. **P2-8 的实现（2026-11-16）**：
    - Gemini 写的快照测试 `src/components/data/chart/chartInfoQuery.test.ts`（P2-9 随模块一起搬走）。第一次运行碰上 DNS 解析失败就退出了（agy 退出码 3），原样重跑了一次。固定曲目表里每个不同的定数各取一张谱面（共 61 张），每张先存一份完整的阶段表，再对没有成绩、达成率为 0 或 null 以及几档达成率的成绩存可选模式和吃分表，对每个模式存当前显示的是哪张表。另一个场景把四种谱面（旧版本 SD、旧版本 DX、新版本 DX、没有谱面）、五种用户（B50 满的、不满的、末尾是 0 的、没有 B50 的、没有用户）和六种成绩组合起来，存底分和简洁模式下显示的行。明确的用例覆盖三行的界限、补进奖励阶段的位置、`resolveRatingDisplayMode` 的各种回退、`getBaseRa` 只在需要时调用、底分里的 0 和缺失值，以及不改动传入的数据。
    - Gemini 的版本在每种成绩和模式下都把三张表完整打印，快照有 1 MB。我改成只在和完整表不同时才展开（165 KB），并用脚本从两份快照还原出每个场景的三张表逐一比对，915 个场景全部相同。
    - 审查找出五种抓不到的改动：成绩只写了达成率或只写了 rating，所以底分在有达成率时忽略谱面 rating 的改动测不出来；快照里没有阶段的 `ds`；底分场景里旧谱面恰好都是 SD、新谱面都是 DX，按谱面类型而不是按新旧选 B50 分类的改动测不出来；没有达成率为 0 或 null 的成绩；没有末尾是 0 的 B50 列表。我又用 P2-7 的 24 处单行改动直接测这份测试，另找出一处：`resolveRatingDisplayMode` 往回找时跳过第一个模式（测试里的可选模式总按 `ratingModeOrder` 的顺序排）。这些都由我补上：成绩按页面的 `ChartScore` 写全字段，阶段表每行加上 `ds`，加入旧版本的 DX 谱面、末尾是 0 的 B50 和达成率为 0、null 的成绩，再加三个顺序打乱的可选模式用例（P2-7 走不到的 `available[0]` 也由它们覆盖）。之后 29 处改动（P2-7 的 24 处加上针对审查的 5 处）抓到 27 处。没抓到的两处结果相同：定数从 1.0 到 15.0 的每一张阶段表里，rating 从上到下严格递减，最后一行大于 0，所以底分为 0 时要补的阶段就是总会显示的最后一行，判断阶段是否已显示时少比较达成率也一样。
    - 审查更正了一条观察：谱面没有 rating、B50 也没有底分时，`getLowestRaInChartOrSection` 返回 `null`，不是 `undefined`（只有传进 `undefined` 的分类底分才会得到 `undefined`，这超出了它的输入约定）。测试记下的其余页面原有行为，这一步不改：B50 的相关分类是空数组时算底分会抛 `TypeError`；达成率为 0 或 null 的成绩当作没有成绩，吃分表就是完整表；两边都是 0 时底分是 0。固定曲目表里没有新版本的 SD 谱面。
59. **P2-9 的实现（2026-11-16）**：
    - Gemini 搬的：`chartInfoQuery.ts`、它的测试和快照文件搬成 `shared/core/query/chartInfo.ts`、`chartInfo.test.ts` 和 `__snapshots__/chartInfo.test.ts.snap`，只改了 import（`@core/…` 改成相对路径）。快照文件逐字节相同（用 `cmp` 对过 HEAD 里的旧文件），测试不带 `-u` 也通过。`ChartInfo.vue` 改从 `@core/query/chartInfo` 导入；为了不让 `perfectionist/sort-imports` 的计数上升，`vue`、`mdui` 和几条 `@/` 的值导入挪到了这条 `@core/` 导入后面。挪动的这几个模块在 `main.ts` 里早已加载过，新导入的模块也没有副作用，所以顺序不影响运行。`saltnet/prettier-owned-chart-info-query` 删掉了，模块那条 `antfu/curly` 豁免随文件搬到新路径，别的计数不变。
    - 审查没有发现问题。
60. **P2-10 的实现（2026-11-16）**：
    - Codex 拆的：`chartPosition.ts` 里的纯计算原样搬进 `shared/core/chart/position.ts`：`findChartPosition`（两个旧函数结尾相同的筛选、查找和格式化）、`sortChartsForPosition`（排序部分，返回排好的副本，不改传入的列表）、用这两个重写的 `getChartPositionByDifficulty`（空列表先返回 `"-"`）和原样的 `addPositionToCharts`。网页端只留 `getChartPositionFromCache` 和缓存的 key，在原来的 `try` 里调 `findChartPosition`，`catch`、日志和 `"-"` 都不变；网页里别处没有用到搬走的函数。一条 `prefer-const` 豁免随代码搬走，旧文件的计数只降不升。新测试 `shared/core/chart/position.test.ts` 和 `src/components/data/chart/chartPosition.test.ts`（localForage 跑在 `fake-indexeddb` 上）放进 `test:query`。
    - 补丁是在 P2-7 之前的快照上做的，等 P2-9 提交后用三方合并应用；`package.json` 和 `AGENTS.md` 的冲突由我解决，两边加的测试文件和说明都留下。
    - 验证：一次性的差异测试把上一提交的旧函数（按行切出来）和新函数放在一起跑，4 个种子共 2000 个场景（738 个找到了位置，528 个按用户成绩排序，46 个谱面不在列表里），外加读缓存的路径，结果全部一致。11 处故意的单行改动，差异测试抓到 10 处；没抓到的是把「谱面 id 相同，或曲目 id 和难度都相同」的「或」改成「且」：差异测试的数据里谱面 id 和曲目 id 加难度总是一一对应。提交的测试抓到了它。差异测试第一版是一个同步的长循环，碰上了 Vitest 的 5 秒用例超时和工作进程的 RPC 超时，基线没过，那一轮改动的结果作废；改成每 50 个场景让出一次、设了超时后重跑。这时发现 `mutate_root.py` 不检查不改动时测试是否通过，所以之后每次都先单独跑一遍基线。
    - 审查找出三种测试抓不到的改动：有用户成绩时跳过基础排序（测试里成绩相同的谱面本来就按基础顺序传入）；`addPositionToCharts` 改成直接改传入的谱面；把查找挪到 `try` 外面（只有读缓存失败才进 `catch`）。三处都由我补了用例：成绩相同、传入顺序和基础顺序相反的谱面；传入的谱面不变，返回的是新对象；缓存里的 `charts` 不是列表时查找本身抛错，仍然返回 `"-"` 并写同样的日志。之后 14 处改动（原来 11 处加这 3 处）全被提交的测试抓到。
    - 页面原有的行为照旧：位置的分母是总数加一；main 上的 bb2b1b77 之后没有人再写 `chartsSortCachedV2`，所以对话框里的位置总是 `"-"`。这一步不改，最终报告里会提。
61. **P2-11 的实现（2026-11-16）**：
    - Codex 拆的：`collections.vue` 里算拥有的收藏品 id（`getOwnedCollectionIds`）、把旅行伙伴转成收藏品（`toCharacterCollection`）、判断是否拥有（`isCollectionOwned`），以及 `CollectionProgress.vue` 里给收藏品的谱面挂上成绩、按完成情况排序（`getScoredCollectionCharts`），分别搬进 `shared/core/collection/ownership.ts` 和 `progress.ts`；页面只把用户和谱面传进去。新测试放进 `test:collection-index`。页面上的 `(character as any).genre` 换成了有类型的 `character.genre`，值相同。
    - 补丁是在 P2-10 之前的快照上做的，用三方合并应用；`AGENTS.md`、`package.json` 和 `eslint-suppressions.json` 的冲突由我解决。豁免只降不升：`CollectionProgress.vue` 的 `style/indent` 118→112；`collections.vue` 的 `style/indent` 223→191、`antfu/if-newline` 7→6、`style/arrow-parens` 3→2、`style/comma-dangle` 2→1；新文件没有违规。
    - 验证：一次性的差异测试把上一提交的页面代码（按行切出来）和新的页面行加 core 模块放在一起跑。拥有状态跑了 1800 个随机用户场景（56506 次判为拥有，3600 次是 `undefined`，15137 个旅行伙伴已拥有）；进度跑了 3648 个场景，覆盖 24 个能按成绩判断的收藏品（1530 个有谱面，896 个挂上了成绩），没有 `data` 的用户在两边抛出同样的 228 个 TypeError。结果全部一致。18 处故意的单行改动（另有一处针对 `as any` 写法的改动在新代码里找不到），差异测试抓到 17 处，没抓到的是去掉 genre 的 `|| ""`：内置的旅行伙伴都有 genre。提交的测试原来漏了 3 处：搭档（第 10 类）id 的顺序、改写传入的谱面、没有 genre 的旅行伙伴。我补了用例后 18 处全被抓到。
    - 审查找出一处行为变化：页面把 `ownedCollections.value` 直接当参数传给 core，于是默认 id 和旅行伙伴也要先算一遍拥有的 id 表，而原来这两种情况提前返回，根本不读它。这改变了计算属性何时求值、依赖哪些响应式数据，以及条目里有 `null` 时会不会抛错（审查举的例子：`data.items[1]` 是 `[null]` 的用户看旅行伙伴时会抛 TypeError）。改法：`isCollectionOwned` 的第二个参数改成取 id 表的函数，只在原来读表的那一行调用；页面传 `() => ownedCollections.value`。差异测试加了两项检查：每次判断时两边读计算属性的次数（1675800 次都不读，90000 次读一次，两边相同），以及审查举的那个用户在每个收藏品上是抛错还是返回（50 处抛错，931 处返回，两边相同）。把页面改回提前求值（`(owned => () => owned)(ownedCollections.value)`）后，这两项都失败。
    - 审查还找出四种测试抓不到的改动，都由我补了用例：把普通收藏品一律判成未拥有（之前没有断言过普通收藏品判为拥有）；谱面原来带着别的成绩时保留它（现在谱面先带一份别的成绩，没有成绩数据时要清成 `undefined`，有时要换成新成绩）；返回旅行伙伴数据的副本（现在断言是同一个对象）；改写传入谱面里嵌套的数据（现在把谱面和成绩整个冻结后再调用）。另加了一条用例：默认 id 和旅行伙伴不调用取 id 表的函数。之后 24 处改动（原来的 18 处、这 4 处、两处提前读表）全被提交的测试抓到；差异测试抓到其中 20 处，没抓到的 4 处（genre、旧成绩、副本、改嵌套数据）是差异测试的数据碰不到或分辨不出的。修正后没有再送审，改动由上面的差异测试和改动检查确认。
    - 已有的行为照旧：`isCollectionOwned` 碰到拥有表里没有的类别返回 `undefined`（差异测试里 3600 次），最终报告里会提。
62. **P2-12 的实现（2026-11-16）**：
    - Codex 写的：迁移 4（计划写的是「迁移 2」，那时还没有课程和静态数据的迁移 3，编号顺延）建了 `users`、`scores`、`b50_snapshot`、`user_items`、`user_characters`、`rating_history`、`score_events`，全部 `STRICT`，删掉用户时它的行跟着级联删除，`users` 里没有任何 token 列。`scores` 以网页端的 `record_key` 为主键，另有可空的 `chart_key`（下一步匹配，宴谱两者不同）；`(user_uid, chart_key)` 唯一，所以 `v_charts` 不会因为一张谱有两条成绩而多出一行。`b50_snapshot` 给每个有 `data.b50` 的用户存（设计原来写的是只给只能拿到水鱼公开 B50 的用户用，Codex 改了设计，理由是备份要原样往返）。对外视图加了 `v_scores`、`v_score_events`、`v_rating_history`、`v_user_items`，还有计划里没写、设计 2.2 的视图清单里有的 `v_user_characters`；`v_charts` 在原有各列之后加默认用户的 8 个成绩列，原有的列和行逐行没变（测试里对过 183 行）；`VIEWS_VERSION` 升到 2。`v_scores` 按用户序号、曲目 id、难度排，最后按 `record_key`，所以顺序总是确定的。
    - 第一轮审查（带内置审查）找出 4 处数据问题：整数列放不下网页端接受的小数（rating 历史、成绩历史的时间、用户的 rating 和更新时间）；`data.items` 末尾的 `null` 存不下；`remark`、`inGame.name` 这类可空字段分不清 `null` 和缺省；视图的时间函数在负数时写出 `.-01Z` 这样的文本，在 10000 年以后变成 NULL。我先读了网页端的备份解码：`decodeUsers` 只检查 `data`、`inGame`、`divingFish` 是对象，其余原样收下，网页端以后加的字段也一样。所以只靠分列存，备份永远做不到原样往返。改法：`users` 加一列 `raw`，存网页端这个用户的完整 JSON（去掉 token），导出备份时照它写回；其余各列和 `scores` 到 `rating_history` 这几张表是从它拆出来、给查询用的副本，放不进列类型的值在副本里是 NULL（写入方在 P2-13）。于是 `rating_history.time`、`rating_history.rating`、`user_characters.character_id` 改成可空。`raw` 的 `CHECK` 要求它是 JSON 对象、`uid` 和本行相同、没有水鱼 Import-Token 和落雪授权（`null` 或缺省可以），所以 token 连库都进不去；9 种不合格的值在测试里都被拒绝，报的都是 `CHECK` 失败，不是 JSON 解析错误。第一轮里我为了分清空列表和 `null` 加的 `user_item_lists` 表有了 `raw` 就不需要了，删掉。网页端自己写的这些数都是整数（rating 来自水鱼、落雪和游戏，落雪的 `dx_rating` 在 `fetchScore.ts` 里向下取整；时间来自 `Date.now()`），所以真实数据的副本不会出现 NULL，只有手改过的备份会。
    - `score_events` 不在用户对象里，存的就是事件本身。网页端的 `validateEvents` 接受任何有限、非负的 `observedAt`，所以 `observed_at` 改成 `REAL`；其他字段（`dxScore`、`sequence`、`changedMask`、`playCount`）网页端都要求是整数，原来的列放得下。事件对象上网页端不认识的键不保存：事件的格式带版本号，`schemaVersion` 不是 1 时网页端和 CLI 都拒收，新字段应该跟着新版本号来。
    - 时间：命令输出用本机时区（设计 4.5），视图用 UTC 的 ISO 8601（带毫秒，以 `Z` 结尾），这样同一条查询在哪台机器上结果都一样，按文本排序就是按时间排序；设计 4.5 补了这个例外。时间函数改成 `strftime('%Y-%m-%dT%H:%M:%fZ', CAST(x AS INTEGER) / 1000.0, 'unixepoch')`，再挡掉 0000 年以前的时间（SQLite 会写出 `-001-12-31…` 这样不是 ISO 8601 的文本，10000 年以后它自己给 NULL）。和 `new Date(x).toISOString()` 在 300022 个值上逐个比较（±3.2×10¹⁴ 毫秒内的随机数，三分之一带小数，加上边界和 NULL），全部相同；0000 到 9999 年以外是 NULL，列说明里写了。
    - 测试：我补了 9 个用例和几处断言。迁移 2 个：`raw` 的约束（原样存下网页端以后才有的字段、小数、`null` 和缺省；拒绝 11 种不合格的值，包括两种 token 和两种不是文本的 uid），以及 B50 的整行（带小数的达成率和定数，按分区和位置读回）、小数的 `observed_at` 和副本里的 NULL；另外查了两个用户不能占同一个序号。视图 7 个：`v_scores` 的整行；各种记录的曲目 id（SD、DX 低于和等于 10000、小写的 `dx`、没有类型、没有 id）；`v_charts` 的 8 个成绩列只来自默认用户（第二个用户的成绩值都不同）；两个用户有同一个 `record_key` 时事件只挂自己的成绩；五个视图的排序（插入顺序、uid、原始曲目 id、`sequence`、收藏品在列表里的位置、旅行伙伴 id 给出的顺序都和正确的不同）；三个视图的顺序里每一种并列都分得开（事件靠 id 分开的那一种，插入顺序和 `record_key` 给出的顺序也都和正确的不同）；时间文本（负数、小数、0000 年和 9999 年的边界、范围以外是 NULL）。
    - 改动检查：53 处。第一次跑时基线被 tinypool 的 worker 崩溃打断（和同时运行的 Codex 抢 CPU），崩溃被算成了发现，所以换了运行脚本：先跑基线，worker 崩溃的重跑（最多三次），崩溃不算发现。第二次跑：44 处被发现，8 处没被发现，1 处没对上（同一段文本出现两次）。没被发现的：`v_scores` 按 uid 排、按原始曲目 id 排，事件先按 `sequence` 再按时间排、排序去掉 id，收藏品先按位置再按列表排，旅行伙伴按 id 排，`users.position` 去掉 `UNIQUE`，`raw` 的约束去掉「是 JSON 对象」（等价：`uid` 那两项检查只有对象能通过；为了好读留着）。我补了上面的排序用例和序号重复的断言，并列用例换了 `record_key`。再跑 20 处（这 8 处，没对上的那处换了更长的文本，审查以后改的 4 处，其余排序的写法）：18 处被发现；没被发现的是那处等价的，和 `v_scores` 先按难度再按曲目 id（排序用例的数据两种排法结果相同），改了数据单独再跑，被发现。
    - 第二轮审查（带内置审查，内置审查没有意见）提了 7 条：
        - 改了 3 条。`raw` 的 uid 检查和 TEXT 列比较时会套用文本亲和性，`{"uid":1}` 和 `{"uid":true}` 都能当成 uid `"1"`，加了 `json_type(raw, '$.uid') = 'text'`，测试里两种都被拒绝。`v_user_items` 的 `stock`、`is_valid` 只在一行上检查过，换成常量也能通过，改成每一行都核对 `item_id`、`stock`、`is_valid`。计划里 P2-12 这一行还写着迁移 2、漏了 `v_user_characters`，改了，并补上这一条决定。
        - 事件里超过 2^53 的整数（`validateEvents` 只要求是整数）：我试了一下，node:sqlite 能把 2^53 存进 INTEGER 列，读回来却抛 `ERR_OUT_OF_RANGE`，1e20 根本存不进去，所以问题比审查说的更大：存进去的行以后每次读都会出错。改成写入方拒收这样的事件，导入时报错（设计 2.4 补了一句）。不改成 REAL 列：那样视图里这几列就是 REAL，`play_count / 2` 这样的查询会悄悄变成小数除法；而网页端自己从不写出这样的值。用户各列的副本本来就只放安全整数（P2-13 的写入方）。
        - `generation_id` 不接受 NULL 或缺省：不改。网页端导入时本来就给每个事件换上新的 generation 和 id（见下面留给 P2-16 的一条），备份里带来的 generationId 从来不保留，CLI 照做。
        - 重复的 JSON 键能绕过 token 检查（SQLite 读第一个，`JSON.parse` 读最后一个）：不加触发器去查重复键（`CHECK` 里不能用 `json_tree` 这样的子查询，触发器每次写都要遍历整个用户对象）。`raw` 只由写入方用 `JSON.stringify` 写，写不出重复的键；写入方先拒收带 token 的用户（P2-13），约束是第二道。迁移的注释和设计 2.2 改成照实说：写入方拒绝，约束再挡一道。
        - `v_charts` 的 `score_combo`、`score_sync` 换成 NULL 也能通过：审查用的快照比我最后加的两个用例早，`shows every score column of v_charts from the default user only` 已经覆盖（改动检查里 `score_combo reads fs` 就是被它发现的）。
    - 留给 P2-13：写入方要先像网页端的 `normalizeDecodedUsers` 那样规整用户（uid、`inGame.enabled`、`useFastUpdate`、`settings.manuallyUpdate` 这几列都是 NOT NULL），把 token 挪去 `credentials.json`，再在同一个事务里写 `raw` 和所有副本；`chart_key` 由 core 匹配，不用网页端那个会把已游玩的宴谱成绩挂到没玩过的兄弟谱上的兜底。
    - 留给 P2-16：网页端的 `validateEvents` 不检查 `generationId`，导入时 `stageScoreHistoryImport`（`src/components/data/user/scoreHistory/repository.ts`）给这次导入新起一个 `import-<随机 id>` 的 generation，并把每个事件的 id 改写成 `<generation>:<用户 uid>:<batchId>:<chartKey>:<sequence>:<kind>`。CLI 的导入照做，所以 `generation_id` 和 `id` 不会是备份里带来的任意文本，`generation_id TEXT NOT NULL` 够用。
63. **P2-14 的实现（2026-11-16）**：
    - Codex 写的（第一次运行在重启时丢了，重跑了一次）：`cli/src/commands/confirm.ts` 把 operation、target 和 state 写成规范的 JSON（键排序；拒绝非 JSON 的值、循环和稀疏数组），做 SHA-256，取前 40 位写成 8 个 Crockford base32 字符。码没有时限，传入时不分大小写、去掉首尾空白。`requireConfirmation` 在码不对时抛 `CONFIRMATION_REQUIRED`（退出码 6），带 `preview`、`confirmationCode`、`codeRejected`，`fix` 里是完整的确认命令（`joinCommandLine` 按 POSIX shell 的规则加引号，`splitCommandLine` 读回来不变）。注册表要求 `yes` 选项和 `CONFIRMATION_REQUIRED` 成对声明。`--format text`（或终端里设成 text）时预览是给人看的文本，其他错误照旧是 JSON；设计 4.2 补了这个例外，5.4 补了码的格式和字段。
    - 审查（带内置审查）找出 2 处问题，都改了：确认参数里有 `--` 时，`--yes <码>` 拼在它后面会被当成位置参数，改成插在 `--` 前面；`--yes ''` 被通用的字符串检查当成 `USAGE`，没有预览，所以给字符串选项加了 `allowEmpty`，确认码用它，空码和错码一样得到新的预览（`codeRejected: true`）。
    - 测试：我补了这两处的用例，以及审查和改动检查指出的空白：shell 元字符（`$`、`*`、`?`、`~`、反引号、`!`、`;`、`&`、`|`、重定向、括号、`#` 等）一定加引号；其他错误在 text 格式下仍是 JSON；终端设成 text 时打印预览，输出到管道时是 JSON；`retryable: false`；null 原型的对象和被引用两次（不是循环）的对象；孤立的代理项和替换字符得到不同的码；真实的确认失败符合公开的外层 schema，确认码写成数字之类的会被拒绝。tsv 不用测：不是列表的命令在运行之前就拒绝 `--format tsv`。
    - 改动检查：35 处，34 处被发现。没被发现的那处（不检查数组里的 `undefined`）是等价改动：紧接着的非 JSON 检查照样抛错。
    - 留给用到确认的命令（P2-15 起）：引用以 `-` 开头时，`confirmArgs` 要在它前面写 `--`；`state` 要包含操作改动或依赖的全部数据；预览要在改动之前生成，并且不读 stdin（`user bind … ingame --qr -` 除外，见 `confirm.ts` 开头）。
64. **P3-1 的实现（2026-11-16）**：
    - Gemini 搬的：水鱼的玩家查询、Import-Token 取成绩、上传成绩、由成绩算 B50 搬进 `shared/core/integrations/diving-fish/client.ts`，两个纯转换搬进 `convert.ts`；地址来自新的 `CoreConfig.divingFishBaseUrl`，`fetch` 可注入，错误是带 HTTP 状态的 `DivingFishError`。网页端的 `player.ts`、`index.ts` 和 worker 里的 `uploadToDivingFish` 只剩薄包装，CLI 的 `toCoreConfig` 只多传这个地址。上传照旧不看状态码（网页端无论成败都报成功），由调用方自己看 `ok`。
    - 我改的：Gemini 把上游的 `message` 改成只认去掉空白后非空的字符串，网页端的提示会变；改回网页端原来的规则（`message` 为真就用 `String(message)`），补了测试。
    - 审查（GPT 6.1 Sol，带内置审查；内置审查没找到问题）找出的，我都改了：网页端抛出的错误从 `Error` 变成了 `DivingFishError`，提示条里 `toString()` 的前缀会变，所以网页端的包装把它换回同样文字的普通 `Error`，别的错误原样往外抛，`console.error` 记的是抛出去的那个对象；隐去 Import-Token 时，很短的 token（如 `e`、`500`）会把无关的字弄乱，一次替换还可能拼出新的 token，所以改成不长于 `[REDACTED]`（10 个字符）的 token 不找，并且反复替换到一处都不剩（每替换一次文字都变短，所以一定会停）。
    - 网页端唯一看得见的变化（有意的）：水鱼的错误信息里要是带着长于 10 个字符的 Import-Token，显示成 `[REDACTED]`。
    - `fetch` 自己抛的错原样往外抛。浏览器的这类错误里从来没有请求头的值，但 Node 的 `fetch` 遇到不能放进请求头的值（比如带换行的 token）时，会把整个值写进错误信息（`Headers.append: "…" is an invalid header value.`）。留给 P3-6：`ctx.http()` 的错误信息和 cause 里不能出现凭据请求头的值（`cli/src/runtime/http.ts` 现在会把 cause 的信息抄进 `NETWORK` 错误），发出请求之前要先检查这些值。
    - 测试：审查指出的空白由 Gemini 补（它在最后跑了一条不允许的命令，运行被中止，没有报告；补丁是完整的，我修了一处 `init` 没定义的错误和一处 `vue-tsc` 报的类型错误）：每个请求只发一次；隐去 token 的各种情况（重复出现、替换后重新拼出、短 token 和空 token 不动、10 和 11 个字符的边界、无关信息不变）；`fetch` 抛的错原样往外抛；新曲同分保持原顺序、15 和 35 的上限；转换后谱面的顺序、谱面指回所属乐曲、`notes` 和 `level`；新的 `src/components/integrations/diving-fish/player.test.ts`（加进 `test:integrations`）测网页端包装抛的是普通 `Error`、`String(error)`、`console.error` 的参数、网络错误原样往外抛。worker 里「上传无论状态码都报成功」没有测试，是对照改动读过的。
    - 改动检查：49 处，全部被发现。
    - 浏览器里没有验证：要用到水鱼账号的凭据，按要求只用模拟 HTTP 测试；网页端的包装由上面的测试覆盖。
65. **P2-13 的实现（2026-11-16）**：
    - Codex 写的（第一次运行在 2026-11-16 的重启里丢了，重跑了一次）：`cli/src/users/` 是用户表唯一的写入方，`repository.ts` 有 `listUsers`、`readUser`、`readUsers`、`readScoreEvents`、`saveUser`、`removeUser`、`makeDefaultUser`、`appendScoreEvents`、`replaceUsers`，`rows.ts` 从用户对象算出各张副本表的行，`storage.ts` 负责写入和换曲库时重算谱面键；`cli/src/refs/user.ts` 的 `resolveUser`；`replaceMusic` 在同一个事务里重算所有用户的谱面键。它自己定下的：收藏（`favorites`）和同步记录（`sync_runs`）留给 P2-25 和 P3-7；校验比 core 的 `User` 类型严，网页端不会写出的用户在写入之前就拒绝；成绩事件只认 `schemaVersion` 1；一个谱面键在一个用户的成绩里只给一条记录。
    - 我改的：`divingFish.importToken` 只能是 `null` 或者没有（网页端给没有 token 的用户写的就是 `null`），有值（空字符串也算）就拒绝，库里从不存 token。
    - 第一轮审查（GPT 6.1 Sol，带内置审查）找出 4 个错误和 2 处测试空白，由 Codex 再跑一次改掉：记录的形状检查太严（现在只要是普通对象就参加对谱面，形状检查只留在 core 的查找会抛错的地方）；同一个谱面键在一个用户的 B50 快照里会给好几行（现在只给一行）；对谱面的结果取决于是不是同一个对象（同一个对象和内容相同的两个对象结果不同，现在只看数据和键的顺序）；显示名要用 core 的 `getUserDisplayName`（网页端的函数）对从 `raw` 解析出来的用户算，再 `String()`。补的测试：重新保存一个用户（副本表整个换掉，成绩事件和别的用户不动）；`replaceMusic` 加歌和删歌时两个用户的重算。
    - 第二轮审查找出 3 处，我改的：B50 条目不再因为别的字段类型不对被丢掉；键为 `__proto__` 和空字符串的记录照常参加；core 的查找会抛错的值（转不成文字或数字的 `song_id`、`level_index`、`ds`，不是字符串的 `type`）不参加对谱面，也不让保存失败。
    - 简化：去掉了宴会谱那一遍「把同曲的兄弟谱面截到当前谱面」的副本，以及第一版给 core 的 `createDetailedScoreLookup` 加的选项 `fallbackToFirstUtageCandidate`（`shared/core/chart/scoreLookup.ts` 的改动撤回，P2-13 不再改 core）。理由：宴会谱的等级都是 10，同一首歌的宴会谱共用谱面键 `<乐曲 id>-10`，目录顺序里第一张宴会谱先拿到 core 的第一个候选，键随即被占，后面几张不起作用。改动检查证实两种写法结果一样。
    - 所有副本都从 `JSON.parse(JSON.stringify(user))` 读，所以保存时写的行和换曲库时从 `users.raw` 重算的行一样（`Date`、带 `toJSON` 的对象都按写进 JSON 的值算）。
    - 决定：几行 B50 争同一个宴会谱的键时，按 core 的候选顺序（`level_index` 小的先，再看 `ds`，再看快照顺序），不是先看快照顺序，因为网页端就是按这个顺序把记录对到宴会谱上的；只有 core 分不出先后的几行才按快照顺序（SD 在 DX 前，再按位置）。网页端的 B50 页面本来就不收宴会谱，没有显示出来的顺序可以对照（第三轮审查确认）。设计文档 2.2 节照最终规则改写。
    - 校验的测试改成检查仓库自己的报错（`invalid stored user`、`invalid stored score event`、`duplicate user uid`）：之前的改动检查里有 18 处没被发现，因为表上的 CHECK 约束反正会抛错，测试只看「抛了错」。缺的情况也补上了。
    - 第三轮审查（GPT 6.1 Sol）：没有错误，指出 3 处测试空白，我补了：`type` 是数字或 `ds` 转不成数字的 B50 条目保留一行、谱面键为空；每张副本表都对照「保存从 JSON 解析回来的副本」的结果；宴会谱的竞争经过 `buildUserRows` 测，不只测 `chartKeysForRecords`。
    - 改动检查：90 处，85 处被发现。没被发现的 5 处是等价的：`Infinity` 和 symbol 经过 JSON 就不会出现（2 处）；重算前先把谱面键清空是多余的，每一行的键（包括空）都会重写；第二遍只看宴会谱只是省事；第二遍不记「这条记录已经用过」也一样，因为一条记录只属于一首歌，而那首歌的宴会谱键已经被占了。
    - 只动了 CLI，网页端没有变化，不用在浏览器里验证。
66. **审查改成每个 part 一次，开 Codex 任务前查额度（2026-11-17）**：
    - 2026-11-16 22:33 用户说 Codex 的额度快用完了，让正在跑的跑完，不再开新的 Codex 任务，先做 Gemini 能做的事。那之后做完的 P3-2、P3-3、P2-15 停在「已验证、等审查」，P3-4 和 P2-15 的补测试交给了 Gemini。2026-11-17 用户说两边的额度都恢复了，要求开新的 Codex 任务之前先查剩余额度。
    - 查额度：`codex exec --json` 的事件里没有额度信息，所以加了 `codex-quota.py`：启动 `codex app-server`，发 `initialize` 和 `account/rateLimits/read`（不调用模型），打印 5 小时和每周两个窗口用掉的百分比和重置时间。02:48 查的结果：5 小时窗口 0%，每周窗口 61%（11-19 00:14 重置）。所以 Codex 留给新功能、难的重构和审查，搬模块、补测试和文档照旧交给 Gemini。
    - 用户接着说：「不要频繁review，完成一整个part后再整体review」。之前是每个有代码的步骤提交前审一遍（「分工与流程」第 6 条）。现在一步做完、完整检查和破坏检查都过了就提交，不等审查；一个 part 的步骤全部提交以后，把上次审过的提交之后的全部提交整体审一遍，意见在后续提交里改，并记进决定。
    - 单独审过的是 P2-14 及以前的全部步骤、P3-1 和 P2-13（`91c0892`）。P2 和 P3 的提交在历史里是交错的，所以 P2 做完时审的范围是 `91c0892` 之后的全部提交，brief 写明里面有哪些步骤（包括已经提交的 P3 步骤）；P3 做完时审的是那以后的提交。
    - `review-codex.sh` 加了 `REVIEW_BASE`：设成一个提交时，快照的 `base` 是那个提交，工作区是磁盘上现在的样子（之后的提交加上未提交的改动），所以 `git diff base` 是整个范围，`codex review --uncommitted` 看到的也是它。
67. **P3-2 的实现（2026-11-17）**：
    - Codex（GPT 5.6 Sol）写的：`shared/core/integrations/lxns/token.ts`（token 端点的请求 `requestLXNSToken`、表单序列化 `serializeFormBody`、`applyLXNSAuth`、`refreshLXNSOAuthToken`）和 `client.ts`（玩家接口的请求 `requestLXNSPlayerApi` 和它的错误类 `LXNSPlayerApiError`，成绩转换 `convertLXNSScore`、`convertToLXNSUploadScore`）；`CoreConfig` 加 `lxnsClientId`，CLI 的 `toCoreConfig` 传 `lxns.clientId`。网页端留下薄包装：`fetch.ts` 把 core 的错误换回同样文字的普通 `Error`；同一个用户对象只刷新一次的 `WeakMap` 留在网页端。
    - 网页端原来拿 `URLSearchParams` 当请求体，由浏览器加上 `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`。core 里没有 DOM 类型，发的是字符串，所以自己写这个头，序列化和 `URLSearchParams.toString()` 逐字节一样（空格写成 `+`，`*-._` 不转义，其余按 UTF-8 百分号转义，十六进制大写）。`oauth.test.ts` 里读请求体的一处改成先 `new URLSearchParams(body)`。
    - 我改的：孤立的代理项会让 `encodeURIComponent` 抛 `URIError`，`URLSearchParams` 则把它写成 U+FFFD（`%EF%BF%BD`），改成和后者一样；core 的错误类不设 `name`（网页端的提示条用 `toString()`，设了前缀就变）；玩家接口的端点照原样拼（Codex 去掉了开头的 `/`，网页端没有，`"/scores"` 写出的是 `player//scores`）；成功与否照网页端判断，`success` 是假值就算失败（Codex 写的是只有 `success === false` 才算，`{ data: [] }`、`success: 0` 和 `null` 都会被当成成功）；搬走的代码带走的 ESLint 豁免按实际数目调低（`token.ts` 那一条整条删掉）。
    - 测试：改动检查 37 处，第一次跑有 7 处没被发现，由 Gemini 补测试：token 端点 HTTP 200 而 `success: false` 时报「落雪授权失败：HTTP 200」；新的 `src/components/integrations/lxns/fetch.test.ts`（加进 `test:oauth`）测网页端包装抛出的错误；刷新 token 的请求体逐字节比对。补完后 37 处全被发现。
    - 按决定 66 不单独送审，并入 P3 的整体审查。没有用真实的落雪账号在浏览器里走一遍授权（要账号凭据，按规矩不做），请求的字节和提示文字由测试比对；最终报告列为没验证的项。
68. **P3-3 的实现（2026-11-17）**：
    - Gemini 写的：`shared/core/integrations/saltnet/client.ts`（`SaltAPIEndpoints`、`SALTNET_GAME_API_ERROR_MESSAGE`、错误类 `SaltNetError`（带 `kind` 和 `status`，不设 `name`）、`postSaltNetAPI`、`postSaltNetAPIJSON`）。主地址失败（网络错误或 HTTP 错误）时换备用地址，两个地址来自 `CoreConfig` 新加的 `saltnetApiUrl`、`saltnetApiFallbackUrl`；CLI 的 `toCoreConfig` 传 `api.url`、`api.fallbackUrl`。网页端的 `postAPI`、`postAPIJSON` 成了包装：从 `import.meta.env` 读两个地址，请求失败和 JSON 读不出来时照旧 `console.error`；`postAPIJSON` 的返回类型写成 `Awaited<ReturnType<Response["json"]>>`，就是原来推断出来的 `any`，不用显式写 `any`。
    - 一处行为上的差别，保留：没设 `VITE_API_URL` 时，原来的模板字符串写出 `undefined/getQRInfo`，现在 `resolveCoreConfig` 把它当成空字符串，写出 `/getQRInfo`。只有配错的构建会遇到，两种请求都会失败，然后换备用地址。
    - 测试：我补了一个用例：`postAPIJSON` 成功时只请求一次主地址，请求体照原样。改动检查 34 处，33 处被发现；没被发现的一处等价：判断上游错误时去掉「是对象」的检查，JSON 读出来的非 null 原始值没有 `error` 属性，结果一样。
    - 按决定 66 不单独送审，并入 P3 的整体审查。网页端的请求和日志由 `test:integrations` 里的包装测试比对；没有在浏览器里对真实后端试（绑定和更新要账号凭据）。
69. **P2-15 的实现（2026-11-17）**：
    - Codex（GPT 5.6 Sol）写的：`user list/show/add/edit/remove/default`（`cli/src/commands/user.ts`）；用户行和详情的形状（`cli/src/users/view.ts`）；`status` 加 `users`，给出每个用户的成绩更新时间和 `fresh`、`stale`、`missing`（到 `scores.staleDays` 那一刻就算 `stale`，和曲库的边界一样）；`repository.ts` 加各表行数（`readUserCounts`）和删除确认用的内容摘要（`readUserRemovalFingerprint`：`users` 这一行和六张子表里这个用户的全部行一起做 SHA-256）。
    - 它自己定下的，我都同意：布尔选项加了可选的三态（`optional: true` 时没给就是 `undefined`，描述里的默认值是 `null`，帮助里写成 `--[no-]manual-update`），只有 `user edit --[no-]manual-update` 用，别的开关不变；纯数字的引用照旧先当序号，但带 `--yes` 的确认命令里 uid 精确相等优先，因为确认命令写的是 uid，纯数字的 uid 会和序号撞上；确认码除了计划写的几项还绑定内容摘要，所以只改了 `manualUpdate`，或者成绩改了而行数没变，旧码也失效；新用户的形状照网页端的 `handleUserSave`，所以 `lxns` 是 `{ id: null, name: null }` 而不是 `null`；字段名 `status.users.items`、`remainingUsers`、`previousIndex` 写进了设计文档；删除成功时返回预览里的详情加上 `remainingUsers`；备注保留首尾空格，空字符串或全是空白报 `USAGE`。
    - 测试：改动检查 39 处，第一次 24 处被发现。没被发现的 15 处由 Gemini 补测试（只改 `cli/tests/`）：`user edit` 保留 `settings` 里不认识的键；`inGame.fastUpdate` 是每个用户自己的值；每张表行数都不同的用户，`user show` 和删除预览的 `counts` 逐项相等；六张子表各原地改一行（行数不变）后旧码被拒、用户还在，什么都不改时旧码能删；可选开关的描述和帮助文字。补完再跑这 15 处，13 处被发现；剩下 2 处等价：确认状态去掉 `counts`（内容摘要已经覆盖各表的行），`target` 去掉 uid（状态里有 `uid`）。
    - 按决定 66 不单独送审，并入 P2 的整体审查。只动了 CLI，网页端没有变化。
70. **P2-18 的实现（2026-11-17）**：
    - Codex（GPT 5.6 Sol）写的：`song`、`chart`、`charts`、`course show`、`collection show` 和带门的 `kaleidxscope` 六个命令的谱面行都带上所选用户的成绩和 B50 名次（`cli/src/catalog/chartScore.ts` 的 `chartUserParts`），都接受 `--user`；`cli/src/users/scores.ts` 读出用户的成绩副本、按网页端的规则估算的游玩次数和普通 B50 里的位置（`selectB50Charts` 四个开关都关，宴谱不进 B50）；`cli/src/commands/userScores.ts` 负责 `meta.user`、`meta.dataAsOf.scores` 和三种成绩警告，命令出错时 `carryScoreContext` 把这些带进错误。DX 星数的算法搬到 `shared/core/chart/dxScore.ts`（`test:query` 跑它的测试），网页端的 `src/utils/deluxeScoreTier.ts` 改成从 core 再导出，行为不变。
    - 它自己定下的，我都同意：计划里这一步的标题只点了 `song`、`chart`、`charts`，但设计 4.4 说凡是输出谱面的地方都用同一个谱面行，所以六个命令一起接；一个用户都没有却写了 `--user` 时是 `NO_USER` 而不是 `NOT_FOUND`；有成绩但更新时间未知时也报 `STALE_SCORES`，文字是「成绩的更新时间未知」，设计文档跟着补了这一句；`NO_SCORES`、`PARTIAL_SCORES` 和 `STALE_SCORES` 三者只出一个；曲库的警告排在成绩警告前面。固定的 SaltMeta 夹具里只有 8 张新版本的非宴谱，B15 最多 15 张只在 core 的测试里测。
    - 测试：改动检查 CLI 65 处、core 7 处，第一次 CLI 47 处、core 7 处被发现。没被发现的 18 处由 Gemini 补测试（只改 `cli/tests/`）：`deluxeScoreMax` 为 0 或缺失、超出 `Date` 范围的变化时间和更新时间、只有一条详细成绩、记录里的游玩次数优先于估算、正好 3 天的边界、`carryScoreContext` 的合并顺序和保留的字段、出错时带上成绩警告，以及 `course show`、`collection show` 每一行的成绩和警告。补完再跑这 18 处，17 处被发现；剩下的一处是 `kaleidxscope` 把成绩传给门的详情：夹具里没有任何一个门用到的曲目，命令测试里门下面一行谱面都没有，看不出成绩有没有传进去（成绩警告那一处被发现了）。
    - 按决定 66 不单独送审，并入 P2 的整体审查。网页端只有 `deluxeScoreTier.ts` 改成再导出，`pnpm build` 通过。
71. **P3-4 的实现（2026-11-17）**：
    - 这一步在 Codex 暂停的那段时间交给了 Gemini（Gemini 3.8 Flash）。它把更新 worker 里拉取和合并成绩的逻辑搬进 `shared/core/sync/`：`sync.ts`（`chooseSyncSource`、`existingScoresForSync`、舞萌、落雪、水鱼公开 B50、水鱼用户名和 Import-Token 五种拉取），`qrCode.ts`（`normalizeQrCodeFromInput`），`type.ts`（`UpdateUserResponse` 和要注入的客户端、选项）；进度和上传通过注入的回调报告，core 里不再调提示条。`toHalfWidth` 搬到 `shared/core/util/`。worker 只剩消息收发和把网页端的客户端、提示条接到这些回调上；`src/utils/toHalfWidth.ts` 和 `updateUser.type.ts` 改成从 core 再导出。三个新测试文件进 `test:integrations`。
    - 它自己定下的，我都同意：注入的接口写成函数属性而不是方法签名（新文件要过 `ts/method-signature-style`）；水鱼公开 B50 失败时照旧得到 `undefined` 而不是 `null`；worker 的 import 按 lint 的顺序重排。worker 里原有违规的豁免计数按实际剩下的手工调低了（`eslint-suppressions.json`，只降不升），没用 `--prune-suppressions`。
    - 我核对过行为：把搬走的函数和原来的 worker 逐段做文本比较，差别只有改名和改成注入的选项。一处可以接受的边界：`qrCode` 不是字符串时，现在在 worker 的 `try` 里面抛错，worker 发回 `updateUserError`；网页端只会传字符串，所以没有实际影响。worker 把二维码打到控制台的那一行照原样保留，网页端行为不变（写进最终报告）。
    - 测试：改动检查 56 处，第一次 49 处被发现。没被发现的 7 处由 Gemini 补测试（只改两个测试文件）：链接里编码后面还有文字时的截取、`http` 和 `https` 两种链接、落雪没给成绩时不报「从落雪补充数据成功」、游戏返回的收藏品和旅行伙伴原样带出、快速更新的请求体里没有 `qrCode` 这个键（原来的测试用 `toEqual`，值为 `undefined` 的键看不出来）。补完再跑，6 处被发现；剩下的一处等价：长度正好 64 的 `SGWCMAID` 输入走到普通分支，结果相同。
    - 按决定 66 不单独送审，并入 P2 的整体审查（这一步在 P2 的审查范围之内提交）。
72. **P3-5 的实现（2026-11-17）**：
    - Codex 新建 `shared/core/integrations/lxns/oauth.ts`，放落雪 OAuth 里和存储、界面无关的一半：回调、事务和 token 的类型，15 分钟有效期、scope 和 PKCE 值的规则这几个常量，`base64UrlEncode`、`generateCodeVerifier`、`generateCodeChallenge`（随机数和 SHA-256 摘要可以注入，默认用 `globalThis.crypto` 和全局的 `btoa`），`createLXNSOAuthAuthorizeUrl`（地址取 `CoreConfig.lxnsBaseUrl`），`parseLXNSOAuthCallback` 和回调参数检查，`validateLXNSOAuthTransaction`（`now` 由调用方给），回调地址检查和 OAuth 错误检查，`exchangeLXNSOAuthCode`，`assertLXNSOAuthTokenUsable`。网页端的 `oauth.ts` 和 `oauthSession.ts` 改成调用这些；存储、回调捕获、同时到达的回调去重、失败时删哪些记录和删的顺序、恢复对话框和 `saveLXNSAuth` 都留在网页端。`oauthSession.ts` 再导出原来那几个名字，别的文件的 import 不用改。新测试进 `test:oauth`。
    - 它自己定下的，我都同意：回调检查拆成「地址」和「OAuth 错误」两个函数，网页端才能保持原来「先删记录再抛错」的顺序；`now` 是可以注入的时间戳，默认值照旧在拿到响应之后才取；网页端两个文件里原有的 `curly` 违规顺手改掉，豁免计数相应调低（只降不升）。`shared/core/README.md` 原来说 core 唯一的副作用是网络，我补了一句：读随机数和时钟不算副作用，新代码把它们做成可选参数、默认用全局的，并在注入点里列上这个模块。
    - 我核对过网页端：换码原来经过网页端的 `requestLXNSToken`，它只是把 `URLSearchParams` 转成对象再调 core、不带任何配置；现在直接调 core，参数顺序一样，请求体逐字节相同。网页端生成授权链接时不传配置，仍是原来写死的 `https://maimai.lxns.net`。网页端原有的 OAuth 测试一个没改，全部通过。
    - 测试：改动检查 48 处，第一次 42 处被发现。没被发现的 6 处都是测试的缺口，由我补了 6 个用例：有效期常量本身（原来的边界用例用的是常量，常量改了用例跟着改）、回调里的 `error_description`、回调链接取规范化以后的 `href`（大写的协议和主机）、`userUid` 和 `redirectUri` 不是字符串、换到的 `token_type` 原样保留。补完再跑全部被发现。
    - 按决定 66 不单独送审，并入 P2 的整体审查（这一步在 P2 的审查范围之内提交）。
73. **P2-16 的实现（2026-11-17）**：
    - Codex 写的：`import` 和 `export`（`cli/src/commands/backup.ts`），凭据文件（`cli/src/runtime/credentials.ts`；`files.ts` 加了先暂存、后改名的 `stageFileAtomic`）。`credentials.json` 是 `{version: 1, users: {<uid>: {divingFishImportToken?, lxnsAuthorization?}}}`，值按网页端用户里的 JSON 原样保存；没有文件等于空文件，读不了、JSON 坏了或结构不对时报错，不覆盖。导入：用 core 解码 v0/v1，token 拆进凭据文件、库里写 `null`；成绩事件按网页端的规则换上新的 generation 和 id，超出安全整数的拒绝；确认码绑定文件摘要、本地每个用户的 uid 和更新时间、事件数和 `--keep-lxns`，预览列出文件、要导入的用户、会被覆盖的用户和事件数、Import-Token 数；新的凭据文件先以 0600 写在同一目录，用户和事件在一个事务里整体替换之后才改名到位，事务失败就删掉暂存的文件，旧凭据不变。导出：从 `users.raw` 按用户顺序写 v1，放回 Import-Token，`--keep-lxns` 时也放回落雪授权；以 0600 原子写入；同名文件报 `FILE_EXISTS`，`--overwrite` 才覆盖。端到端测试给每个例子一个自己的工作目录，里面放一份种子备份给 `import` 的例子用。设计 2.1、2.4 写明了凭据文件的格式和导入导出的细节。
    - 它自己定下的，我同意：凭据的字段名；`User` 类型把 token 限定成具体类型，但这里存的是解码出来的原样 JSON（`unknown`）；设计里的 `favorites` 表还没有（P2-25），导入不碰收藏；导出写缩进的 JSON 加换行（网页端写紧凑的，两边都用 `JSON.parse` 读，互通）。
    - 我改的三处：
        - **导出目录不存在**（或路径中间有一段是文件）改报 `USAGE`（退出码 2），消息写出目录并说明不会创建目录。Codex 原来让它落到 `INTERNAL`，可那是用户给的路径，不是数据目录，`INTERNAL` 的说明是「saltnet 的缺陷或数据目录读写失败」；原来的消息还会带出临时文件名。凭据文件坏了仍是 `INTERNAL`：它在数据目录里，正合那条说明；P3-6 再看要不要单独的错误码。
        - **`--keep-lxns` 而备份里没有某个用户的落雪授权时**，这个用户照默认规则处理（uid 和落雪 id 都没变就留着 CLI 自己的授权）。原来会把 CLI 自己的授权丢掉：加了「沿用对方授权」的选项，反而丢了授权，说不通。选项和命令的说明、设计 2.4 跟着改了。
        - **能解码、但用户表存不下的备份**（比如 `settings.manuallyUpdate` 不是布尔值、`lxns` 是个数字），在预览之前就报 `INVALID_BACKUP`。原来要等确认之后在事务里失败，报的是 `INTERNAL`。事件也过一遍同样的检查，但 core 的解码器和导入时的安全整数检查已经比它严，这一半现在不会触发，只是保险。
    - 和网页端的一处差别：网页端用 `file.text()` 读文件，坏的 UTF-8 字节会被换成替换字符；CLI 严格解码，直接报 `INVALID_BACKUP`。
    - 测试：改动检查 40 处，第一次 28 处被发现；1 处等价（查凭据时的 `Object.hasOwn`：`JSON.parse` 读出的 `__proto__` 是自有属性，继承来的值里也没有凭据字段）。另外 11 处由 Gemini 补测试（新文件 `cli/tests/runtime/credentials.test.ts`，`backup.test.ts` 新增 11 个用例，都只改测试）：版本不是 1、用户条目不是对象、`null` 不算凭据、凭据文件只列有凭据的用户、预览里的 Import-Token 数、两个用户各自保留自己的落雪授权、解码器给的原因写进消息、字符串里坏的 UTF-8、事务失败时（用 SQLite 触发器让插入失败）不留暂存文件、`byteSize` 按 UTF-8 字节计、`--keep-lxns` 的回退。补完全部被发现。我的三处修正另做 6 处改动检查，5 处被发现，剩下的就是上面说的事件检查（等价）。
    - 按决定 66 不单独送审，并入 P2 的整体审查。
74. **P2-19 的实现（2026-11-17）**：
    - Codex（GPT 5.6 Sol）写的：`charts` 的成绩筛选 `--achieved` 和 `--missing`（各接一个条件：最低评级、`clear`、连击状态或同步状态；`--missing` 也留下没有成绩的谱面）、`--recent`（成绩有变化时间的谱面）、`--stats`，按成绩排序（`--sort achievements|rating|playcount|recent`）和分组（`--group-by rank|combo|sync`）。条件的解析和判断在 `cli/src/refs/status.ts`（`parseScoreCondition`、`scoreReachesCondition`），统计在新文件 `cli/src/catalog/chartStats.ts`（`countChartResultStats`）。这些都要用户：`requireUserForScores` 在拉取任何东西之前就报 `NO_USER`；不带它们的 `charts` 照旧不要用户。
    - 它自己定下的，我都同意：
        - `--missing` 现在必须带条件；设计 3.3 里跟 `--plate`、`--collection` 一起用时省略条件的写法要用到收藏品的完成判断，留给 P2-24。`--sort gain` 仍是 `USAGE`，留给 P2-23。
        - 统计里的 `sss` 含 SSS+，另给一个 `sssPlus`：网页端曲目页的 SSS 显示的就是 sss 加 sssp。`played` 要求达成率是数字；`fc`、`ap`、`fdx` 只看状态，不看有没有达成率。
        - 评级条件看存下来的 `rate`（和网页端显示的评级一致），`clear` 是达成率不低于 80。存的状态认不出来时，这张谱面进键为 null 的组，也不满足任何条件。
        - 有成绩时 `--sort default` 是网页端曲目页的顺序：玩过的在前，按达成率从高到低，相同时按游戏里的顺序；没玩过的按游戏里的顺序。`--asc` 只反转达成率和没玩过那部分的顺序；玩过的仍在前，达成率相同时的游戏顺序也不反转。
        - `--sort recent` 遇到相同的变化时间，依次比达成率、rating、定数（都是高的在前，`--asc` 不反转这一串），最后比谱面键；`--recent` 让默认排序变成 `recent`。
        - 分组时 tsv 每组写一行 `# stats`；text 输出把统计写成一行放在表格前面。
    - `AGENTS.md` 里 `charts.ts`、`chartSort.ts`、`chartGroups.ts` 和 `refs/status.ts` 这几句是我改的（brief 不让 Codex 动 `AGENTS.md`）。
    - 测试：改动检查 74 处，第一次 66 处被发现。没被发现的 8 处由 Gemini 补测试（只改 `cli/tests/commands/chartsScores.test.ts`）：普通 FC 和普通 FDX 计入统计、条件两边的空格和大小写、`--sort recent` 按变化时间而不是达成率排、相同变化时间时的比较链（升序和降序各一次）、达成率不是数字的记录（存成 null，谱面行里有成绩但不算玩过）。补完再跑，8 处全部被发现。
    - 按决定 66 不单独送审，并入 P2 的整体审查。只动了 CLI，网页端没有变化。
75. **P2-17 的实现（2026-11-17）**：
    - 夹具 `shared/core/fixtures/web-backup-v1.json` 是我生成的：数据全是编的，用 core 的 `encodeUserDataBackup` 写成网页端导出的紧凑 JSON（在快照里当作一次性的 vitest 测试跑，生成器不进仓库）。里面两个用户：第一个有 183 条详细成绩（取自固定的 SaltMeta 夹具）、假的 Import-Token 和落雪 token、3 条 rating 记录，以及网页端还不认识的字段（`data.futureData` 和用户上的 `futureRoot`），用来看往返时会不会丢；第二个只有水鱼公开 B50，没有 token。另有同一个 generation 的 4 条成绩事件，其中一条来源是 `divingFishImport`。
    - Gemini（Gemini 3.8 Flash）写的 `cli/tests/commands/backupFixture.test.ts`，只加测试：导入的预览和结果（token 拆进凭据文件、事件换上新的 generation 和 id）、导出回网页端格式（放回 Import-Token、不带落雪授权）、带 `--keep-lxns` 的往返逐字段保留原样的 JSON 和不认识的字段、第二次往返什么都不变、导入的成绩能直接给 `chart` 用（详细成绩，和只有公开 B50 时的 `PARTIAL_SCORES`）。
    - 它报告的两处和 brief 不一致，都是 brief 写错了：第一个用户显示的名字是备注「made-up 主账号」而不是游戏里的名字（`getUserDisplayName` 先取备注）；夹具里第 1 条事件的观察时间比第 2、3 条晚，库里按观察时间和序号存取，所以测试按这个顺序比较事件。网页端读历史时也按观察时间和序号排序，备份文件里事件的先后没有意义。
    - 只加了夹具和测试，CLI 和网页端都没有变化；`AGENTS.md` 的 `fixtures/` 一句补上了这份夹具。
76. **P2-20 的实现（2026-11-17）**：
    - Codex（GPT 5.6 Sol）写的：`b50`（`cli/src/commands/b50.ts`）用 core 的 `selectB50Charts` 实现网页端 B50 页的 normal、fit、ap、fc、pc、nb 六种模式，固定输出 B35、B15 两组，每组各自分页，`count` 和 rating 总和按分页前的完整一组算；谱面行加上这个模式里的名次 `rank`、计入总分的 `rating` 和 `ratingConstant`（fit、nb 模式重算用的拟合定数，其他模式是 null）；`label` 是网页端的模式名，普通模式网页端不显示名字，CLI 写 `B50`。`rating`（`cli/src/commands/rating.ts`）给出当前 rating，加 `--history` 时给出规范化的历史（从旧到新，每条带相对上一条的变化）；它不读曲库、不联网，但要打开数据库，所以错误列表里有 `DB_LOCKED`。新的警告 `NO_PLAY_COUNTS`：PC50 时详细成绩里没有一个正数的游玩次数。指南加了第 6 条：B50 和总 rating 用 `b50`，不要把 `charts` 按 rating 排序后自己截取、求和。
    - 它自己定下的，我都同意：网页端只在记录带 `lastChangedAt` 时才提供 PC50，CLI 照 brief 总是能算，没有游玩次数时报 `NO_PLAY_COUNTS`；这个警告只看详细成绩（PC50 本身也只读详细成绩），没有详细成绩时会和 `PARTIAL_SCORES` 或 `NO_SCORES` 一起出现；两个命令都要用户，先调 `requireUserForScores`；设计表里的 `b50 --image` 留给 P4-3；默认的 `--limit 50` 不用改，B35 最多 35 张、B15 最多 15 张。
    - 我改的一处：core 的 `normalizeRatingHistory` 在没有有效历史时用 `Date.now()` 补一条，Codex 为了用注入的时钟，在 `rating.ts` 里把 core 的筛选条件抄了一遍再替换时间。我改成给 `normalizeRatingHistory` 加一个可选的 `now`（默认仍是 `Date.now()`，照决定 72 定下的规矩），`rating.ts` 直接传 `ctx.io.now()`；网页端的调用一个没改，行为不变。core 原来没有这个函数的测试，我补了 `shared/core/user/ratingHistory.test.ts`（放进 `test:score-history`），`shared/core/README.md` 的注入点里加了这一条。`AGENTS.md` 补了 `b50.ts`、`rating.ts` 两句、core 的时钟和 `test:score-history` 的说明。
    - 测试：CLI 改动检查 32 处，第一次 26 处被发现。没被发现的 4 处是测试缺口，我在 `b50Rating.test.ts` 补了 4 个用例：nb 模式的 `ratingConstant`、`NO_PLAY_COUNTS` 只在 pc 模式出现、公开 B50 里的游玩次数不算、曲库的警告会带出来。补完再跑都被发现；剩下 2 处等价：`ratingConstantOf` 里的模式判断（core 只在 fit、nb 模式给谱面写拟合定数）和有限数判断（core 取不到拟合定数时用谱面定数，进得了 B50 的谱面定数都是有限数）。core 的 2 处改动检查都被发现。
    - 按决定 66 不单独送审，并入 P2 的整体审查。网页端行为不变，`pnpm build` 通过。
77. **P2-21 的实现（2026-11-17）**：
    - Codex（GPT 5.6 Sol）写的：`history`（`cli/src/commands/history.ts`）列出所选用户全部谱面或一张谱的成绩历史，从新到旧，谱面写法和 `chart` 一样（第二个可选参数是难度，标题或别名两面都有时用 `--type`）；`--since` 收 ISO 8601 或从现在倒推的正整数天、小时（`refs/time.ts` 的 `parseSinceOption`，用 `ctx.io.now()`）；`--all-changes` 也列出只有游玩次数变化的事件；分页和 `--fields` 照列表命令。每条是谱面行（成绩是用户当前存下的值）加事件 id、时间、来源、类型和变化 `changes`（`{field, before, after}`）。`cli/src/users/history.ts` 在一次一致的读取里取出事件和成绩记录的关联，先按记录 key 给每个事件找好前态，再做 `--since` 和变化类型筛选，所以窗口里的第一条仍带着窗口之前的值；`cli/src/catalog/historyView.ts` 把一条事件做成输出的一行。
    - 关联谱面：先按存下的成绩记录的 key 找它的谱面键；没有这条记录时把记录 key 当谱面键去曲库找（`<曲目 id>-<难度>`）；都找不到的不输出，按记录 key 计入 `missing`（分页前按完整的筛选结果计数，单谱查询时总是空列表）。`v_score_events` 视图没改，这个后备只在命令里做。
    - 和网页端一致的地方：默认隐藏只有游玩次数变化的 change 事件，initial 事件总是保留；变化的字段和顺序同 `getScoreHistoryDisplayChanges`（达成率、DX 分、combo、sync、游玩次数），但输出原值而不是网页端格式化好的中文：combo、sync 用游戏内写法，状态为 none 时是 null。
    - 它自己定下的，我都同意：类别是 `scores`（设计 3.2 把 `history` 列在「曲目与谱面」表里，brief 要求 `scores`）；时间和 sequence 都相同的事件按 id 升序（网页端单谱只按时间和 sequence 排）；超出 Date 范围的时间输出 null，不丢掉事件；只写 `--type` 不写谱面是 `USAGE`；相对时长不分大小写、允许首尾空白、必须大于零；用户引用解析失败时没有 `meta.user` 可带，和其他成绩命令一样在读元数据之前报 `NOT_FOUND`。指南加了第 7 条：成绩变化读 `history`，「最近进步了什么」用 `history --since 7d`。
    - brief 里我写错的一处：说端到端测试的种子里有成绩事件，其实只有两个没有成绩的用户。`history` 的指南示例照样运行，得到合法的空结果；P2-26 会把种子换成带成绩的备份。
    - 我改的：`AGENTS.md` 加了 `history.ts`、`users/history.ts` 和 `parseSinceOption` 的说明（没采纳它建议的单独介绍测试文件的那一句）。
    - 测试：改动检查 31 处，第一次 22 处被发现。我补了 6 个用例（同一记录里 sequence 和 id 相同时的先后和前态、后来的 initial 事件只带游玩次数位时仍保留且没有前值、只写 `--type`、`missing` 的顺序、超出 Date 范围的时间、`7D` 和首尾空白），补完 31 处都被发现。
    - 按决定 66 不单独送审，并入 P2 的整体审查。没有改 core 和网页端。
78. **P2-24 的实现（2026-11-17）**：
    - Codex（GPT 5.6 Sol）写的：收藏品的拥有和进度。`collection list` 每行加 `owned`（所选用户是否拥有，照网页端收藏品页面用 core 的 `isCollectionOwned`、`getOwnedCollectionIds`，角色先用 `toCharacterCollection` 转换）和 `progress`（`{completed, total}`，照 core 的 `getCollectionProgress`，只对能用成绩判断的收藏品给，其余是 null），新选项 `--owned`/`--no-owned` 和 `--user`；没有用户时仍只要落雪收藏品列表，`owned`、`progress` 都是 null。`collection show` 加 `owned`、`progress`，谱面行加 `done`，默认只列还没完成的谱面，`--all` 列全部。`charts --achieved`/`--missing` 和恰好一个 `--plate` 或 `--collection` 一起时可以不写条件，每张谱按这个收藏品自己的要求判断（`checkCollectionChartFinish`）；为此加了一种选项 `optional-string`：后面有一个不以 `-` 开头的词时才把它当值，否则值是 null，`--missing=` 这样的空值是 `USAGE`。`cli/src/users/scores.ts` 的 `collectionChartScore` 把存下的成绩转成 core 的 `ChartScore`，`collectionView.ts` 的 `collectionUserContext` 每个命令只算一次拥有和带成绩的谱面。core 一处没改。示例加了 `charts --plate 真極 --missing` 和 `collection show plate:6148 --all --limit 20`，指南加第 8 条（收藏品还差什么）。
    - 它自己定下的，我都同意：有用户时 `collection list` 总要读曲库（进度要用谱面），所以有用户、离线又没有曲库时报 `OFFLINE_NO_CACHE`，P1 时这样能成功，没有用户时不变；`isCollectionOwned` 给的不是 true 都输出 false；只有水鱼公开 B50 的用户也算进度，带 `PARTIAL_SCORES`；状态未知的成绩达不到任何 combo、sync 要求；`--achieved` 和 `--missing` 都不写条件时结果为空（一张谱不能既完成又没完成）；没有难度的条件每首歌只计一次，用一个构造的收藏品手算核对；原来的 `collection show` 测试改用 `--all`。
    - 合并：P2-24 和 P2-21 同时在做，用 `git apply --3way` 打到 P2-21 之后，指南第 7 条冲突，两条都留，这一条改成第 8 条。
    - 我改的：`AGENTS.md` 补了 `optional-string` 的读法、`charts` 不写条件时按收藏品自己的要求、`collection list` 和 `collection show` 的描述，以及 `collectionUserContext`、`collectionChartDone`、`collectionChartScore`。
    - 测试：改动检查 30 处，第一次 25 处被发现。没被发现的 3 处是测试缺口，我补了 3 个用例：`--condition=` 这样的空值是 `USAGE`、`charts --collection plate:6104` 不写条件时和 core 的计算一致、没有用户时 `collection list --user 1` 在任何请求之前报 `NO_USER`；补完都被发现。剩下 2 处等价：`owned()` 里的 `=== true`（`isCollectionOwned` 只对未知类型给 undefined，CLI 的收藏品类型都已知）和 `collectionChartScore` 里的达成率类型判断（core 的 `scoreMeetsRequirement` 本来就拒绝不是数的达成率，进度也只用 `checkCollectionChartFinish`）。
    - 按决定 66 不单独送审，并入 P2 的整体审查。没有改 core 和网页端。
79. **P2-25 的实现（2026-11-17）**：
    - 分工改了：计划里这一步是〔新〕，因为 Codex 每周的额度已经用了 86%（11-17 13:05），改给 Gemini 3.8 Flash，照一份写得很细的说明做。一次成功（2041 秒），快照里不含 `.env*`。
    - Gemini 写的：迁移 5 加 `favorites`（名称唯一、位置唯一）和 `favorite_charts`（属于一个收藏夹，删收藏夹时一起删；同一个收藏夹里一首曲目只有一条），只在本机，不进备份（`import` 不动它们，有测试）；`cli/src/favorites/repository.ts` 是这两张表唯一的写入者，删除后把位置重新排成从 0 开始的连续整数；`cli/src/refs/favorite.ts` 先按完整名称、再按只有一个收藏夹有的部分名称找。命令 `fav list`、`create`、`rename`、`delete`（共用的按内容确认）、`add`、`remove`，`charts --fav` 在下载任何东西之前就解析收藏夹，对外视图加 `v_favorites`（`VIEWS_VERSION` 升到 3），指南加一条（合并后是第 9 条），端到端测试的种子加了 `fav create 练习` 和 `fav add 练习 146-3`。
    - 和网页端一样：收藏夹按曲目那一面的 id 收藏，记下加入时选的难度；同一首曲目换个难度再加不会改变什么（`added` 是 false）；`remove` 按曲目删；`charts --fav` 列出这些曲目的全部谱面，难度照 CLI 的规则由 `--diff` 选。
    - 它自己定下的，我都同意：`fav delete` 成功后的 `data` 加 `remainingFavorites`（对应 `user remove` 的 `remainingUsers`）；确认码绑定名称和每一条的曲目与难度；以 `-` 开头的名称在 `error.fix` 里写在 `--` 之后；改回自己现在的名称算成功。
    - 合并：用 `git apply --3way` 打到 P2-24 之后，指南的第 7 条冲突，它的这条改成第 9 条；`charts` 的描述冲突，留 P2-24 的写法再加上 `--fav`。
    - 我改的：`fav add` 和 `fav remove` 原来先读曲库再找收藏夹，我改成先找收藏夹（和 `charts --fav` 一样），收藏夹名字写错时不发任何请求就报 `NOT_FOUND`，补了测试。`AGENTS.md` 补了迁移 5、`--fav`、`fav` 命令和两个模块、`v_favorites` 和端到端测试的种子。
    - 测试：改动检查 28 处，第一次 18 处被发现。没被发现的 7 处是测试缺口，我补了 3 个用例：一个视图用例（两个收藏夹，曲目 id 不按大小加入，删掉一条之后位置仍连续、顺序仍是加入顺序、条目位置和收藏夹位置分开）、确认码绑定每一条的难度（同一首曲目换难度重新加入，条数和曲目 id 都不变，旧的确认码仍被拒绝；顺带核对 `fav list` 的条数）、名称以 `-` 开头的收藏夹能用 `--` 建出来，`error.fix` 能删掉它。补完都被发现。剩下 3 处等价：重排位置前先把位置整体加大的两句（按原来的顺序从小到大重排时，每条只会挪到空着的或它自己的位置，不会撞上，这两句是多余的保护），和名称不能全是空白的 CHECK（仓库和命令都先拒绝了，别的代码不写这张表）。
    - 按决定 66 不单独送审，并入 P2 的整体审查。没有改 core 和网页端。
80. **P2-22 的实现（2026-11-17）**：
    - 分工改了：计划里这一步是〔新〕，因为 Codex 每周的额度已经用了 86%（11-17 13:05），要留给 P2 的整体审查，改给 Gemini 3.8 Flash，照一份写得很细的说明做。一次成功（1891 秒），快照里不含 `.env*`。
    - Gemini 写的：`chart` 总带 `stages`，是谱面弹窗默认「简洁」模式的阶段表（每项 `{achievements, rating, rank}`；宴谱是 `[]`；没有用户时是没有成绩的表）。`--with` 加了 `stages`（弹窗的「完整」表，界面上叫「全部」）、`friends`（弹窗的好友排名）、`history`（这张谱的成绩历史，从新到旧，隐藏只改游玩次数的记录）、`position`（同等级里的项目位置和游玩次数；`total` 照 core 比谱面数多一，schema 里写明）和 `all`。`history <谱面>` 和 `chart --with history` 共用 `cli/src/users/history.ts` 的 `readChartScoreHistoryEntries`，没有复制；历史变化字段的 schema 挪到 `schemas.ts` 给两处用。新命令 `calc` 是弹窗里的计算器：`--achievements` 算 rating 和评级，`--rating` 用二分查找达到它的最低达成率（步长 0.0001，101 也达不到时全是 null），两个都不给时输出完整阶段表；第一个参数是 1.0–15.0、最多一位小数的定数时不读曲库也不读用户，可以离线运行，否则照 `chart` 的规则解析谱面，带 `--user`。指南加一条（合并后是第 10 条）。
    - 和网页端不同的两处，都是说明里定的：弹窗的 `getLowestRaInSection` 遇到空的 B50 分区会去读不存在的最后一项而出错，CLI 在调用 core 之前自己判断，分区为空或不存在时当作没有最低 rating（core 没改）；好友排名里只有水鱼公开 B50 的用户，弹窗只读详细记录，所以显示未游玩，CLI 用谱面行的成绩（决定 70），这张谱在他的 B50 里时就有成绩和名次。
    - 它自己定下的，我都同意：没有难度也没有 `--type` 时，1–15 之间最多一位小数的数读作定数，大于 15 的整数读作曲目 id；带小数却超出范围的数和不大于 0 的数报 `USAGE`；有难度或 `--type` 时一律读作谱面引用。`calc` 的 `data` 是 `{constant, chart, target, achievements, rating, rank, stages}`。
    - 合并：用 `git apply --3way` 打到 P2-25 之后，只有指南冲突，它的这条改成第 10 条，并写明用 `chart <谱面> --with stages`。
    - 我改的：`--achievements` 的 0–101 和 `--rating` 不小于 0 原来是命令里手写检查，我改成在注册表里声明 `min`、`max`（`schema calc` 能看到上下限，越界由解析器统一报 `USAGE`），删掉了手写检查。`AGENTS.md` 补了 `chart` 的阶段表和新的 `--with` 值、`calc.ts`、`readChartScoreHistoryEntries`。
    - 测试：改动检查 37 处，第一次 22 处被发现。没被发现的 15 处里，2 处检查的是 `--achievements` 的手写范围检查，那段代码已删掉（改成注册表的 `min`、`max`），我另加了 3 处检查注册表里的上下限；其余都是测试缺口，我补了 7 个用例：`--rating` 的反算按手算核对（定数 13.0：252 要 97.0000，253 要 97.3077，292 只有 100.5 能到，293 达不到，0 在 0 处就达到）；`--achievements` 的两端 101 和 0 可以用，101.0001 和 -0.5 不行；超出范围的数（15.5、0.9、0）报定数范围的错误，而不是被当成谱面；有 `--type` 时数字按谱面引用解析；谱面所在的 B50 分区为空、另一个分区有成绩时不出错；好友排名里玩过的在前，没玩过的和没有达成率的记录按用户顺序排在后面；存着旧定数留下的 rating（比现在的定数能给的都高）时，简洁表照弹窗按这张谱自己的 rating 判断要不要多列一项。另外在估算游玩次数的用例里加了 `--with position`。补完之后，还适用的 38 处全部被发现。
    - 按决定 66 不单独送审，并入 P2 的整体审查。没有改 core 和网页端。
81. **P2-23 的实现（2026-11-17）**：
    - 分工改了：计划里这一步是〔新〕，同样因为 Codex 每周的额度要留给 P2 的整体审查，改给 Gemini 3.8 Flash，照一份写得很细的说明做。一次成功（2264 秒），快照里不含 `.env*`。
    - Gemini 写的：core 的 `shared/core/query/b50.ts` 加了一个纯函数 `getB50Gain(b50, chart, targetRating)`：按 `music.info.isNew` 选新曲（最多 15 张）或旧曲（最多 35 张）部分，这张谱在部分里时是 `max(0, 目标 − 它的 rating)`，不在而部分没满时是目标 rating 本身，部分满了时是 `max(0, 目标 − 部分里最低的 rating)`；宴谱和新旧属性未知时是 `null`。它的测试 `b50Gain.test.ts` 加进了 `test:query`。`cli/src/users/scores.ts` 把每个命令只选一次的普通 B50 留在 `UserScores.b50` 里，`chart` 和 `calc` 的每个阶段、`calc` 给了谱面和 `--achievements` 或 `--rating` 时的顶层 `gain`、`charts --sort gain` 都按它算，所以这几个命令和 `b50` 不会对不上。`charts --sort gain` 按打到 `--target`（评级或 0 到 101 的达成率，默认 sss+，阈值取自 core）能涨的分从大到小排（`--asc` 反过来），`gain` 是 null 的谱排在最后，相同的按谱面键区分；只有按 gain 排时每行才带 `gain`；本地没有用户时在任何请求之前报 `NO_USER`；`--target` 不和 `--sort gain` 一起写或者写错时报 `USAGE`。指南加了第 11 条「该推哪首」。
    - 和网页端不同的一处，是说明里定的：谱面弹窗显示的涨分是 `阶段 rating − max(这张谱现在的 rating, 所在部分最低的 rating)`，部分满了时没错，没满时偏小（不在 B50 里的谱放进没满的部分，加的是它全部的 rating）。CLI 按 B50 实际的选法算，写进了 core 函数的说明；弹窗没改。
    - 合并：用 `git apply --3way` 打到 P2-22 之后，没有冲突；只是我在 P2-22 里后加的一个测试（谱面自己存的 rating 比部分最低高时的阶段表）缺新的 `gain`，我补上了（这张谱在部分里，rating 300 高于每个阶段，所以每个阶段都是 0）。
    - 我改的：`AGENTS.md` 补了 `getB50Gain`、阶段和 `calc` 的 `gain`、`--sort gain` 和 `--target`、`UserScores` 留下的 B50，以及 `test:query` 里的新测试。
    - 测试：改动检查 35 处（core 15 处、CLI 20 处），第一次（补上那个测试的 `gain` 之后）core 11 处、CLI 12 处被发现。没被发现的里，1 处是等价的（`charts` 对没有定数的谱直接给 null：没有定数的只有宴谱，core 对宴谱本来就返回 null，测试数据和今天的真实曲库都是这样）；其余都是测试缺口。core 我补了 3 个用例：差一张才满的部分仍按没满算，同一首歌的别的难度不算这张谱，部分里最低的 rating 不在两头时也取最低。CLI 的排序测试用的用户每条记录的 rating 都在 10 万上下，两个部分都满，所有 gain 都是 0，排序、目标档和 `--asc` 等于没测：我把这几个测试换成 9 条按公式算 rating 的记录（两个部分都没满），检查 gain 不止一种值，加了大写的 `SSS`、只有按 gain 排时行里才有 `gain`，以及手算的 `calc`：定数 13.0 上 `--rating 230` 找到 97.0000、rating 252、gain 252（不是 230），已经有 252 时打到 100.5 涨 40。之后除了等价的那处，改动检查全部被发现。
    - 按决定 66 不单独送审，并入 P2 的整体审查。core 只加了这个函数和它的测试，网页端没改。
82. **P2-26 的实现（2026-11-17）**：
    - Gemini 写的（〔简单〕，分工没变）：端到端测试的种子不再用两条 `user add`，改成导入 `shared/core/fixtures/web-backup-v1.json`（先得到退出码 6，再照 `error.fix` 确认），其余照旧（收藏夹、给导入示例用的导出备份）。新的检查都拿 core 函数对这份备份算出的结果比：`user list`、两个用户的 `rating`、`rating --history`、两个用户的 `b50`（两个部分的谱面和 rating 总和）、`history`、`charts --achieved sss`、`chart 131-4`（成绩和阶段的 gain）、`calc 131-4 --achievements 100.5`、`charts --sort gain`、`collection show plate:6148 --all`、`charts --fav 练习`。
    - Gemini 指出 brief 里的一处错：我让带 `--fields` 的输出也对命令公开的 schema 校验，但 schema 描述的是完整的行，投影后的行少了必填字段。种子有了成绩以后，指南示例里带 `--fields` 的 JSON 输出（`b50`、`history --since 7d`）也因此不再符合。
    - 我改的：
        - `charts --achieved sss` 去掉 `--fields`，加 `--limit 1000`（默认只给 50 条，对不上 175 条的预期）。
        - 指南示例带 `--fields` 的 JSON 输出：同一条命令去掉 `--fields` 再跑一遍，它要符合 schema；投影后每一行只有所要的字段，值和完整的行一样，行以外的部分（rating 总和、分组的键、分页）不变。`history --since 7d` 在夹具的事件超过 7 天以后没有行，所以只要求所有带 `--fields` 的示例合起来有行。
        - Gemini 以为 131-4 的第二条事件只改了游玩次数（预期默认的 `history` 少一条）。它的 `changedMask` 是 1，是达成率那一位，只改游玩次数的那一位是 16，所以默认列表和 `--all-changes` 一样。改成断言两者相同，注明隐藏由 `tests/commands/history.test.ts` 覆盖。
        - 增益和收藏品的检查原来等于没测（见下）：在种子的一份拷贝里加一个没有成绩的用户，它的 B50 是空的，每张谱在每个阶段都涨整个 rating，于是查 `chart 131-4` 的每个阶段 gain 等于 rating、`calc` 的 gain 等于 rating、`charts --sort gain` 前 10 的 gain 等于全曲库按 SSS+ 算出的最高 10 个。收藏品改成：覇者（要求 A）恰好在用户 0 有记录的谱上完成，真神（要求 AP，用户 0 的记录全是 FC）一张都没完成。
        - `AGENTS.md` 改了 `e2e/` 那句。
    - 测试：对端到端测试做改动检查 8 处。第一次只发现 3 处（`b50` 的 B15 总和、`rating` 的变化量、导入丢一条事件）；阶段和 `calc` 的 gain 恒为 0、`--sort gain` 的默认目标换成 SSS、收藏品恒为完成都没被发现：夹具里每条记录的 rating 都在 10 万上下，用户 0 的两个部分都满，用户 1 只有公开 B50，新谱全在它的 B15 里，所以所有 gain 都是 0；用户 0 的记录全是 SSS、FC、FS，覇者每张都完成。按上面改了以后，加上收藏品恒为未完成，8 处全部被发现。
    - 按决定 66 不单独送审，并入 P2 的整体审查。
83. **P2-27 的实现（2026-11-17）**：
    - 我做的（〔协调〕，分工没变）：
        - `AGENTS.md` 里 `cli/` 那一大段拆成分条（决定 50 留下的）：按目录分层，`src/commands/` 每个命令一条，`src/output/`、`src/runtime/`、`src/store/`、`src/catalog/`、`src/refs/`、`src/users/`、`src/favorites/`、`tests/`、`e2e/` 各一组，只写原来那段里已有的内容。分条用一个小脚本按 100 列折行，再比较新旧两段的词和代码片段：旧段独有的只剩改成相对路径的文件名（例如 `tests/` 下的 `caught.ts`）和改写掉的几个词（「User management lives in」之类）；新段多出的代码片段只有 `parseTargetRate`（`charts --sort gain` 解析目标的函数，P2-23 加的，原段没提）。Prettier 通过。
        - 对照网页端（脚本和数据都不进仓库）。用一份编的网页端 v1 备份：两个用户，没有账号字段和 token；用户 0 有 2679 条详细成绩（真实公开 SaltMeta 的 5702 张谱里约一半，达成率由谱面键的哈希决定，rating 按 core 的系数表算，22 处故意并列），用户 1 只有水鱼公开 B50。CLI 一侧用 HEAD（`54eab5f`）的打包产物导入这份备份，离线跑 `b50`（两个用户各六种模式）、`rating --history` 和 `collection list --kind plate`。网页一侧是生产构建（之后网页端的代码没有改动），照用户的要求由 Gemini 写无头 Chrome 脚本（DevTools 协议，两次运行：先读各页，再加上逐个打开姓名框的详情），我来运行：在设置页导入同一份备份，SaltMeta 和落雪收藏品列表两个请求用 CLI 缓存里的同一份数据应答，其余离开本机的请求（统计脚本、字体、封面和收藏品图片）一律拦下，然后读用户页、两个用户各六种模式的 B50 页、rating 历史页和姓名框列表。
        - 结果：
            - B50：用户 0 的六种模式逐张一致（顺序、曲名、SD/DX、难度、达成率、rating、评级、定数），各部分的 rating 总和和总数也一致（普通 16187 = 11443 + 4744，拟合 16153，AP 15929，FC 16187，PC 12068，NB 15255）。用户 1 普通模式逐张一致（16092）；其余五种模式网页端显示「未更新成绩或成绩更新失败」，CLI 给空的两部分并报 `PARTIAL_SCORES`。
            - rating：用户页两张卡片的 rating 和 CLI 一致；历史的数值和时间一致，网页端新的在前、没有变化量一列，CLI 旧的在前、带变化量。
            - 姓名框：400 个，名称、拥有状态和顺序一致。网页端的进度只在点开后的详情里显示，脚本逐个点开再关上：105 个有成绩进度，和 CLI 逐个一致（完成数有 58 种、总数有 19 种，104 个不是 0，8 个已经完成，例如覇者 1029 / 2123、舞舞舞 323 / 2123、USM二人三脚 1 / 1）；其余 295 个没有获取条件，两边都没有进度。
        - 和网页端的差别，都是已定的：只有水鱼公开 B50 的用户，网页端的进度只读详细成绩（`data.detailed`），所以全是 0；CLI 照决定 78 把公开 B50 的成绩算进去，带 `PARTIAL_SCORES`（用户 1 有 56 个姓名框不是 0，例如覇者 11 / 2123）。网页端只对第一个用户（`users[0]`）显示进度，所以这一项只对照了用户 0。网页端只在记录带 `lastChangedAt` 时提供 PC50（决定 76），这份备份的记录都带，所以 PC50 也对上了。
    - 测试：只改文档，按 finish.sh 跑全部检查。
    - 按决定 66 不单独送审；P2 整体审查从 `91c0892` 起。
84. **P3-6 的实现（2026-11-17）**：
    - 分工改了：这一步是〔新〕，原定 Codex 写。当时 Codex 这一周的额度已经用了 89%，要到 11-19 00:14 才重置，剩下的要留给 P2 的整体审查和审查后的修复，所以照一份写细了的 brief 交给 Gemini。P3-7 也一样。
    - Gemini 写的：
        - `credentials.json` 多了 `pendingLxnsAuthorizations`：按 state 存 core 的 `LXNSOAuthTransaction`。读文件时，顶层只认 `version`、`users`、`pendingLxnsAuthorizations` 三项，每个用户项和每条进行中的授权都得是对象。文件坏了仍报 `INTERNAL`：消息里只有路径和错误码，不带文件内容；`fix` 让人检查文件，修不好就移走它再重新绑定（决定 73 留下的问题，不另设错误码）。
        - `withCredentialsLock` 拿名为 `credentials` 的锁（30 秒），拿不到每 100 毫秒再试，5 秒后报 `DB_LOCKED` 并写出对方的 pid；`work` 抛错也会释放锁。`updateCredentials` 在锁里重读文件、交给调用方改、清理，再以 0600 原子写入。清理的四条：数据库里没有的用户、两项凭据都没有的用户项、过期或格式不对的进行中授权（`validateLXNSOAuthTransaction`）、指向不存在用户的进行中授权。
        - `ctx.http()`：发请求之前先检查每个请求头的值，含 NUL、CR、LF 或大于 U+00FF 的字符就报 `INTERNAL`。消息只说是哪个请求头，不写它的值，请求也不发出（决定 64 留下的 Node 把整个值写进错误的问题）。错误信息里出现的请求头的值（4 个字符以上；`Bearer ` 后面的部分另算一个）换成 `<已隐藏>`；换过的，或者 cause 链里出现过这些值的，不带 cause。
        - 重试：`retry: true` 时，连接失败、超时、读响应中断，以及 429、500、502、503、504，都重试一次。重试前先等 `retryDelayMs`（默认 500 毫秒）。每一次都有自己的截止时间，响应体在这一次里读完。`refresh` 和没有旧数据可退的曲库下载用 `retry: true`；有旧数据可退的（`metadata.timeoutMs`）不重试，好尽快退回旧数据。
        - `import` 和 `user remove` 在凭据锁里做。`user remove` 连预览和确认码也在锁里算，这样别的进程拿着锁时，它直接报 `DB_LOCKED`，不会给出一个确认不了的预览。删除时去掉这个用户的凭据和指向它的进行中授权。导入会丢掉所有进行中授权。
    - 我改的：响应体不是合法 JSON 时，不再带 cause。Node 的解析错误会引用响应体的开头，可能带着被截断的请求头的值（服务器原样回显请求时），而截断的值查不出来，原来的写法会留下它。这个 cause 也说不出消息之外的东西。
    - 测试：变异 49 处（请求头的四种字符、检查整个关掉、脱敏、`Bearer`、短值、四处 cause、重试的每个状态码、404 不重试、第二次不再重试、三处等待、默认延迟、日志、三处接线、有旧数据时不重试、文件的四项结构检查、锁的释放、锁名和等待、清理的四条、两处 0600、锁里重读、文件不存在等于空、`user remove` 的两项清理、它的锁和暂存文件的丢弃、`import` 的锁）。第一次漏了 9 处，其中两处是 JSON 解析错误的 cause，随上面的改动去掉了。另外 7 处补了测试：超时错误里有请求头的值时不带 cause、连接失败也要等、默认等 500 毫秒、状态码重试的日志、没有旧数据时的曲库下载重试、锁里重读文件、数据库删除失败时丢掉暂存的凭据文件（用触发器让删除失败）。补完重跑，7 处全部被发现。
    - 按决定 66 不单独送审，并入 P3 的整体审查。
85. **P3-8a 的实现（2026-11-17）**：
    - 这一步是新加的。P3-8 的 CLI 同步要和网页端一样把同步结果写进用户、生成成绩历史事件，这两段原来在网页端：`updateUser.ts` 收到 worker 结果后的处理，和 `scoreHistory/repository.ts` 的 `appendScoreHistoryBatch` 里的循环。按「每期先把要用的模块抽到 `shared/core/`」，先搬进 core，标〔简单〕，交给 Gemini。这次提交也在计划里加了 P3-7b：P3-7 的 brief 把 `import` 和 `user remove` 接上同步锁的部分拆了出去，因为 P2 审查的修复同时在改这两个命令；P3-7 提交时的决定再细说。
    - Gemini 搬的：
        - `shared/core/sync/apply.ts` 的 `applySyncUpdate(user, update, now)`：从结果里取出 `lxns`、`scoreHistorySource`、`userId`，用旧成绩（`detailed` 和 B50）和新成绩算成绩历史候选；`observedAt` 取结果的 `updateTime`，不是数字就用 `now()`；追加 rating 历史；合并 `user.data`（`userId` 不是 `undefined` 才写，`null` 也写）；合并 `lxns`；`userId` 为真时写 `inGame.id`，`inGame.id` 是 8 位数时写 `inGame.name`。返回 `observedAt`、候选和来源。和网页端原来的代码比，只把 `Date.now` 换成了可注入的 `now`，顺序和条件都没变。
        - `shared/core/user/scoreHistory/batch.ts` 的 `buildScoreHistoryBatchEvents(batch, generationId, existingChartKeys)`：原来边建边 `store.put`，现在先建成数组，网页端照原来的顺序逐条 `put`。事件改在打开 IndexedDB 事务之前建好；建事件是同步的纯计算，不影响事务。
        - 网页端的 `updateUser.ts` 和 `repository.ts` 改成调用这两个函数。两个新测试文件分别加进 `test:integrations` 和 `test:score-history`。
    - lint：搬走的代码在两个网页端文件里有冻结的违规，搬走后 ESLint 报「有不再出现的抑制项」。照决定 71 的做法手工把计数调到实际剩下的数（只降不升），没用 `--prune-suppressions`：`repository.ts` 的 `style/operator-linebreak` 3→1；`updateUser.ts` 的 `antfu/curly` 3→2、`antfu/if-newline` 7→5、`import/consistent-type-specifier-style` 2→1、`style/member-delimiter-style` 5→1，`style/indent`（3）和 `style/operator-linebreak`（3）清零删去。
    - 测试：变异 35 处（`observedAt` 的两处来源、只取 `detailed` 或只取 B50、丢掉 B50 的 SD 或 DX 一半、rating 历史的有无和时间、`userId` 为 `null` 和缺省、`user.data` 的合并和顺序、`lxns` 的合并和顺序、写 `inGame.id` 的条件、8 位数、名字、来源、旧成绩的两部分；事件那边：基线的三个条件、基线的时间、两种 sequence、基线自己的 sequence、mask、id、kind、state、时间、漏推基线、新事件的 state 和 id；网页端传入的已有谱面键）。第一次漏了 2 处：只在 B50 的 SD 一半里出现的谱面，和网页端同一谱面第二批不该再补基线。各补了一个测试（core 的 `apply.test.ts` 一个，网页端的 `index.test.ts` 一个；后者写成单行调用，免得给这个文件添新的 lint 违规），补完重跑都被发现。
    - 按决定 66 不单独送审，并入 P3 的整体审查。
86. **P3-7 的实现（2026-11-17）**：
    - 分工：这一步是〔新〕，原定 Codex 写，和 P3-6 一样照写细了的 brief 交给 Gemini（原因见决定 84）。
    - 拆分：P3-7 原来也要让 `import` 和 `user remove` 用上同步锁，可 P2 审查的修复同时在改这两个命令。为了能并行，这一步只做日志、锁和视图，接线拆成 P3-7b：`import` 在写事务里先 `assertNoSync(store, null, now)`，成功后用 `recordRun` 记一条 `import`；`user remove` 在事务里检查这个用户的锁；两个命令在预览之前也先查一次，免得让人确认一个随后会被拒绝的操作。
    - Gemini 写的：
        - 迁移 6：`sync_runs` 表，每列的含义写在迁移的注释里。没有指向 `users` 的外键：日志比用户留得久，也不进备份。`AUTOINCREMENT` 会让 SQLite 多出一张 `sqlite_sequence`，迁移测试的表清单跟着改了。
        - `cli/src/sync/journal.ts` 是唯一写 `sync_runs` 的地方：`beginRun` 写一条 `running`；`sync`、`upload`、`account` 必须拿着这个用户的同步锁，开始前续约一次。`finishRun` 在事务里把它改成 `ok` 或 `failed`，只能结束还在 `running` 的。`recordRun` 一步写完，给 `import` 用。`readRuns` 按 id 倒序，可按用户、种类、开始时间筛选，分页带总数。摘要写入前先检查：任何一层的键名含 token、authorization、verifier、secret、password、cookie、qr（不分大小写）就报 `INTERNAL`，消息只写键名不写值；只收普通的 JSON 对象，undefined、函数、NaN、类实例和循环引用都拒绝。
        - `cli/src/sync/lock.ts`：`withSyncLock` 的锁名是 `sync:<uid>`，3 分钟过期，每 60 秒续约一次，计时器 `unref`。拿到锁先把这个用户还在 `running` 的记录标成 `interrupted`；拿不到就报 `SYNC_IN_PROGRESS`，消息写出对方的 pid 和开始时间，`extra.holder` 里有 pid 和两个时间。`handle.assertHeld()` 在最后写入前确认锁还在。`assertNoSync` 在写事务里检查有没有还活着的同步锁，按锁名精确比较，不用 `LIKE`。
        - 视图 `v_sync_runs`，视图版本升到 4。
    - 我改的：
        - `SyncRunKind` 原来写成 `"sync" | "upload" | "account" | "import" | string`，等于只是 `string`，去掉了 `| string`。
        - `beginRun` 原来有两种写法（锁作第三个参数，或放进选项里），靠运行时判断对象的形状来区分。改成只有一种：`beginRun(store, start, lock, options)`。
        - `recordRun` 原来只在给了锁的时候才检查锁，所以不拿锁也能一步写进一条 `sync` 记录。现在 `sync`、`upload`、`account` 一律拒绝，它们要先 `beginRun` 再 `finishRun`；加了测试。原来这样写记录的两个测试，改成先拿锁。
        - `assertNoSync` 报错时的用户名，原来自己用 SQL 的 `coalesce(remark, data_name, …)` 取，和别的命令显示的名字不一定一样。改成和 `user list` 一样用 core 的 `getUserDisplayName`，用户不在了就写 uid。
    - 测试：变异 45 处，第一轮杀掉 36 处。存活的 9 处都补了测试：默认 3 分钟的租期和每 60 秒一次的续约；检查所有用户时也不算过期的锁；锁名按整个名字比较（uid 里的 `_`、`%` 不当通配符，大小写有别，`metadata` 和 `SYNC:` 开头的锁不算同步锁）；两种检查报错里的用户名都和 `user list` 一样，用户不在了写 uid；循环引用的摘要报 `INTERNAL`，同一个对象出现两次不算循环；`import` 带着锁开始会被拒绝；不写版本时记下的是这个 CLI 的版本。重跑这 9 处全部杀掉。
    - 按决定 66 不单独送审，并入 P3 的整体审查。
87. **P2 整体审查的修复（2026-11-17）**：P2 的整体审查（Codex GPT 6.1 Sol，`REVIEW_BASE=91c0892`）提了 11 条，我逐条核实都成立，写成一份修复 brief 交给 Codex（GPT 5.6 Sol）一次改完：
    - `import` 的确认码原来只绑定备份内容和选项。现在还绑定按顺序的每个被替换用户的完整指纹（备注、成绩、成绩事件、默认用户的位置），以及导入后会留下哪些凭据（只记有没有、来自哪里，不记值）。core 解码 v0 备份时给用户随机 uid，两次一样的预览会得到不同的确认码，所以 CLI 改用备份的 SHA-256 前缀加用户位置生成稳定的 uid。
    - `export` 在一个 `Store.read` 里读用户和成绩事件，两次读取之间不再可能夹着别的写入。
    - `users.raw` 原样保存的网页数据里，core 查不到的异常成绩会让成绩命令崩溃。`rows.ts` 的 `userForCoreScores` 先滤掉它们再交给 core；`users.raw` 和导入导出不变。
    - `rating` 只在当前 rating 是安全整数时输出它，否则为 null；历史里不是对象或 rating 不是安全整数的条目先去掉，再算变化，输出因此总符合 schema。
    - P3-3 之后网页端的 SaltNet 包装器抛出 core 的 `SaltNetError`，网页端原来抛普通 `Error`。包装器把它转回同样消息的普通 `Error`，网页行为不变。
    - 落雪授权没有绑定落雪账号：凭据文件改名失败后重试导入，旧账号的授权可能挂到换了落雪账号的用户上。现在每个授权都记下存入时的落雪 id（`lxnsAccountId`），导入、导出和每次 `updateCredentials` 只保留 id 一致的授权。Codex 在三处各写了一遍这个判断，我把它收成 `credentials.ts` 的 `lxnsAccountIdOf` 和 `matchingLxnsAuthorization`，后面的同步、刷新和绑定都用它。
    - 三个放得过错误实现的测试改写了：KALEIDXSCOPE 的成绩用真实的门票曲目和两个成绩不同的用户；收藏品进度按曲目计数（一首歌三个难度）；备份里的未知字段用独立读取的原始 JSON 检查。
    - `collection list` 补上 `NOT_FOUND`、`AMBIGUOUS_REF`；注册表测试要求所有带 `--user` 的命令都列出三种解析错误。
    - 确认命令的路径以 `-` 开头时，`fix` 原来不能直接运行：现在选项在前，路径前加 `--`，测试直接执行打印出的 `fix`。
    - Codex 说明了它在每处修复上临时恢复错误实现、确认测试会失败。AGENTS.md 按它的建议补了这些行为。
    - 测试：我对这些修复做了 17 个变异（16 个 CLI，1 个网页包装器），杀掉 15 个。活下来的两个都等价：导入时暂存凭据里的 `lxnsAccountId` 之后不会被读取，`applyCredentialPolicy` 会从导入的用户重新算出它（保留这次写入，是为了遵守「写授权就同时写账号 id」的约定）；确认状态里的 `lxnsAuthorization` 总等于 `lxnsAuthorizationSource` 不为 null。
88. **P3-12 的实现（2026-11-18）**：
    - 分工：这一步是〔新〕，原定 Codex 写。Codex 本周额度用完（到 11-19 才恢复），照写细了的 brief 交给 Gemini。
    - Gemini 写的：`cli/src/commands/bind.ts` 的 `user bind` 和 `user unbind`。
        - `ingame` 用 `--id <8 位数字>`，或 `--qr -`：从 stdin 读二维码，经 SaltNet 后端 GetQRInfo 换出 UserID，不重试，主地址失败才问备用地址。
        - `df-token -` 从 stdin 读 Import-Token，先用它拉一次水鱼成绩校验，只写进 `credentials.json`；数据库里的水鱼用户名清空，和网页端保存时一样。
        - `df-name <名字>` 设水鱼用户名，已有 token 时拒绝（网页端这时名字输入框不能编辑）。`lxns` 留给 P3-13。
        - 会改变用户身份（`hasStrongIdentityChanged`）的绑定，在 P3-15 加上确认之前一律拒绝。
        - `user unbind` 只改本地，不联网。写入都拿凭据锁，凭据有变化时先暂存 `credentials.json` 再开数据库事务。
        - 测试用的 `commandRun.ts` 加了 stdin。
    - 我改的：
        - 绑定游戏账号原来顺手打开了「快速更新」。网页端绑定只改 id，「启用」和「快速更新」是两个开关，默认都关。CLI 没有「启用」开关，所以绑定时打开「启用」，「快速更新」保持原样（设计 5.1）。
        - 水鱼返回 500 原来也报成「token 被拒绝」（`USAGE`）。现在只有 400、401、403 是 `USAGE`；别的状态是 `UPSTREAM_ERROR`，5xx 和 429 标 `retryable`。`ctx.http` 已经对 500 重试过一次。
        - 用户原来在联网之后才解析，写错用户也会先用掉一个二维码或发一次请求；锁里「请求期间用户被删除」的 `NOT_FOUND` 也因此测不到。改成先解析用户，再读 stdin、联网，写入前在锁里按 uid 重读一次。
        - 二维码原来又截了一次后 64 位，`normalizeQrCodeFromInput` 已经截过，去掉了。
        - 绑定 token 时的身份检查永远不会成立（token 绑定不改两个 id，只清名字），去掉了。`df-name` 在锁外的 token 预检查和锁里的重复，只留锁里的。
        - `unbind df-token` 原来也写数据库。token 只在 `credentials.json` 里（存储的用户从不带 token，`repository.ts` 会拒绝），改成只改凭据，什么都没绑定时不写文件。
        - `unbind ingame` 原来只看 id：id 已空但「启用」还开着时，说没有变化。现在 id、名字、「启用」任一不是初始值都算绑定，解绑把三者复原，「快速更新」不动。
        - 指南示例原来给默认用户绑 12345678。种子数据里默认用户已绑游戏账号 10000001，这会改变身份而被拒绝，端到端测试因此失败；改成第二个用户。`df-name` 的示例在种子数据上也会被拒绝（默认用户有 token；第二个用户没有游戏和落雪 id，改水鱼名就算改变身份），先去掉，P3-15 加上确认后再补。
    - 测试：变异 37 处，第一轮杀掉 28 处。存活的 9 处里：
        - 两处的代码已按上面去掉（二次截取、token 绑定的身份检查）。
        - 用户被删的 `NOT_FOUND`，改成先解析用户之后，由原有测试杀掉。
        - 其余 6 处补了测试：二维码查询不重试（主地址只问一次）；UserID 为 0 报 `UPSTREAM_ERROR`；token 写在命令行上时，即使 stdin 有可用的 token、服务器也能应答，仍报 `USAGE`，不发请求，不回显；什么都没绑定时 `unbind df-token` 不创建凭据文件；只剩「启用」时 `unbind ingame` 也算有变化；授权只留在 `credentials.json` 时 `unbind lxns` 也会清掉。
        - 重跑这 7 处，全部杀掉。
    - 留给后面的：P3-14 之后 `unbind lxns` 还要删签发时间；P3-7b 给绑定和解绑的写事务加 `assertNoSync`。
    - 按决定 66 不单独送审，并入 P3 的整体审查。
89. **P3-8 的实现（2026-11-18）**：
    - 分工：这一步是〔新〕，原定 Codex 写。Codex 本周额度用完，照写细了的 brief 交给 Gemini。第一轮到 40 分钟超时被停，留下没写完的改动；我把它作为快照的起点，让 Gemini 接着写完（p3-8b），两轮合起来是这次的改动。
    - 我的 brief 自相矛盾：一处不许改 `cli/src/output/warning.ts`，另一处要新加警告 `PUBLIC_B50_ONLY`。第二轮的 brief 写明可以加这一条。
    - Gemini 写的：`saltnet sync`（`cli/src/commands/sync.ts`）和 `cli/src/sync/` 下的 `types.ts`、`sources.ts`、`clients.ts`、`changes.ts`、`execute.ts`。
        - 来源按设计 5.1 选：水鱼 Import-Token；水鱼用户名，后端查不到时退回公开 B50 并警告 `PUBLIC_B50_ONLY`；落雪，授权必须属于这个用户的落雪账号。游戏来源和上传留给 P3-9、P3-10。
        - 在同步锁里记一条 `sync_runs`，拉成绩，在一个事务里写用户、成绩、B50、Rating 历史和成绩历史事件，报告成绩数、Rating 前后和按 Rating 涨幅排的前 20 条变化。
    - 我改的：
        - 详细成绩原来是合并进旧成绩的。网页端和设计都是整个替换：core 的 `applySyncUpdate` 只在更新里有 `detailed`、`b50` 时才替换。新加 `cli/src/sync/storedUser.ts` 的 `applySyncToStoredUser`：core 读的是去掉它查不了的记录的副本（`userForCoreScores`）；更新里有的部分整个替换，存储里 core 查不了的记录一起换掉；更新里没有的部分保留存储的原样，包括 core 查不了的记录；Rating 历史只在 Rating 是有限数时才变。测试拿网页端同一份数据的结果比对。
        - 交给 core 的用户（`buildUserForCore`）原来是存储的原样，有 core 查不了的记录时同步会出错。改成先经过 `userForCoreScores`。
        - 宴会场谱面的变化原来都算作 `missing`：成绩历史用的记录键是 `<SaltNet 曲目 id>-<level_index>`，和 CLI 的谱面键不同。改成按 `scores` 和 `b50_snapshot` 里存的记录键到谱面键的对应找谱面（`cli/src/users/scores.ts` 的 `readRecordChartKeys`）。
        - 错误里的命令原来从 core 的用户对象上读序号。那里没有序号，所以选了别的用户时，提示的命令都指向默认用户，uid 也没加引号。改成默认用户写 `0`，其他用户写加引号的 uid（`syncUserRef`、`quoteArg`）。
        - 水鱼拒绝按用户名查询（400、401、403）时，提示原来让人重绑 token，现在让人重绑 `df-name`。
        - 写入事务可能遇到数据库被锁，`errors` 加了 `DB_LOCKED`。
        - Gemini 为了让没有指南示例的 `sync` 通过测试，把 `guide.test.ts` 和 `errorCodes.test.ts` 里「每个命令都要有示例」的检查对所有命令放宽了。改成只豁免明确列出的命令：`cli/tests/examples.ts` 的 `COMMANDS_WITHOUT_EXAMPLES`，现在只有 `sync`（它只和账号打交道，种子数据里没有能离线跑的例子）。
    - 测试：变异 22 处，杀掉 11 处。存活的 11 处里：
        - 一处是死分支（删存储里的键），已删掉。
        - 两处在落雪过期判断 `isLxnsTokenExpired` 里。P3-14 接进同步时用刷新替换它，会删掉它。
        - 其余 8 处缺测试：同步前的 Rating 不是整数时 `rating.before` 为 null；公开 B50 的 `counts.charts` 算上 sd 和 dx 两半；新事件沿用最新已存事件的代；core 读不到的记录（转换时会让 core 抛错的 `song_id`）不能挡住同步；落雪本身失败时提示里不再建议 `--source lxns`；涨幅相同的变化按谱面键排序；超过 20 条时只列 20 条、`changesTotal` 算全部；公开 B50 的变化按 `b50_snapshot` 的记录对应找谱面。
        - 我的额度快用完了，这 8 处没有自己补，写进 P3-14 第二轮的 brief，和那一步一起交给 Gemini，届时重跑这几处变异。这偏离了「变异全部杀掉才提交」的做法，在这里记下。
    - 按决定 66 不单独送审，并入 P3 的整体审查。
90. **Codex 换用 GPT 6.2 Sol（2026-11-23）**：
    - 用户让 Codex 写代码和审查都换成新出的模型。用户说的是「5.2 sol」，`codex debug models` 的目录里没有这个 id，最新的 Sol 是 `gpt-6.2-sol`（GPT-6.2-Sol），就用它，`reply ok` 试通。分工表、`coordinator-prompt.md`、脚本说明和两个脚本的提示都改了。
    - 试的时候 Codex 提示 `AGENTS.md`（现在 52 KB）只读进了前 32768 字节。也就是说，`AGENTS.md` 超过这个大小以后交给 Codex 的步骤，它自动读进的项目说明缺了后半截；brief 都让它自己去读文件，影响有限。两个脚本都加了 `-c project_doc_max_bytes=131072`。
    - 草稿目录在 `/private/tmp` 下，macOS 每天清理三天没访问过的文件。11-18 之后停的几天里，草稿目录的脚本、brief 和大部分委托输出被删了。补丁、brief 和脚本都有持久副本，从那里恢复；P3-7b 的汇报（`response.txt`）没有副本，丢了。
91. **P3-14 的实现（2026-11-23）**：
    - 分工：这一步是〔新〕，原定 Codex 写。当时 Codex 本周额度用完，交给 Gemini，分两轮。
    - 第一轮的问题，我没有合进去，写进了第二轮的 brief：
        - 用常量代替设置项 `lxns.refreshTokenDays`、`lxns.expiringWarnDays`。
        - `userCredentialState` 按参数的形状猜是哪种用户。`statusUserRow` 有两种参数顺序，靠运行时的类型判断区分。
        - 时间取 `Date.now`，不是 `ctx.io.now()`。
        - 刷新成功后，不管存储里还是不是刚刷新的那个授权都写回。`invalid_grant` 时删授权，但不删 `lxnsAccountId`，也不看授权是否已被换掉。
        - `fix` 里的 uid 没加引号；`status` 列了隐含的 `INTERNAL`；没有接进 `sync`。
    - 第二轮（Gemini，32 分钟）之后的样子：
        - `cli/src/sync/lxnsToken.ts` 的 `lxnsAccessToken` 在调用方持有的同步锁下读 `credentials.json`，按账号规则取授权。访问令牌还有一分钟以上就直接用；否则用刷新令牌换新的，不重试。
        - 写回前在 `updateCredentials` 里确认存储的还是刚刷新的那个授权，三项（授权、落雪 id、签发时间）一起写；被别的进程换掉或删掉时不写，新授权只用于这次运行。
        - `invalid_grant` 时先重读一次：别的进程已经换了刷新令牌，就用新的再试一次；否则确认存的还是失败的那个授权，把三项一起删掉，报 `LXNS_REAUTH_REQUIRED`。新令牌属于另一个落雪账号时同样处理。core 对后一种只抛普通 `Error`，CLI 按它的消息判断，消息写成一个有注释的常量。
        - `status` 给每个用户列凭据状态：水鱼 token 有没有；落雪 `valid`、`expiring`、`expired`、`unknown` 或 `missing`，刷新令牌的过期时间按签发时间加 `lxns.refreshTokenDays` 推算。快过期（不到 `lxns.expiringWarnDays` 天）或已过期时给 `LXNS_EXPIRING`。落雪 id 从存储的原始用户取，不用投影出来的列。
        - `sync` 的落雪来源在锁里、`beginRun` 之后先调用它。`isLxnsTokenExpired` 删掉了：访问令牌过期而有刷新令牌就刷新，没有就在锁里报 `LXNS_REAUTH_REQUIRED`，记一条 failed。
        - `user bind` 和 `user unbind` 的每个写事务先 `assertNoSync`，公开 `SYNC_IN_PROGRESS`；`unbind lxns` 也删签发时间。这原定由 P3-7b 做（决定 88）。P3-7b 和这一步并行，`bind.ts` 只能归其中一个，就挪到了这里。
        - 补上了 P3-8 留下的 8 处测试（决定 89）。
    - 我改的：设计 5.2 解绑落雪的一条补上签发时间。
    - 我补的测试：
        - 令牌（`cli/tests/sync/lxnsToken.test.ts`）：访问令牌为空时，即使没过期也去刷新；刷新令牌为空时不发请求，直接报 `LXNS_REAUTH_REQUIRED`；`invalid_grant` 后存的还是失败的那个令牌，只发一次请求；同步锁属于别的用户时报 `INTERNAL`，不发请求，凭据文件不变。
        - 凭据状态的两个边界（新文件 `cli/tests/users/view.test.ts`）：刷新令牌刚好到期算 `expired`，刚好还剩三天算 `valid`。
        - `sync` 刷新之后，每个落雪玩家请求都在换令牌之后发出，带的是新的访问令牌。
        - `user bind df-token`、`bind df-name`、`unbind ingame`、`unbind df-name` 和 `unbind lxns`（有凭据、没有凭据两条路）在同步进行中都报 `SYNC_IN_PROGRESS`，凭据文件和用户都不变。
        - P3-8 那条「`song_id` 不能转换就过滤掉」的测试原来用 `Object.create(null)`。它存成 JSON 再读回来就是普通对象，测试其实没测到过滤。而且同步合并只按新来的记录的键去查旧记录，从不转换旧记录，就算漏了过滤也不会抛错。改成：在新来的记录对应的键下存一条 `song_id` 为 `{ toString: 1 }` 的记录，带上播放次数；水鱼不给播放次数，同步后新记录没有拿到它，说明 core 没看到这条记录，也就没有合并。
        - `cli/tests/commandRun.ts` 的 `commandIn` 返回的请求带上 `init`（类型从 `{ url }` 改为 `RecordedRequest`），测试才能检查请求头。
    - 变异测试：46 个变异，第一次杀掉 29 个。补测试后，17 个幸存的又杀掉 14 个。剩下 3 个是等价的：删授权时漏删签发时间或落雪 id，同一次 `updateCredentials` 的 `pruneCredentials` 会把没有授权的这两项删掉；写回时漏写落雪 id，条目里本来就是同一个 id（按账号规则取到授权的前提就是 id 相同，core 也确认了新令牌属于同一账号）。
    - 按决定 66 不单独送审，并入 P3 的整体审查。
92. **P3-7b 的实现（2026-11-23）**：
    - 分工：这一步是〔新〕，原定 Codex 写。当时 Codex 本周额度用完，交给 Gemini，和 P3-14 并行。它的汇报（`response.txt`）在草稿目录被清理时丢了（决定 90），下面按补丁和检查结果记。
    - `backup import` 在要求确认之前和写事务里各查一次同步锁，任何用户有同步在进行都报 `SYNC_IN_PROGRESS`（导入会替换所有用户）；导入成功时，在替换用户的同一个事务里往 `sync_runs` 记一条 `import`，摘要是导入的用户数和成绩事件数。
    - `user remove` 同样在要求确认之前和写事务里各查一次，只看被删的那个用户的同步锁。
    - 两处都在要求确认之前先查一次，这样同步进行中的预览直接报 `SYNC_IN_PROGRESS`，不会先给一个确认口令，确认之后才失败。
    - 原定在这一步给 `user bind`/`unbind` 加的检查挪到了 P3-14（决定 91）。
    - 我加的：`cli/tests/commandRun.ts` 的 `commandIn` 现在检查命令失败时的错误码在它公开的错误列表里，不在就让测试失败。这样每个经过 `commandIn` 的测试都顺带检查了公开的错误码；例子测试只在没有用户的数据目录里跑，到不了「有用户在同步」这种状态。加上之后全部 115 个测试文件都通过，说明现有测试里没有命令报出未公开的错误码。
    - 变异测试：11 个变异，杀掉 7 个；从两个命令的错误列表里删掉 `SYNC_IN_PROGRESS` 的 2 个，在 `commandIn` 加了检查后也被杀掉。剩下 2 个是确认之后写入前的第二次检查（导入和删除用户各一处）：单进程的测试里，要求确认之前的第一次检查总会先报错，只有另一个进程恰好在两次检查之间开始同步才走得到第二次，测不到。
    - 按决定 66 不单独送审，并入 P3 的整体审查。
93. **P3-13 的实现（2026-11-23）**：
    - 分工：这一步是〔新〕，由 Codex（gpt-6.2-sol）写，和 P3-9 并行。
    - `user bind <用户> lxns` 离线生成 15 分钟有效的 PKCE 授权链接。授权记录（verifier、client id、回调地址、落雪地址）存在 `credentials.json`，同一用户重新开始会替换旧记录。
    - `--callback -` 从 stdin 读回调链接，在该用户的同步锁和凭据锁内完成绑定。先校验 state、用户、有效期、回调地址和回调结果；兑换前把授权码的哈希写进记录。服务明确拒绝时（非 2xx，或正文里有 OAuth 错误）恢复原记录；结果不明时（连接失败、响应读不出）保留哈希，同一链接再来就要求重新授权，不会再发一次授权码。
    - 换到 token 后先写进记录，记录从这时起再保留 15 分钟，然后读账号资料、检查身份、保存用户。中途失败可以用同一链接继续，不再发请求。
    - 账号资料沿用网页端的 JWT 字段：id 必须是正的安全整数，名字必须是字符串，且不能含任何凭据。SQLite 里 `lxns.auth` 为 null；token、落雪 id 和签发时间存在 `credentials.json`。
    - 身份变化按设计先报 `USAGE`，等 P3-15 加确认；暂存的 token 保留 15 分钟。完成绑定不写 `sync_runs`。
    - `credentials.ts` 也改了：解析失败的错误和 cause 不再带 `JSON.parse` 的原始消息（V8 的消息会引用文件内容）和未知字段名；`pruneCredentials` 保留授权记录的全部字段；`updateCredentials` 剪枝用的时间参数改名为 `pruneNow`。
    - 没验证：用同一个落雪 client 再授权一次，网页端原来的授权会不会失效（设计 5.2「需要实测」）。列入手动测试清单。
    - 我改的：`user bind` 的错误列表里删掉了多写的 `INTERNAL`（每个命令都隐含它）。
    - 变异测试：38 个变异，第一轮杀掉 20 个。我补了这些测试：invalid_grant、没有 OAuth 正文的 5xx、200 正文里的 OAuth 错误，三种拒绝都恢复原记录；请求不跟随重定向；id 为 0、小数或超出安全整数、名字不是字符串的令牌被拒；开始授权时撞上同步锁；兑换期间丢了凭据锁（要求重新授权）或同步锁（保留 token，同一链接继续）；只缺 `lxns.redirectUri`；`--callback` 用于其他来源、`lxns` 带值参数、离线完成都报 `USAGE`；短到被 `JSON.parse` 整段引用的凭据文件。补完后 35 个被杀。剩下 3 个等价或测不到：暂存的 token 和签发时间总是一起写，`!token` 被签发时间的检查盖住；拿到同步锁后到第一次检查之间没有任何等待，单进程测不到；`validateLXNSOAuthTransaction` 返回的就是原对象。
    - 按决定 66 不单独送审，并入 P3 的整体审查。
94. **P3-9 的实现（2026-11-23）**：
    - 分工：这一步是〔新〕，由 Codex（gpt-6.2-sol）写，和 P3-13 并行。
    - `sync --qr -` 从 stdin 读二维码或二维码页面链接，做全量更新。不带 `--qr` 时，存有舞萌 ID 的用户做快速更新。`auto` 优先选启用的舞萌账号。既没有 ID 又没给二维码，报 `QR_REQUIRED`，fix 指向选中的用户。
    - 二维码先用 `GetQRInfo` 查出所属账号。拿同步锁之前查一次，拿到锁后再和锁内读到的用户比一次；属于另一个舞萌账号就报 `USAGE`（身份确认留给 P3-15）。
    - 带二维码的请求不走核心的 SaltNet 客户端（它失败后会换备用地址重发），改由 `postQrGameApi` 发：只发一次，不重试，不换备用地址，不跟随重定向。服务端说二维码无效或过期，报 `QR_INVALID`；连接失败或超时报不可重试的 `NETWORK`，超时的 fix 指向对应的超时设置。
    - 快速更新的 UpdateUser 用 `network.updateTimeoutMs`，可以重试一次，也可以换备用地址（请求里只有 ID）。补全按网页端的顺序：先落雪（需要时在同一把同步锁下刷新 token），失败或没绑再用水鱼 Import-Token，都没有就只存游戏数据。
    - 返回的账号与本次同步的账号不同，报 `UPSTREAM_ERROR`。返回的成绩里出现任何凭据（二维码、Import-Token、落雪 token，包括同步中刷新得到的新 token），也报 `UPSTREAM_ERROR`，不保存。
    - 舞萌来源的错误不带 cause 和响应内容，因为里面可能有二维码或玩家 ID。进度只打固定文字的行。显示名就是玩家 ID 的老用户，在进度、错误和日志里改用网页端的 `wmc`。`sync_runs` 的 mode 记 `full` 或 `fast`。命令的副作用等级改为 `account`。
    - 和网页端的差别：网页端在存有 ID 时，第一次更新也可能要二维码；CLI 按设计只要 ID。上传仍返回 `uploads: []`，留给 P3-10。
    - 已知不足：快速更新超时时，核心客户端丢掉了原始错误，CLI 只报「连接舞萌服务失败」，不提示调大 `network.updateTimeoutMs`。二维码请求超时会提示。
    - 变异测试：31 个变异，第一轮杀掉 21 个。我补了这些测试：
        - 二维码请求超时时，fix 指向的设置（查询用 `network.timeoutMs`，登录用 `network.updateTimeoutMs`）；
        - 后端返回 `QR_INVALID` 代码、非零 errorID 或英文的过期消息，都报 `QR_INVALID`；
        - `GetQRInfo` 返回 0、负数、小数、超出安全整数或字符串形式的 ID，或者缺 `errorID`，都在登录前报 `UPSTREAM_ERROR`；
        - 全量和快速更新返回另一个账号；
        - 返回的成绩里含同步中刷新得到的落雪 token；
        - 快速更新按 `network.updateTimeoutMs` 等待，而不是 `network.timeoutMs`；
        - 快速更新两个地址都返回 503（可重试的 `UPSTREAM_ERROR`），或者都连不上（`NETWORK`）；
        - 其他来源失败时，fix 建议舞萌来源。
    - 补完后 30 个被杀。剩下 1 个是等价变异：舞萌来源的错误不带 cause，但 CLI 从不输出 cause（`--verbose` 只给 `INTERNAL` 打印它自己的栈，日志只存错误码和消息），所以去掉这层防护看不出区别。
    - 按决定 66 不单独送审，并入 P3 的整体审查。
95. **P4-2 的实现（2026-11-23）**：
    - 分工：这一步是〔新〕，原定 Codex 写，Codex 额度暂停期间交给了 Gemini，所以比 P4-1 先做：P4-1 的 `check-login` 要加进它建的 `ingame` 命令组。它的汇报在草稿目录被清理时丢了，后来找回。
    - `ingame backup <文件> [--user] [--overwrite]` 把用户的成绩、收藏品和角色导出成网页端「导出备份」的游戏格式 JSON，以 0600 权限原子写入。不读凭据，不联网。
        - 用户没有舞萌 ID 时报 `NOT_BOUND`。没更新过或没有完整成绩时报 `NOT_FOUND`，fix 指向 `sync`。
        - 目标文件已存在时报 `FILE_EXISTS`，fix 加上 `--overwrite`。目录不存在时报 `USAGE`，不建目录。
        - 没有角色数据时照样导出，并警告 `PARTIAL_BACKUP`。
    - 转换代码从 `src/components/data/user/exportBackup.ts` 原样移到 `shared/core/user/gameBackup.ts`（`buildGameBackup`），网页端改为调用它。我比对过移走和新增的行：除了加 `export`、新的 `GameBackup` 类型和直接 `return`，只多了 `detailed ?? {}`。两个调用方都先检查过 `detailed`，走不到这一步，所以网页端行为不变。
    - `cli/src/runtime/outputFile.ts` 是写文件的公共部分（`resolveOutputFile`、`writeOutputFile`），P4-3 的 `b50 --image` 会复用。
    - `eslint-suppressions.json` 里，`exportBackup.ts` 有 3 条规则（共 21 处）已经不再出现，我手动删掉了，没有用 `--prune-suppressions`。
    - 我改的：fix 里的 uid 按其他命令的写法加引号；以 `-` 开头的 uid 用 `--user=`，绑定命令把 uid 放在 `--` 后面。为此加了测试，并检查打印出的绑定命令能被解析。
    - P4-1 的范围改了：只做 `ingame check-login`，不做 `clear-tickets`。网页端在 1667dd2d（2026-01-12）把「清理补偿倍券」和「预览倍券」的菜单都注释掉了，CLI 不再提供网页端已经隐藏的账号操作。所以 `ingame` 命令组的说明只写 `check-login` 随后加入，计划里 P4-1 的标题也改了。设计 3.2 和 5.4 由 P4-1 修改。
    - 我还改了 `--overwrite` 的 fix：以 `-` 开头的文件名写成 `./<文件>`，以 `-` 开头的 `--user` 值写成 `--user=`，这样打印出的命令能直接运行。测试会把 fix 拆开再跑一遍。
    - 变异测试：CLI 19 个，core 8 个。第一轮 CLI 有 4 个存活：路径中间是文件（`ENOTDIR`）、没有角色列表、fix 里的 `--user`、按字节算大小。core 有 3 个存活：成绩率四舍五入、道具种类取列表位置、`detailed ?? {}`。前 6 个补了测试，连同上一条新加的 2 个变异都被杀掉。`detailed ?? {}` 是等价变异。

96. **P3-10 的实现（2026-11-23）**：
    - 分工：Codex（gpt-6.2-sol）写，我应用、检查并做变异测试。
    - 舞萌全量或快速更新在本地事务提交后，仍在同一把用户同步锁下，按水鱼、落雪的顺序上传游戏成绩。和网页端一样：只在舞萌更新后上传；快速更新补全的成绩不上传，两边收到的都是补全前的游戏记录；水鱼用 Import-Token 收原始记录，落雪收转换后的 `{ scores }`。上传给谁由 core 决定（有 Import-Token 才传水鱼，有落雪访问令牌才传落雪），CLI 把 core 的回调先排进队列，提交后再发。落雪用 `credentials.json` 里与该落雪账号匹配的授权，访问令牌过期时先刷新。
    - 每个目标单独写一条 `sync_runs`（kind 为 `upload`，source 为目标），摘要只有记录条数。
    - 上传失败不影响同步结果：`data.uploads` 记 `{target, ok, error}`，并加一条 `UPLOAD_FAILED` 警告。401 和 403 换成重新绑定的 fix：水鱼报 `NOT_BOUND`，落雪报 `LXNS_REAUTH_REQUIRED`。错误里只带状态码和结构化的错误码，不带响应正文或原因。
    - 上传请求只发一次，不重试，也不跟随重定向（重定向可能把带凭据的请求转给别处）。落雪令牌刷新同样不跟随重定向。
    - `--no-upload` 关闭上传，这时 `uploads` 是空数组。命令的副作用级别仍是 `account`，因为带二维码时会登录账号；上传本身属于 5.4 的「远端」。
    - 我改的：同步写入本地之后再出错（例如上传时同步锁失效），失败处理不再附上「尝试其他已绑定来源」，错误信息前面加上「同步结果已写入本地，之后出错：」。原来的写法会让人以为同步失败、换个来源重来。
    - 上传时同步锁失效：不再发后面的请求，命令报 `INTERNAL`。这条上传的 `sync_runs` 留在 `running`，下一个拿到这把锁的进程会把它标成 `interrupted`。本地同步已经提交，不受影响。
    - 变异测试：30 个，第一轮 11 个存活。补了 5 组测试（401 和 403 改成重新绑定、网络错误的信息、本地错误保留原来的错误码、落雪授权缺 `tokenType`、上传时锁失效），杀掉其中 8 个。上一条改动加的 3 个变异也都被杀掉。剩下 3 个：
        - 非舞萌来源也注册上传回调：等价变异，core 只在 `syncFromInGame` 里调用这两个回调。
        - 提交后不清空 `runId`：等价变异，失败处理对已经结束的 run 调 `finishRun` 会抛错，那里的错误本来就被忽略。
        - 每次上传请求前的锁检查：测试触达不到。一个目标里排在上传请求前面的只有落雪令牌刷新，而 `lxnsAccessToken` 刷新后自己会检查锁。保留它作为防御。
    - 检查时发现：`sync` 和 `user bind` 相关的几条 fix 不能照原样运行。以 `-` 开头的 uid 会被当成选项，`df-token` 少了 `-`，`df-name` 少了用户名，没有来源时只印 `user bind <用户>`。这些在 P4-1 之后单独的一步 P3-10b 里修。

97. **P4-1 的实现（2026-11-23）**：
    - 分工：Codex（gpt-6.2-sol）写，我应用、检查并做变异测试。
    - `ingame check-login [--user] --qr -` 对应网页端的「查询登录状态」。它从 stdin 读二维码或链接，先用 `GetQRInfo` 确认二维码属于这个用户绑定的舞萌账号（和 `sync --qr -` 一样），再发 `CheckLogin`。
        - 两个请求各发一次，不重试、不跟随重定向，也不改用备用地址，所以超时错误的 `retryable` 是 false。
        - 返回所选用户和布尔值 `isLogin`。后端返回的不是布尔值时报 `UPSTREAM_ERROR`；网页端的 worker 只按真假判断。
        - 不登录账号，副作用级别是「无」，不写 `sync_runs`。用户没有舞萌 ID 时报 `NOT_BOUND`，fix 是 `user bind ... ingame --qr -`。`--offline` 报 `USAGE`。
        - 超时的 fix 是同一条命令，并且用 `--user` 指定当前用户，即使它是第 0 位，这样默认用户在两次运行之间变了也不会查错人。
        - 这个命令只和账号打交道，所以没有指南示例。它和 `sync` 一起列在 `cli/tests/examples.ts`。
    - 我改的：Codex 为了做到「不写入」，用只读方式另外打开数据库，拼了一个只读的 Store，旧版本的库也不升级。我改成和 `status` 一样：数据库不存在时当作没有用户，不建目录；存在时照常用 `ctx.store()` 打开，需要时照常迁移。迁移是每个命令打开数据库时都会做的本地维护，不算这个命令写入的数据，而且少一条特殊的打开路径更好维护。测试「不升级旧库」的那条用例相应删掉了。
    - `sync_runs.mode` 列的说明去掉了 `clear-tickets`。迁移 6 建表语句里的注释没有改：SQLite 把建表语句原文存进 `sqlite_master`，改历史迁移会让新库和旧库的表定义文本不一致。
    - 变异测试：14 个，杀掉 12 个。剩下 2 个：
        - 出错时 `retryable` 改成 false：等价变异。会走到这里的网络错误都来自带二维码的请求，这些请求本来就不可重试。我给超时用例加了 `retryable: false` 的断言。
        - 把意外的非 `CliError` 原样抛出：测试触达不到。这条路径上的请求和 stdin 读取出错时都会转成 `CliError`。保留它是为了防止意外错误的信息里带出二维码。
98. **P3-10b 的实现（2026-11-23）**：
    - 分工：我写。这一步是 P3-10 检查时发现的（决定 96），放在 P4-1 之后单独提交。
    - 新增 `cli/src/util/printedCommand.ts`，打印出来的 `sync`、`user bind`、`ingame`、`export` 命令都由它拼，按设计 4.3 能照原样运行：
        - `user bind` 里默认用户写 `0`，其他用户写 uid。它取代了 `sources.ts` 的 `syncUserRef`。
        - 选默认用户时不写 `--user`。`ingame check-login` 超时的 fix 例外，照旧写明（决定 97）。值以 `-` 开头时写成 `--user=<值>`。
        - 用户以 `-` 开头时，`user bind` 的选项放在 `--` 前面，用户和来源放在后面。
        - 以 `-` 开头的文件名写成 `./<文件名>`。
    - 顺带修了几条原来不能照抄运行或者不完整的 fix：
        - `df-token` 的 fix 少了 `-`。`df-name` 的少了用户名，现在用占位符 `<水鱼用户名>`。水鱼拒绝按用户名查询时，另外给出绑定 Import-Token 的命令。
        - 没有任何来源时原来只印 `saltnet user bind <用户>`，现在列出四种绑定命令。
        - 成绩警告 `NO_SCORES`、`STALE_SCORES` 里的 `--user` 原来没加引号。
        - `export` 的 `FILE_EXISTS` fix 原来丢了 `--keep-lxns`，照抄会导出不带落雪授权的文件。
        - `sync` 的 `QR_REQUIRED` 对默认用户原来写 `--user 0`，现在省略，和其他 fix 一致。
    - 测试：`cli/tests/printedCommand.ts` 用真正的解析器读 fix，检查它到达的命令、用户和选项。每个调用点都加了以 `-` 开头的 uid 或文件名的用例，`export` 的用例还照抄运行了 fix。
    - 变异测试：31 个，第一轮杀掉 28 个。剩下 3 个都缺测试：没有来源时默认用户的 fix（写 `0`），`--source lxns` 未绑定时以 `-` 开头的 uid，`user bind lxns` 重新开始授权的 fix。补上测试后都杀掉了。
99. **P4-3 的实现（2026-11-23）**：
    - 分工：Gemini 写，我检查、修正并补测试。
    - `b50 --image <文件>` 照网页端「在线渲染」拼请求体（`buildB50RenderPayload`），发给渲染服务：
        - 请求体里有玩家名、副名（只有设了备注时才有）、两组完整 rating 之和、模式标签、`--dx-score`，以及两组完整的谱面，不受 `--limit`、`--offset` 影响。
        - 图片以 0600 原子写入。文件已存在时报 `FILE_EXISTS`，fix 是加上 `--overwrite` 的同一条命令。fix 只保留模式、`--user`、`--dx-score` 和文件名，因为 `--limit`、`--offset`、`--fields` 不影响图片。
        - `--overwrite`、`--dx-score` 不带 `--image` 时报 `USAGE`，`--image` 和 `--offline` 一起用时也报 `USAGE`。
        - 只有 `--image` 会联网和写文件，所以 `b50` 的副作用级别从 `none` 变成 `local`。
        - 渲染请求不改变服务端的任何东西，所以和读请求一样自动重试一次。
    - 我改的：
        - Gemini 用 `response.text()` 读 PNG，再用 `Buffer.from(文本, "binary")` 还原成字节。真正的 `fetch` 会按 UTF-8 解码正文，而 PNG 的第一个字节 0x89 不是合法的 UTF-8，所以对真正的渲染服务，这个命令每次都会报「不是有效的 PNG」。它的测试把字节按 latin1 转成文本来模拟响应，所以没发现这个问题。改法如下：
            - `io.ts` 的响应可以带 `arrayBuffer`。
            - `createHttp` 返回的响应多了 `bytes()`。带重试时一次读出字节，文本由 `TextDecoder` 从字节解码，和 `Response.text()` 一样去掉 BOM、替换坏字节。不带重试时，读哪种就按需读哪种。
            - `ctx.http` 的类型随之改成 `CliFetch`。它也满足 core 要的 `FetchLike`。
            - 测试里新增 `binaryResponse`，用真正的 `Response` 解码，B50 图片测试改用它。样例里有全部 256 个字节值，并逐字节核对写出的文件。`http.test.ts` 在两条读取路径上都和真正的 `Response` 对照。
        - 渲染服务返回非成功状态时，`retryable` 原来总是 false。现在和 `upstreamStatusError` 一样，5xx 和 429 是 true，并带上 `status`。
        - Gemini 在 `outputFile.ts` 里另写了 `safeFileArg` 和 `safeUserOption`，和 P3-10b 的 `printedCommand.ts` 重复，已删掉，改用 `fileWord` 和 `optionWords`。
        - `writeOutputFile` 原来用 `as unknown as string` 把字节传给只收字符串的 `writeFileAtomic`。现在 `files.ts` 的两个写文件函数都直接接受字节。
    - 没有加指南示例：`--image` 要访问渲染服务，而端到端测试是离线跑的。
    - 变异测试：16 个，全部杀掉。它们覆盖：按文本读图片、`retryable` 和 `status`、跳过 PNG 检查、两条读取路径各自按文本取字节、解码时保留 BOM 或按 latin1 解码、读字节中断时原样抛错、fix 里的文件名和 `--user` 没有处理开头的 `-`、按字符串写文件。
100. **P4-4 的实现（2026-11-23）**：


    - 分工：指南文字和代码都是我写的。计划里手写的文字归协调者，代码只有几十行，就一起写了。
    - 手写的部分都在 `guide/handwritten.ts`：
        - 开头的说明从查数据扩展到成绩、同步、用户、绑定和备份。
        - 「先看这几条」有 8 条：先 `status`、找歌、读结果（`error.fix` 和要转告的警告）、看清是谁的成绩、省 token、数据新旧（不主动同步，同步后会上传，`--no-upload` 不上传）、凭据只走 stdin、确认（退出码 6、`error.preview`、`error.codeRejected`）。设计 6.1 的退出码一条没有单列，因为退出码表每一行已经带着该怎么做。
        - 「常见问题怎么查」有 13 条。除了设计 6.1 第 8 条的 5 个问题，还加了 B50 和 rating、算分、数数量、段位、收藏夹、更新成绩、绑定水鱼和落雪、备份。
        - 「术语」是一张三列的表：玩家的说法、意思、在 saltnet 里对应的字段或命令。
    - `guide --skill` 在同一份指南前面加上 frontmatter：`name: saltnet`，描述按设计 6.1 写，又补上了 rating、其他收藏品、更新成绩、绑定和备份。描述用 JSON 字符串写，它也是合法的 YAML 字符串。命令只打印，不写文件；怎么装写进最终报告。
    - 手写的部分只用行内代码写命令，不用 ```bash 代码块，因为 `guide.test.ts` 要求代码块的数目等于有示例的命令数，端到端测试也会执行代码块里的每一行。为了让手写的命令和实际行为对得上，新测试用真正的解析器解析每一条完整的命令。带占位符的命令（如 `chart <谱面> --with stages`）不能照原样运行，就只检查命令名和其中每个选项都存在。
    - 端到端测试里，`guide --skill` 的输出去掉 frontmatter 后要和 `guide` 的输出逐字相同。
    - 变异测试：15 个，全部杀掉。它们覆盖：去掉常见问题、术语或其中的行、去掉一条规则（中间的和最后一条）或其中不主动同步的提醒、frontmatter 的名字写死、描述不加引号、frontmatter 后少空行、忽略 `--skill`、完整命令里的选项拼错或取值越界、带占位符的命令里命令名或选项拼错。第一轮「去掉一条规则」没有杀掉，于是加了规则编号连续和三条安全规则必须在的检查。

101. **P3-11 的实现（2026-11-23）**：


    - 分工：Codex（gpt-6.2-sol）写，我合入。补丁基于 1c633dd，只有 AGENTS.md 一处因为 P4-4 改了相邻的条目而打不上，我手工合并。
    - 网页端的「全部更新」跳过开了「手动更新」的用户，其余用户走普通的更新流程，可能要扫码。`sync --all` 也跳过这些用户（列在 `skipped` 里），其余的按存储顺序逐个同步：每个用户用自动来源，有自己的同步锁、`sync_runs` 记录、事务和上传。它读不了二维码，所以舞萌来源只做快速更新，没有游戏 id 的用户在自己的结果里报 `QR_REQUIRED`。
        - 单个用户的 `CliError`（包括 `SYNC_IN_PROGRESS` 和 `NETWORK`）记进它的结果，再接着同步下一个；不是 `CliError` 的异常仍然结束整个命令。
        - 命令跑完就是 ok，即使每个用户都失败了。有失败时加一条 `SOME_FAILED`，写明失败的人数、名字和 uid。每个结果保留自己的警告。
        - `--all` 和 `--user`、`--source`（明写的 `auto` 也算）或 `--qr` 一起用是 `USAGE`。为了认出明写的 `auto`，`--source` 的默认值从选项定义挪进了执行。
    - `sync --dry-run` 说明每个用户会用哪个来源、哪种方式、上传到哪里、属于哪个副作用级别，不联网、不读 stdin、不取锁、不写入、不刷新曲库，可以和 `--offline` 一起用。
        - 计划和真正的同步用 `sources.ts` 里的同一套函数（来源、方式、上传目标、绑定检查），所以不会和实际行为不一致。
        - 读数据库时不打开可写的 store，也不跑迁移。数据库已经检查点时用 `immutable` 只读打开，因为普通的 WAL 读者即使只读也会建 `-wal`/`-shm` 文件；读完核对文件没被并发写入改过，改过就按普通的快照规则重读。迁移 4 之前的布局没有用户，计划为空。
        - 用户的绑定问题写进它自己计划的 `error`，命令仍然 ok；命令行本身的问题（`--qr -` 配非舞萌的 `--source`、`--all` 配 `--user`）仍然是整个命令的 `USAGE`。
    - 单人同步原来在取锁前就返回缺少绑定、快速更新缺少游戏 id 这类错误，不写记录。现在先取锁、写 `sync_runs`，再记下失败，和 `--all`「每个尝试过的用户一条记录」一致。取不到锁时不写记录。
    - Codex 自己加了 `sync/secrets.ts`：同步期间日志里的二维码和 token 被替换掉；不是 `CliError` 的异常不保留可能带着凭据的 cause；上游的成绩响应里如果回显了凭据，就拒绝保存（`UPSTREAM_ERROR`），保证数据库里不会出现凭据。
    - 指南的例子是 `sync --all --dry-run`，所以 `sync` 不再是没有指南例子的命令。我在指南的「更新一下成绩」里加上了 `--dry-run` 和 `--all`，并改了设计 5.1 里 `--dry-run` 一段的措辞（原文读起来像「会读 stdin、会取锁」）。
    - 我补的测试：迁移 4 之前的布局上预览报 `NO_USER`、不迁移、不改文件；`--all` 里失败的用户保留自己的警告；同步中途抛出的非 CLI 异常带着 token 时，加 `--verbose` 也不会把 token 印出来。
    - 变异测试：25 个，杀掉 24 个。第一轮有 4 个没杀掉，补了上面 3 个测试后杀掉 3 个。剩下的是「immutable 读完后不核对文件有没有被并发写入改过」：它守的是读的同时有别的进程写入，测试没法稳定地造出这种竞争，留作已知缺口。

102. **P3-15 的实现（2026-11-23）**：


    - 分工：Codex（gpt-6.2-sol）写，我合入，补丁干净地打上了。计划里原来的 P3-15 拆成两步：这一步只做 `user bind` 换人时的确认；`sync --qr -` 扫到另一个账号的二维码时怎么办（`sync.qrOtherAccount`）放到 P3-15b，两步由 Codex 并行写。
    - 判断换人和清空数据用网页端的 `hasStrongIdentityChanged` 和 `resetUserForNewIdentity`：游戏 id 或落雪 id 在绑定前后都有值且不同，就算换人；前后都没有这两个 id 时，两个非空的水鱼用户名不同才算。首次绑定和同一身份的绑定不用确认，传了 `--yes` 也照常执行。
    - 换人要按设计 5.4 确认。确认状态包含来源、uid、和 `user remove` 同一份待删除行的摘要、目标身份；落雪还包含暂存兑换的过期时间，所以一个码只能确认它预览过的那次兑换。预览列出前后身份和要清掉的各表行数，不含凭据。
    - `error.fix` 用稳定的 uid 指向用户。带 `--yes` 时先按 uid 精确查找，再走普通的用户引用，所以 uid 碰巧像序号（如 `1`）时也不会确认到别的用户身上；重排之后旧码因为 index 变了而失效。`ingame --qr -` 只发一次 `GetQRInfo`，确认命令改用 `--id <8 位 id>`，不用再扫码；以 `-` 开头的水鱼用户名在确认命令里放在 `--` 后面。
    - 落雪：回调那次兑换完先用回调里的授权码检查账号资料没有回显它，检查过才把兑换结果连同 `profileChecked` 写进授权记录，从兑换起保留 15 分钟。`user bind <用户> lxns --yes <码>` 只认检查过的记录，不联网、不读 stdin；P3-13 写下的、没检查过的记录要重新授权。设计 5.2 的「换到 token 后先写进授权记录，再读取账号资料」相应改成先检查再写入。
    - 确认后在一个事务里：照网页端清空玩家数据、换新 uid，`replaceUserIdentity` 删掉旧用户（子表级联删除）并在原位置插入新用户，结果带 `oldUid` 和 `newUid`。凭据跟着搬到新 uid，落雪授权只在属于这位用户的落雪账号时保留；旧 uid 待完成的落雪授权一并去掉。凭据文件在 SQLite 提交后才改名到位，这一步失败返回 `INTERNAL`，说明绑定已保存而凭据没更新。有同步在进行时拒绝。
    - 指南：规则 8 加上「把用户绑定到另一个人的账号」；P3-12 时去掉的 `df-name` 例子补回来，并加上 `user bind 0 ingame --id 99990001` 和 `user bind 0 lxns`。Codex 给 `df-name` 例子起的名字是 `fake-new-diving-fish-name`，我换成了更像用户名的 `example_player`。
    - 变异测试：19 个。第一轮有 6 个没杀掉：确认码不含目标身份、不含落雪兑换的过期时间，搬凭据时不检查落雪账号、不去掉旧 uid 待完成的授权，确认时接受没检查过的兑换，带 `--yes` 时不先按 uid 精确查找。我补了 6 个测试，对应这 6 处，重跑后全部杀掉。

103. **P3-15b 的实现（2026-11-23）**：


    - 分工：Codex（gpt-6.2-sol）写，和 P3-15 并行；补丁基于 87ad751 的内容，在 P3-15 之后干净地打上了。
    - `sync --qr -` 扫到的二维码属于另一个舞萌账号时，看 `sync.qrOtherAccount`（P1-2 起就有这个设置，但同步一直直接报 `USAGE`）。默认 `rewrite` 和网页端一样：照常登录做全量更新，存下的游戏 ID 改成二维码的账号，成绩历史接在同一个 uid 后面，照常上传；成功后加一条 `GAME_ACCOUNT_CHANGED` 警告，写用户名而不写 id，`fix` 是 `saltnet config set sync.qrOtherAccount error`。首次扫码（原来没有游戏 ID）不算换账号，不警告。
    - `error`：在拿锁和登录之前返回 `USAGE`，`fix` 是 `user bind <用户> ingame --qr -`，走 P3-15 的换人确认；默认用户写 `0`，其他用户写 uid（决定 98）。
    - 两次检查共用一次 `GetQRInfo` 的结果：拿锁之前按用户列表里的游戏 ID 查一次，拿到锁后按锁内读到的用户再判断一次；警告也按锁内的 ID 决定。
    - `ingame check-login` 在两种设置下都拒绝别的账号的二维码（它只核对，不改数据）；`--dry-run` 和 `--all` 不变。
    - 设计 5.1 写了两种设置；待确认 5 改成「已做成配置项，默认和网页端一致，默认值要不要改成 `error` 仍待定」。指南的「更新一下成绩」加了一句。
    - 变异测试：12 个，全部杀掉。它们覆盖：两种设置各自的行为（`error` 不再拒绝、`rewrite` 也拒绝），拿锁前后的两次检查和锁内用哪个 ID，警告是否给出、按哪个 ID 决定、带不带 `fix`，拒绝时的 `fix` 是否带上、是否把默认用户写成 `0`，存下的游戏 ID 是否改写，首次扫码是否被当成换账号。

104. **P3-17 的实现（2026-11-24）**：


    - 分工：Gemini 做（〔简单〕），15 分钟，只改 `AGENTS.md`：对照代码核对 `cli/` 那一段里 P3 新增和改过的条目。
    - 它改了 5 处，我逐条对过代码，都对：
        - `sync --all` 有用户失败时给 `SOME_FAILED` 警告。
        - `src/users/` 写明写入在 `repository.ts`，给 `user` 和 `status` 的行在 `view.ts`。
        - `lxns --yes` 写成完整的命令。Gemini 写的是 `user bind lxns --yes`，我补上了用户和确认码：`user bind <user> lxns --yes <code>`。
        - `sync/types.ts` 里没有同步选项的类型，去掉了这一说。
        - `lxnsToken.ts` 也给上传用。`lxns.refreshTokenDays` 和 `lxns.expiringWarnDays` 其实是 `users/view.ts` 给 `status` 算凭据状态时用的（`status` 那条已经写了），从这条里去掉。
    - Gemini 顺带指出：`user bind` 的说明里「落雪确认只需 lxns --yes <确认码>」没写全，代理可能照着去运行一个并不存在的顶层命令 `lxns`。这是命令说明，不属于 `AGENTS.md`，留到 P3 整体审查的修复里一起改。
    - 测试：只改文档，按 finish.sh 跑全部检查。

105. **P4-5 的实现（2026-11-24）**：


    - 分工：Gemini 做（〔简单〕），11 分钟。第一次运行什么也没交：脚本的白名单里没有 `pnpm test:cli-e2e`，它跑不了要改的测试就停了。我在临时目录复制了一份加上这条的脚本，没动仓库里正被其他运行使用的那份；第二次运行交了补丁。
    - `cli/e2e/bundle.test.ts` 新增一个测试：在空数据目录里把指南的 95 条示例各跑一遍，`refresh` 用固定数据回答，其余加 `--offline`，网络一律拒绝。成功的照原来的办法查信封；失败的必须是合乎信封 schema 的 `ok: false`、stderr 为空、错误码在这个命令公布的列表里且不是 `INTERNAL`、退出码就是这个错误码的退出码，带 `fix` 的必须以 `saltnet ` 开头并能被真实的解析器读成一条命令，`CONFIRMATION_REQUIRED` 的 `fix` 当场再跑一遍。现在的结果：26 条成功，36 条 `OFFLINE_NO_CACHE`，27 条 `NO_USER`，5 条 `NOT_FOUND`（示例里的收藏夹「练习」在空目录里不存在），1 条 `INVALID_BACKUP`（`import` 的示例文件不存在）。
    - 我改的：原来新测试要靠第一个测试先打包、先读信封 schema，单独运行（`-t`）会找不到产物。抽出 `buildBundle()` 和 `readEnvelopeSchema()`，哪个测试先跑就由哪个打包，两个测试都能单独运行。另外要求空目录里既出现 `OFFLINE_NO_CACHE`，也出现 `NO_USER`。
    - 变异测试：4 个。第一轮全部报「基线失败」，原因就是上面说的单独运行找不到产物；改完重跑，杀掉 3 个：`OFFLINE_NO_CACHE` 改成 `INTERNAL`、它的 `fix` 改成跑不了的命令、`ingame backup` 公布的错误里去掉 `NO_USER`。没杀掉的是 `resolveUser` 把 `NO_USER` 换成 `NOT_FOUND`：这些命令也公布 `NOT_FOUND`，退出码跟着错误码走，而 `export` 自己也会报 `NO_USER`，所以端到端测试分不出来；`tests/refs/user.test.ts` 的「没有用户时每种写法都报 `NO_USER`」能杀掉它，不再加端到端的断言。
    - `AGENTS.md` 的 `e2e/` 那条加上了这个测试。

106. **P3-16 的实现（2026-11-24）**：


    - 分工：Gemini 做（〔简单〕），一次跑完，22 分钟。它先把计划这条列的场景逐个对到已有的测试上（`invalid_grant`、两个进程同时刷新、撞锁、上传成败在 P3-9、P3-10、P3-11 的测试里已经有了），只补缺的。
    - 新的 `cli/tests/sync/secrecy.test.ts`：20 个带 `--verbose` 的场景（四种来源各跑成功、500、网络错误，`sync --all`、`--all --dry-run`、`--dry-run --qr -`、`user show`、`user list`、`status`、解绑落雪、解绑水鱼 token），每个场景都在新的数据目录里放好全部凭据（游戏 ID、水鱼 Import-Token、落雪的访问和刷新令牌，加上 stdin 的二维码），然后查 stdout、stderr、`saltnet.db` 和 `-wal` 的字节（原样和 JSON 转义后）以及 `sync_runs` 里都没有任何一个，`credentials.json` 仍是 0600。
    - `cli/tests/commands/sync.test.ts` 补了：二维码全量更新；没有游戏 ID 又没给二维码时 `QR_REQUIRED`；快速更新用水鱼 token 补充；两个后端地址都回 500 时退出码 5 的 `UPSTREAM_ERROR`，数据不变；`--source auto` 对每种来源的选择。`cli/tests/sync/uploads.test.ts` 补了 `sync.qrOtherAccount` 为 `error` 时拒绝另一个账号的二维码，用户、数据库和日志都不变。
    - 我补的：Gemini 的 500 回应只有「Internal Error」，CLI 自己的脱敏从来没被用上，破坏检查里「去掉脱敏」和「保留 cause」两个都没被抓到。加了六个同步场景，上游的错误信息把这次运行拿到的每个秘密都原样念回来；再加 `protectSyncSecrets` 的单元测试（`withoutCause` 去掉 cause 并隐藏所有秘密；后来加进去的秘密也会被隐藏）。第一版在没读二维码的运行里也念了二维码，看上去像泄漏；CLI 隐藏不了一个从没拿到的字符串，所以只在读了二维码的运行里念它。
    - 变异测试：6 个：去掉脱敏、`--verbose` 时把 token 打进日志、保留 cause、把 token 写进日志摘要、把 token 写进错误信息、`credentials.json` 改成 0644。补之前新测试单独能杀 4 个；补之后 6 个全杀（已有的上传测试也能杀其中 4 个）。没有发现真的泄漏。

107. **P3 整体审查和修复（2026-11-24）**：


    - 审查范围是 `29c452c` 之后的全部提交，即 P3 和 P4-1 到 P4-4（P4-5、P3-16、P3-17 只有测试和文档，在审查之后）。两个审查都用 Codex GPT 6.2 Sol：按我们的审查要求做的审查提了 25 条（12 条错误和与设计不一致、7 条安全和隐私、5 处测试放得过错误实现、1 条仓库规则），Codex 自带的审查提了 16 条，其中 8 条前一个审查没有。我逐条对过代码，都成立。
    - 留着没改的 3 条：
        - 落雪 OAuth 兑换遇到 502 这类说不清的失败时，仍然恢复待完成的记录，同一个回调可以再提交一次（决定 93）。授权码只能用一次，再兑换最多被落雪拒绝，拿不到第二份授权；恢复记录则让网关临时出错时不用重新授权。
        - `sync --all --dry-run` 遇到留着 `-wal` 却没有 `-shm` 的数据库，SQLite 的只读 WAL 读取仍可能建出 `-shm`。这只在上次进程异常退出之后出现，建出的是 SQLite 自己的共享内存文件，不含数据。
        - `ingame check-login` 打开已有的数据库时仍会迁移（决定 97）：每个命令都这样，迁移前有备份。
    - 其余的按改动的文件分成三份，同时修：
        - A（Codex GPT 6.2 Sol，同步和 HTTP，11 条）：
            - 刷新落雪 token 后等凭据锁用的时钟原来停在刷新那一刻，持锁的进程死掉后会一直等下去；改用实时的时钟，`lxnsIssuedAt` 只取一次。
            - 除 GET、HEAD 以外的请求和带 Authorization、Import-Token 头的请求默认不跟随重定向，这时的 3xx 是不重试的 `UPSTREAM_ERROR`。原来只有上传和 OAuth 兑换这样做，刷新 token 的请求体和水鱼的 Import-Token 可能被转发到别的源。测试用的 `mockHttp.ts` 按 Fetch 的规则处理重定向。
            - 用落雪访问令牌前核对 JWT 里的 `id` 和存下的落雪 id；没有有效落雪 id 的授权（例如导入时标错了账号）要重新授权；清除授权只在存下的账号和令牌仍是这一份时进行。
            - 二维码登录前再检查一次同步锁：等曲库时锁可能已经过期，被别的进程拿走。
            - 水鱼公开 B50 回退时，变化列表的「之后」用这次同步带来的记录，不再用保留下来的详细成绩。
            - SaltNet 临时失败之后水鱼又明确拒绝用户名时，报水鱼的拒绝和重新绑定的 `fix`（决定 89）。
            - 两个后端地址都配了时，主地址失败只换备用地址一次，不再两边各试两次共四次；只有一个地址时重试一次。
            - 预览失败的计划报 `mode: null`、没有上传、`effect: local`，不再许诺上传。
            - 旧成绩通不过成绩事件的校验、这张谱面又还没有历史时，不写那条基线，把第一条有效成绩存成 `initial` 事件；原来整个同步回滚。
            - `improved` 只数达成率、DX 分、连击、同步有升且没有降的谱面；只变游玩次数或下降的照样进历史。
            - 拿同步锁时把旧运行标成 `interrupted` 的写入挪进 `journal.ts`（`interruptRuns`），`journal.ts` 又是 `sync_runs` 唯一的写入者（仓库规则那一条）。
        - B（Codex GPT 6.2 Sol，账号操作，12 条）：
            - `user remove` 和 `import` 在动手的那个事务里重新算确认码，确认之后有别的写入就要重新确认。
            - 绑定和解绑在写入事务里重读用户再改，不会把并发的 `user edit` 改回去；它们持有用户的同步锁，直到数据库写入和凭据文件改名都完成。
            - `import` 按排好的顺序拿存储的和导入的每个 uid 的同步锁，先去掉会变的凭据，再提交 SQLite，最后写最终的凭据，同步在哪一步都读不到新资料配旧 token。
            - 解绑落雪时取消这位用户待完成的落雪授权和暂存的兑换，旧的确认命令随之失效。
            - 没有要确认的事时带 `--yes` 是 `USAGE`。决定 102 原来规定照常执行，但用户被删掉后，旧确认命令里的 uid `0` 会落到序号 0 的另一个用户身上。
            - 打印的命令里，只有数字或以 `uid:` 开头的 uid 写成 `uid:<uid>`；`uid:<uid>` 只认这个 uid。
            - 导入保留落雪授权时也保留 `lxnsIssuedAt`；没有成绩历史的 v1 备份里没有 uid 的用户也用文件摘要和位置生成稳定的 uid，确认码可以复现。
            - 凭据的按用户表复制时保留 `__proto__` 这样的键。
            - 水鱼拒绝 token 时，错误信息和重试日志里隐藏提交的 token（短 token 原来会原样出现在 stdout）。
            - `user bind` 的说明写全 `user bind <用户> lxns --yes <确认码>`（决定 104）。
        - C（Gemini 3.8 Flash，输出文件和 B50 图片，3 条）：
            - 不带 `--overwrite` 时，最后一步用硬链接把写好的临时文件放到位（不支持硬链接时用排他复制），渲染期间别的进程建了同名文件也是 `FILE_EXISTS`，临时文件不留下。`b50 --image`、`ingame backup` 和 `export` 都这样写。
            - `b50 --image` 先检查 `--fields`，再请求图片。
            - 选中的模式里没有谱面时不画图，`image: null`，加一条新的 `NO_IMAGE` 警告；原来是 `INTERNAL`。
    - Gemini 那份到了 40 分钟的时限，正在跑最后一次 `pnpm test:cli`，没写报告；补丁是完整的，我自己核对了它并做了变异测试。
    - 合并：B 和 C 都改了 `backup.ts` 的 import，三方合并时手工合了一行。
    - 我补的：
        - B 的报告说白名单外还有两处没改：`ingame` 的绑定提示和 `lxnsToken.ts` 找不到用户行时的提示也写成 `uid:<uid>`，`ingame check-login` 自己的 `--user` 说明改用共用的文字；加了数字 uid 的绑定提示测试。
        - B 隐藏 token 用的是「〔已隐藏〕」，统一成和 `http.ts`、`sync/secrets.ts` 一样的 `<已隐藏>`。
        - `AGENTS.md` 按三份修复的内容由我写。
    - 变异测试共 39 个，最后全部被测试抓到：
        - A 14 个、B 14 个，第一遍就全被抓到。
        - C 10 个，第一遍漏了一个：不支持硬链接、退回复制时去掉排他标志。原有的测试里目标文件还不存在，补了一条目标文件已存在的测试。
        - `lxnsToken.ts` 找不到用户行时退回 `uid:<uid>` 的那一处原来没有测试，补了一条（没有存下的用户行、只有数字的 uid），加了一个变异。
        - 补的两条测试让这两个变异重跑都被抓到。

108. **P4-6 的实现（2026-11-24）**：


    - 分工：协调者自己做（〔协调〕）。
    - 新的 `cli/README.md`（中文，写给用户）：需要什么（Node.js 24、`pnpm install`），构建和运行，装成全局 `saltnet` 命令的三种办法（链接进 `PATH` 里的目录、在 `cli/` 里运行 `pnpm link`、shell 别名）和怎么撤销，数据目录和设置（`SALTNET_HOME`、`config list`、用环境变量覆盖设置），导入导出网页端备份，把 `guide --skill` 的输出存成 Claude Code 的 skill，以及开发时跑的测试。产物里写进了 `.env` 的默认值，所以 README 提醒不要把产物或 `config list` 的输出贴到公开的地方。
    - 这些命令我一条也没有运行：没有做全局链接，也没有往 `~/.claude/skills` 里写东西。
    - 核对过的：pnpm 10 的文档说，在包目录里运行不带参数的 `pnpm link`，会把包链接到全局的 `node_modules`，包有 `bin` 时它的命令全局可用；撤销用 `pnpm uninstall --global <包名>`（就是 `pnpm remove --global`），`pnpm unlink` 只处理当前目录里的链接。本机的 pnpm 是 10.33.2。环境变量的命名规则（`SALTNET_` 加上大写下划线写法的键名）以 `runtime/config.ts` 为准。
    - `AGENTS.md`：`cli/` 那一条和 `pnpm build:cli` 那一条提到 `cli/README.md`。其余条目在 P3 审查的修复里已经和代码对上了。终稿前用一个小脚本把它提到的 276 个路径逐个对过仓库里的文件：找不到的 10 个都是不进仓库的东西（打包产物、数据目录里的 `config.json`、`credentials.json` 和 `cache/`、`dist/`、`.wrangler/`）或写法（`@core/`、`./`、`*.test.ts`）；它提到的 `pnpm` 脚本在 `package.json` 里都有，`package.json` 的每个 `test:*` 它也都提到了。
    - 测试：只改文档，按 finish.sh 跑全部检查。

109. **最终使用测试、完整审查和修复（2026-11-24）**：


    - 起因和做法：P4-7 之后用户要求让 Codex 做一次完整的使用测试和代码审查。使用测试由 Codex（gpt-6.2-sol）在沙盒外跑（用户同意它请求网络访问）：只真实请求公开的 SaltMeta 和落雪收藏品列表，凡是要凭据、二维码或会写到第三方的流程都用模拟 HTTP 和夹具，没有用用户的账号，数据目录都是临时目录。报告列了 24 条发现。审查有四份：查询和输出（12 条缺陷、1 条安全、3 条测试缺口）、状态和凭据（5 条缺陷、5 条安全、3 条测试缺口）、同一部分用 Codex 内置的 `/review` 再审一遍（10 条，其中 3 条是工具脚本的）、网页端（4 条行为、3 条安全、2 条测试缺口、2 条规则和文档）。各份之间重叠不少。
    - 分组：能复现的发现分成五组，每组的 brief 都要求先写出能看到问题的测试、看它失败再改代码，复现不了的不改、不留测试。
        - G1（Gemini 3.8 Flash，agy）：成绩条件接受库里的写法（`sssp`、`fsdp` 等）；打印出来的 `search` 命令照着就能运行；两端有空白的 uid 写成 `uid:<uid>`；表格保留带点的列名和要求的列顺序；`b50 --image` 用整份 B50 校验 `--fields`；渲染结果要有 PNG 签名、IHDR 和 IEND 才算 PNG；SQL 字符串和注释里的名字不算用到视图（以前 `SELECT 'v_collections'` 会去下载收藏品）；`calc` 先把达成率舍到游戏保留的四位小数，评级和 rating 用同一个值；`ingame backup` 容忍空的物品格。
        - G2（Gemini）：谱面行的游玩次数和网页端曲目页一样，有成绩历史的估算就用估算，没有才用记录里的次数（改正第 70 条「记录里的次数优先」）；`ra`、`achievements` 或 `ds` 不是有限数字的记录不进给 core 的副本（`userForCoreScores`），`users.raw` 和导出照旧保留；`--with related` 给出所选用户的 `owned` 和 `progress`；补测试：门自己的谱面行带上用户成绩。
        - G3（Gemini）：只改 `cli/` 或 `docs/` 的提交不推进网页端的版本号（`script/generateBuildInfo.cjs`，`pnpm test:build-info`）；网页端的收藏品请求重新抛普通 `Error`（`pnpm test:collection-index`）。三个 Gemini 都在收尾时因为一条命令被无头模式拒绝而没写出报告；补丁都能干净应用，我用测试逐项核对了它们做了什么。G3 的第三项（懒加载）没做，我自己写了（见下）。
        - G4a（Codex gpt-6.2-sol，凭据、锁和数据目录）：导入在提交前任何一步失败都把原来的 `credentials.json` 放回去（原来的测试断言凭据被清空，改成断言原样）；`export` 在凭据锁里一次读出用户、成绩历史和凭据；坏的备份载荷不把可能引用 token 的 `SyntaxError` 留作 cause；换人的绑定按顺序拿新旧两个 uid 的同步锁；开始落雪绑定时拿用户的同步锁，`lxns.redirectUri` 缺 `lxns_auth_complete` 参数时先报 `USAGE`、什么都不写；续租出异常时当作锁丢了，下一次检查在命令里失败，不再让计时器把进程弄崩；`SYNC_IN_PROGRESS` 说明那次同步可能已经中断，并给出锁到期的本地时间；曲库刷新下载时续租，写入事务里确认锁还在，丢了锁就什么都不写；`config set`、`config unset` 用 `config.json.lock` 串行化（锁目录里放唯一的 owner 文件，整个目录原子改名发布；owner 进程已不在且超过 5 秒的锁可以接管），等 5 秒拿不到就是 `DB_LOCKED`，目录不可写时报出目录；打开数据库要写入时遇到只读的数据目录，报出需要写权限的目录。
        - G4b（Codex，同步流程）：`--dry-run` 用和执行同一个 `checkLxnsAccess` 检查访问令牌里的账号；同一次调用里同一个刷新令牌最多发一次（快速同步的落雪补充刷新失败后，上传不再重发，记为 `UPLOAD_FAILED`）；凭据的 `encodeURIComponent` 和表单编码写法也打码；保密测试逐个断言结果和发出的请求，并加上这种回显；`QR_REQUIRED` 的 fix 保留 `--no-upload`、`--dry-run`、`--offline`；HTTP 200 加不完整的回复是 `UPSTREAM_ERROR`，日志记失败，用户不变；没配游戏后端时 `sync --source ingame`、`ingame check-login --qr -` 和计划都在读 stdin 之前报 `USAGE` 指向 `api.url`；快速更新超时保留超时消息和调大设置的命令；`LXNS_REAUTH_REQUIRED` 的 fix 只留重新绑定，其他已绑定的来源写进消息；`ingame backup` 的说明写明要游戏 ID。
        - G5（Codex，输出和参数写法）：`--fields` 按命令 `dataSchema` 里条目的 schema 校验，tsv 和 text 的列也从 schema 来，所以空页同样校验、表头和满页一样，`b50 --image` 在请求渲染之前就校验（改正第 22 条「名字必须在结果里真的存在」）；`b50 --image` 在请求之前确认目标的上级是已有的目录；翻过最后一页的文字页给出总数，不再写倒过来的区间；`search`、歌曲引用和 `--diff`、`--level` 这类选项值把全角数字和字母当半角读；以 `-` 开头的值在缺值的错误和帮助里说明 `--选项=<值>` 的写法。
    - 我自己改的：
        - `sql` 偶发的段错误（使用测试第 2 条，几千行的查询约八次崩一次）：Node 会记住从不含 SQL 的文本（空白、注释、分号）准备出来的语句，这样的语句被垃圾回收后再关闭数据库，就会 finalize 已经释放的内存。修法是把这类语句留在模块里，进程结束前都可达。回归测试强制垃圾回收后检查，拿掉两处里的任一处测试都失败。
        - 懒加载搜索库（网页端审查第 2 条）：`cli/build.mjs` 的插件把 `pinyin-pro`、`wanakana`、`opencc-js/t2cn` 换成第一次用到时才加载真模块的替身，`--help` 从约 53 ms 降到约 42 ms，几组搜索结果和改前逐条一致。
        - `chart` 的位置参数里全角的曲目 id（`chart １４６ ３`），不在 G5 的文件里。
        - 收尾时发现的 fix：超时的 fix 原来是一句话加命令，而且固定建议 60000，比 `network.updateTimeoutMs` 的默认值 120000 还小；现在建议写在消息里，fix 是一条调大设置的命令（`raiseTimeoutCommand`：两倍，至少一分钟，不超过上限；已到上限就没有 fix），`sync` 里解析旧文字的正则删掉。凭据文件读不了时、水鱼拒绝 Import-Token 时的 fix 也是一句话：前者改进消息，后者改成重新绑定的命令。`DB_LOCKED` 和 `SYNC_IN_PROGRESS` 的说明跟着改。
        - 文档：`chart --with friends` 说明包含选中的用户（第 18 条）；`--course` 的默认顺序在 `--asc` 时倒过来（第 19 条）；词汇表的底分只在一组满了以后才有意义（第 20 条）；指南写明 `--format text` 下确认预览是文字（第 11 条）、tsv 分组没有 `count`（第 14 条）、`ingame backup` 要先绑定舞萌账号（第 21 条）；谱师搜索的例子换成能搜到的（第 24 条）；README 说明 shell 别名只在交互式 shell 里有（第 22 条）、导出总带水鱼 Import-Token（状态审查的安全第 5 条，第 73 条的决定不变）、改 `lxns.redirectUri` 要保留 `lxns_auth_complete`；`engines` 和 README 改成 Node 24.12（`enableDefensive` 从 24.12 才有，第 41 条没写版本）。
        - 工具脚本：`commit.sh` 不暂存任何一层的 `.env*` 和 `.wrangler`，git 失败时停下；`mutate.py` 先跑一遍不改的测试，不过就不判；`lib.sh` 的快照在基点早于 `cli/` 时也会补上依赖的链接。
        - 收尾的全量检查：委派补丁留下几处格式和 lint 问题（G1、G2 改的五个文件，G3 的 `generateBuildInfo.cjs` 和它的测试，我改的 `refs/chart.ts` 的导入顺序），G3 写的网页端测试有两处类型错误，都改了；`generateBuildInfo.cjs` 改成按第一级目录判断，免得多出和 Prettier 冲突的换行规则违规。端到端测试里编的落雪回调地址缺 `lxns_auth_complete`，G4a 加的检查让 `user bind 0 lxns` 那条示例失败，给它补上了参数；真实的 `.env` 和 `.env.local` 里的回调地址都带这个参数（只数了有没有，没有输出取值）。
    - 保留没改的：SaltNet 的备用地址要等主地址的错误正文读完才切换（内置审查，来自 1712f63）；按仓库里跟踪的默认配置，游戏请求失败时二维码会发到前端的地址（来自 1a2ede8），后端回显的二维码可能出现在网页端的提示里（来自 1712f63），这三条都不是本分支的提交，写进报告给用户定；网页端落雪返回 JSON `null` 时的错误信息比以前清楚，保留；core 的 `gameBackup` 遇到空物品格会崩是以前就有的，CLI 这边已经容忍，网页端不动；刷新失败后快照比 `meta_state` 新（查询审查第 2 条），第 26 条记过，后果只是之后重建时下载时间偏旧；songs 快照抓不到 KALEIDXSCOPE 谱面列表出错，是测试缺口，留给以后；`sql --fields a.b` 选不到带点的 SQL 别名（点号表示嵌套），HEAD 上就是这样。
    - 破坏检查：G1–G3 共 24 处，补测试后 23 处被发现，剩下的一处（SQL 里双写的引号）是等价改动；G5 共 21 处，19 处被发现，剩下两处（分组 tsv 的 `group` 列、路径中间一段是文件）补了测试；G4a、G4b 和收尾的改动共 35 处，第一轮 33 处被发现；没发现的两处都补了测试：坏备份那条测试用的假 token 比 V8 在解析错误里引用的十个字符长，留下的 cause 也看不出来，改成检查被引用的那一段；开始落雪绑定时等凭据锁的那段时间里同步锁丢了，原来没有测试。补上以后重跑，两处都被发现。
    - 测试：按 finish.sh 跑全部检查（含 `pnpm build`），都通过：`test:cli` 127 个文件 2466 条（P4-7 时 2384 条），`test:cli-e2e` 2 条，`test:collection-index` 67 条（多了网页端收藏品请求的 4 条），`test:build-info` 3 条，其余和 P4-7 时一样。
