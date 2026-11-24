# saltnet 命令行

`saltnet` 是 SaltNet 的命令行工具，主要给 AI agent 用：查曲目、谱面和收藏品，看 B50 和 rating，同步成绩，管理本机的用户和收藏夹。数据和网页端算的一样：两边用的是同一份 `shared/core`。

每条命令的输出默认是带版本号的 JSON 信封；`--format text` 给人看，列表还可以用 `--format tsv`。全部命令、选项、错误码和只读视图都写在 `saltnet guide` 里，`saltnet schema` 是同样内容的机器可读版本。

## 需要什么

- Node.js 24 或更新（用到内置的 `node:sqlite`）。
- 在仓库根目录装过依赖：`pnpm install`。

## 构建和运行

```bash
pnpm build:cli
```

产物是一个文件 `cli/dist/saltnet.mjs`。它不依赖 `node_modules`，也不提交进仓库。构建时会把网页端 `.env` 里的默认值（后端地址、渲染服务地址、落雪的客户端 ID）写进这个文件，所以不要把它，或者 `saltnet config list` 的输出，贴到公开的地方。改了代码要重新构建。

```bash
node cli/dist/saltnet.mjs status
```

## 装成全局的 `saltnet` 命令

下面三种任选一种，都在仓库根目录运行。链接指向的是 `cli/dist/saltnet.mjs` 本身，所以之后重新构建直接生效，不用再链接一次。

链接到 `PATH` 里的某个目录，例如 `~/.local/bin`：

```bash
ln -s "$(pwd)/cli/dist/saltnet.mjs" ~/.local/bin/saltnet
```

撤销：

```bash
rm ~/.local/bin/saltnet
```

用 pnpm：pnpm 10 在包目录里运行不带参数的 `pnpm link`，就会把这个包链接到全局，它的 `saltnet` 命令也就能在任何地方用。全局命令放在 `pnpm bin -g` 打印的目录里；这个目录不在 `PATH` 里的话，先运行一次 `pnpm setup`。

```bash
cd cli && pnpm link
```

撤销：

```bash
pnpm remove --global saltnet-cli
```

或者只加一个 shell 别名，写进 `~/.zshrc` 之类的文件（把路径换成仓库的实际位置）：

```bash
alias saltnet="node /path/to/SaltNet/cli/dist/saltnet.mjs"
```

## 数据放在哪里

- 数据目录默认是 `~/.saltnet`，用环境变量 `SALTNET_HOME` 可以换到别处。里面有 `saltnet.db`（SQLite 数据库）、`config.json`（设置）、`credentials.json`（各个账号的 token，文件权限 0600）和 `cache/`（下载下来的原始数据）。
- `saltnet config list` 列出每一项设置的值、来源和默认值。每一项也能用环境变量覆盖：`SALTNET_` 加上大写下划线写法的键名，例如 `lxns.clientId` 对应 `SALTNET_LXNS_CLIENT_ID`。
- 网页端「导出备份」得到的文件，用 `saltnet import <文件>` 导入（导入前会先预览，要确认才写入）。反过来，`saltnet export <文件>` 导出网页端能读的备份。

## 给 Claude Code 用

Claude Code 要能直接运行 `saltnet`，所以先按上面的办法装成全局命令。然后把指南存成一个 skill（只打印、不写文件，由你自己重定向）：

```bash
mkdir -p ~/.claude/skills/saltnet
```

```bash
saltnet guide --skill > ~/.claude/skills/saltnet/SKILL.md
```

只想在某个项目里用，就把它存到那个项目的 `.claude/skills/saltnet/SKILL.md`。CLI 更新以后再生成一次，skill 里的命令说明才会跟着更新。

## 开发

- 单元测试：`pnpm test:cli`。端到端测试 `pnpm test:cli-e2e` 会自己打包到临时目录，用固定数据跑指南里的每条示例，不联网。
- 开发和测试时把 `SALTNET_HOME` 指到临时目录，不要读写真实的 `~/.saltnet`：

    ```bash
    SALTNET_HOME="$(mktemp -d)" node cli/dist/saltnet.mjs status
    ```

- 设计文档在 `docs/spark/2026-11-10-saltnet-cli-design.md`，代码结构见根目录的 `AGENTS.md`。
