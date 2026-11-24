# Brief 模板

brief 是交给一个工具的整个提示词。工具从零开始，只看得到一份仓库的快照，不知道这次对话，也不知道设计文档写了什么，所以 brief 要自足：把要用的设计原文抄进去，把文件路径写全，把「做完是什么样」写明白。下面是结构，删掉用不上的部分；`delegate-agy.sh` 和 `delegate-codex.sh` 都用它。写给工具的部分用英文写（P1 里就是这样）。

---

```markdown
# Task: <what> (step <P?-?>)

You are working in a throwaway copy of the SaltNet repository (a pnpm workspace: the command-line
tool is in `cli/`, shared domain code in `shared/core/`, the web app at the root). Edit files in
this copy. Nothing reaches the real repository except the patch of what you changed.

Hard rules:

- Never run `git commit`, `git push`, `git add`, `git stash`, `git checkout`, `git reset`. Never run
  `pnpm install`, `pnpm add` or anything that changes dependencies.
- Never open `.env*` files. Never touch anything outside this working directory (no `~`,
  `~/.saltnet`, `.wrangler/`). No network access.
- Code and tests never read or write the real home directory: point `SALTNET_HOME` at a temporary
  directory (the tests use `useTempHome`).
- Never write a token, a cookie, a QR code or a real user identifier into a file, a test or a
  message. Every fixture is made up. Anything that talks to Diving Fish, LXNS, the SaltNet backend or
  the game is tested with the mocked HTTP of the tests only, never for real.
- <limits specific to this task, e.g. "Do not change anything under `cli/src/`. If you think a
  source file has a bug, write the test the description demands and report the disagreement.">
- (agy only) You have no general shell. Read files with your file-reading tools, never with `cat`,
  `ls`, `grep`, `find`, `head`, `sed`, `cd` or `node`: they are refused, and the first refused
  command aborts the whole run and throws your work away.

## The commands you can run

<agy: list exactly the allowed ones, as in `delegate-agy.sh`: `pnpm vitest run <file>` with Cwd
`cli`, `pnpm tsc --noEmit` with Cwd `cli` (it type-checks the tests too), `pnpm eslint <files> --fix`
and `pnpm prettier --write <files>` at the root, `pnpm test:cli`, `git status`, `git diff`.>
<codex: the sandbox allows reading everything and writing inside this directory, no network; run
the same checks.>

## Read these first

- <files, with a line on what each is for>
- <the design sections this task implements, quoted: the tool has not seen the design document>

## What to do

<The change, concretely: names, signatures, behavior, the cases that must work, the cases that must
fail, what must stay the same. For a move: the module, its new place, which imports change, which
tests move, and "no behavior change; the snapshot tests must pass unchanged".>

## Expected values (for tests)

<Literal values worked out independently of the code under test. Never compute an expected value
by calling the code under test.>

## Done means

- <the checks that pass: `pnpm tsc --noEmit` prints nothing, the named test files pass, ESLint and
  Prettier are clean on the files you touched>
- <what must not have changed>

## Report

Quote the last lines of the `tsc` output and of the test run verbatim. Say "clean" only when a
command printed nothing at all. List every place where you disagree with this brief or where the
brief and the code disagree (quote the test name, expected, actual) instead of silently choosing
one. List every file you changed.
```

---

## 写 brief 时的经验

- 工具说「`tsc` 干净」「测试通过」不能信：Gemini 说过 `tsc` 干净，实际有 6 处类型错误。brief 里要求它贴出命令输出的原文，协调者拿到补丁后自己再跑一遍。
- 测试的期望值由协调者独立算好写进 brief。让工具用被测代码来算期望值，测试就什么也证明不了。
- 工具照 brief 写，brief 错了它也照错的写。它报告的「分歧」要认真读：P1-16 里 7 处分歧全是 brief 自己写错了。
- 任务大小：能在一个提交里验证完的一块。大块的拆成几个 brief，一个一个来。
- 测试要有「必须被拒绝」的反例，不只是「正常的样子」。
- 搬模块的 brief 要写明：行为不变，先有快照测试，搬完之后快照原样通过；网页端的 import 路径、`AGENTS.md` 的模块索引、`test:*` 脚本里的路径、`.prettierignore` 里的 JSON 路径同步改。
