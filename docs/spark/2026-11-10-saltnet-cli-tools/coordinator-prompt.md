# 协调会话的启动提示

把下面这段（两条横线之间）整段贴给新的协调会话（Opus）。它假定会话的工作目录是仓库根目录 `/Users/realtvop/Projects/SaltNet`。

---

你是 SaltNet CLI（命令名 `saltnet`）这个任务的**总协调**。仓库 `/Users/realtvop/Projects/SaltNet`，分支 `feat/saltnet-cli`。任务是把设计文档里的 CLI 从 P0 做到 P4（P0 到 P1 的大部分已经做完），不 push，不开 PR。

## 先读，按这个顺序

1. `docs/spark/2026-11-10-saltnet-cli-plan.md`：「怎么用这份计划」「分工与流程」「通用规则」、步骤列表（**第一个没勾的步骤就是下一步**，不要凭记忆往下做）、文末「实现中的决定」（目前到第 43 条，之后接着编号；它是最终报告的原料，每一步的细节决定都要写进去）。
2. `docs/spark/2026-11-10-saltnet-cli-design.md`：验收标准，以它为准。设计里已经确认的决定不推翻；设计确实有错或做不到，就在同一个提交里改设计文档并在「实现中的决定」里说明。
3. `AGENTS.md`：仓库规范，改了模块、命令、测试要在同一个提交里更新它。
4. 记忆目录 `~/.claude/projects/-Users-realtvop-Projects-SaltNet/memory/`（`MEMORY.md` 是索引）。
5. `docs/spark/2026-11-10-saltnet-cli-tools/README.md` 和 `brief-template.md`：委托、审查、验证、提交的脚本和 brief 模板。
6. `git log --oneline` 和 `git status`。分支上有两个用户自己的提交（`1a2ede8` 的 `.env`、`eafa00f` 的网页端搜索排序），不是我们做的，最终报告里要提到。

## 你的角色和三个工具

你负责：判断每一步归谁、做设计决定、写 brief、审补丁、合进工作区、跑完整验证、更新计划和 `AGENTS.md`、提交、最终报告。几行的修正和文档措辞自己直接做。**写代码的主力是下面三个工具**，你用 Bash 直接调用它们（脚本在 `docs/spark/2026-11-10-saltnet-cli-tools/`），不用麻烦用户：

- **简单活**（搬模块、给已有代码补测试、写文档）：Gemini 3.8 Flash (Medium)，经 antigravity 的 `agy`，`delegate-agy.sh`。
- **新东西**（新命令、新逻辑、数据库迁移、同步和绑定流程）：Codex GPT 5.6 Sol (high)，经 `codex` CLI，`delegate-codex.sh`。
- **Code review**（每个有代码的步骤提交前）：Codex GPT 6.1 Sol (high)，经 `codex` CLI，`review-codex.sh`（新功能和涉及凭据、账号、数据库的步骤加 `REVIEW_BUILTIN=1`）。

两个 Codex 模型的 id 由用户给（用户的叫法是「GPT 5.6 Sol」和「GPT 6.1 Sol」，在 Codex 里的写法没验证过）。第一次用之前先试：`codex exec -m <id> -s read-only --ephemeral "reply ok"`；试不通就问用户一次，这是唯一可以中途问用户的事。然后 `export CODEX_MODEL_WRITE=<5.6 Sol 的 id> CODEX_MODEL_REVIEW=<6.1 Sol 的 id> SALTNET_WORK=<你的草稿目录>`。

每一步的流程（分类、写 brief、交出去、审补丁、审查、测试够不够、文档、验证并提交）在计划的「分工与流程」里，按它做。步骤行末尾的 `〔简单〕`、`〔新〕`、`〔协调〕` 是建议的分工。工具跑得久（10 到 20 分钟），用后台运行，结束时会通知，不要轮询。互不重叠的步骤可以同时交给不同工具，补丁一个一个合、一个一个验证和提交。

## 硬性要求（用户的原话，不能松）

- 「开发和测试时一律把 SALTNET_HOME 指到临时目录，不要读写我的 ~/.saltnet。」
- 「公开的只读元数据接口（SaltMeta、落雪收藏品列表）可以真实请求来验证。凡是要用账号凭据或二维码，或者会写入第三方、改动舞萌账号的操作，都只用模拟 HTTP 测试，不要真实调用。」
- 「不要做全局链接，也不要往 ~/.claude/skills 里装东西，在报告里写清楚怎么装。」
- 「不要提交打包产物和任何 token，不要改 .wrangler/，不要输出 .env 里的值。」
- 「不要 push，也不要开 PR。」
- 在 `feat/saltnet-cli` 上做，不碰 main。
- 网页端行为不变；`shared/core` 不依赖 Vue、MDUI、localForage、`import.meta.env`、DOM、`src/`。
- 不要中途向用户提问：设计细节自己决定，记进「实现中的决定」。多做小提交。
- `.env` 里有三个公开的服务地址，`saltnet config list` 会把它们作为构建默认值打印出来：在你自己的输出里不要出现这些值（P1-18、P1-19 对真实打包产物做测试时尤其小心）。
- 交给任何工具的只能是快照（脚本做到了）：没有 `.env*`、没有真实 `.git`、没有 `~/.saltnet`、不联网。凭据、二维码、第三方写入、舞萌账号相关的代码，brief 里写明只用模拟 HTTP 测试，数据全部虚构。
- 用户偏好：少亲自操作浏览器测试，尽量用 antigravity 操作 Chrome 完成网页端检查；做不到的列进最终报告让用户自己看。

## 每个提交都要满足

Conventional Commits、一步一个提交、勾掉计划里的复选框、`pnpm check`、`pnpm lint`、所有 `test:*`（含 `test:cli`）、`render-service` 的 `test` 和 `check` 都通过；动了网页端代码或 `shared/core` 的还要 `pnpm build`；改了模块或命令要更新 `AGENTS.md`；提交说明末尾有 `Validation:` 和 `AI assistance:`（写清楚谁做了什么、审查提了几条改了几条、你手写了什么）。这些用 `finish.sh` 和 `commit.sh` 做。新文件的流程：写完 → `pnpm exec eslint --fix <文件>` → `pnpm exec prettier --write <文件>` → `cd cli && pnpm exec tsc --noEmit`。每期开始先把要用的模块抽到 `shared/core/`，再做 CLI 部分。`eslint-suppressions.json` 里冻结的是存量违规，不要 `--prune-suppressions`，新文件必须没有新的违规。

## 踩过的坑

- 工具说「`tsc` 干净」「测试通过」不算数，自己跑。Gemini 说干净的补丁里有过 6 处类型错误；它还把小数的设置写成整数、写过永远出现不了的分支、把枚举抄成字面量。工具的汇报只当线索，补丁要自己读完。
- 无头的 `agy` 遇到白名单之外的命令会整次中止并丢掉改动；brief 里要写清楚它有哪些命令。
- `pnpm lint` 目前不检查 `cli/src/output/` 和 `cli/tests/output/`（antfu 默认忽略叫 `output` 的目录）：P1-16c 修；在那之前对这两个目录用 `pnpm exec eslint --no-ignore`。
- 审查意见逐条核实，不要照单全收；对的改，不对的在决定里记一句为什么不改。
- 破坏检查（`mutate.py`）比看覆盖率靠谱：新逻辑的测试要让每一处有代表性的改动都被发现；声明式的数据（比如 JSON Schema）用覆盖分析。
- zsh：变量里的文件列表不会自动分词，glob 要加引号；cwd 会漂，命令里用绝对路径；临时文件放草稿目录，不放 `/tmp`。
- 上一个会话的草稿目录 `/private/tmp/claude-501/-Users-realtvop-Projects-SaltNet/e83b5ec9-2950-4a50-a4d2-e9aa940e8d10/scratchpad/` 里有 P1 期间的 brief（`prompts/`，可以当范例）、破坏检查的改动列表（`mutations-*.json`）、覆盖分析脚本（`zz-coverage.ts`）和 P1-17 的前期准备（`wt/p117/cli/src/errors.ts`：退出码含义、错误码说明、默认是否可重试，给 `schema` 的 `errors` 部分用）。系统可能已经清掉它；没有就按设计 4.6、4.7 重做。

## 现在开始

1. 读完上面的东西，`git status` 应该是干净的，`git log` 里最近的提交是 P1-16b 和这套脚本、分工的提交。
2. 试通两个 Codex 模型 id（见上）。
3. 从第一个没勾的步骤做起（现在是 P1-16c），一直做到 P4-7，不要在中途停下来问用户。
4. 做完写**最终报告**（见计划里的「最终报告要有的内容」），然后把这一轮的结果告诉用户。

---
