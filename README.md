<img alt="screenshot" src="https://github.com/user-attachments/assets/f7823159-87af-4630-8f27-bd0a0affc8f2" />

# SaltNet

<img src="https://deploy-badge.vercel.app/?url=http%3A%2F%2Fsalt.realtvop.top&logo=vercel&name=vercel" alt="Website Deploy"></img>
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/20f6g.svg)](https://status.realtvop.top/)
![mdui2](https://img.shields.io/badge/MDUI-2-blue)
[![wakatime](https://wakatime.com/badge/github/realtvop/SaltNet.svg)](https://wakatime.com/badge/github/realtvop/SaltNet)

[salt.realtvop.top](https://salt.realtvop.top)

开发中的 **舞萌DX** 查分网站

用户群: [QQ: 638052667](https://qm.qq.com/q/mwhqbv7FpQ)

International & Japanese ver. may be supported later.

## ✨ 功能特色

- **PWA** 支持 (iPhone都可以直接装)
- 全曲目列表
- 查询朋友分数
- 获取成绩并更新到水鱼

## 🥖 图标来源

SaltNet 的图标由 青葉もち / 青叶团子 ([X](https://x.com/AlicitruSalt) [Pixiv](https://www.pixiv.net/users/123349)) 绘制并授权使用，特此致以诚挚谢意。

## 🛠️ 技术栈

### 前端框架

- [Vue 3](https://vuejs.org/): 现代化的前端框架
- [Vue Router](https://router.vuejs.org/): 路由管理
- [Pinia](https://pinia.vuejs.org/): 状态管理
- [TypeScript](https://www.typescriptlang.org/): 提供全程类型安全的开发体验

### 样式和 UI

- [MDUI 2](https://mdui.org/): Material Design 风格的 UI 框架

### 开发工具

- [Vite](https://vitejs.dev/): 快速构建工具和开发服务器，支持PWA
- [Prettier](https://prettier.io/): 代码格式化
- [PNPM](https://pnpm.io/): 包管理器

### 落雪 OAuth

配置 `VITE_LXNS_OAUTH_CLIENT_ID` 与 `VITE_LXNS_OAUTH_REDIRECT_URI`，回调地址须包含
`?lxns_auth_complete`，并与落雪开发者面板登记的地址完全一致。本地 `.env.local` 会覆盖
生产模式的本地构建配置；发布前请确认没有把本地回调地址打包进去。

若 PWA 授权后回到了独立浏览器，请在回调对话框中复制链接，返回原 SaltNet 的用户绑定
对话框，在落雪页面选择“继续落雪授权”并粘贴。授权进度保留 15 分钟；过期后需要重新授权。
网络错误可在回调对话框中重试，刷新页面也会恢复尚未完成的回调。

## 🤝 贡献

欢迎贡献！请随时提交 [Issue](https://github.com/realtvop/SaltNet/issues) 和 [Pull Request](https://github.com/realtvop/SaltNet/pulls)。

本项目欢迎在 AI 的帮助下编写的代码，但在提交 AI 编写的代码前请仔细检查代码质量和可读性，在提交时请注明 AI 的使用情况，包括使用的工具和所用模型。

## [TODO](todo.md)

## ⭐ 星标历史

<a href="https://www.star-history.com/#realtvop/saltnet&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=realtvop/saltnet&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=realtvop/saltnet&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=realtvop/saltnet&type=Date" />
 </picture>
</a>

## 📜 许可证

本开源项目遵循 [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.en.html) 许可证。

## 🙏 致谢

- [luoling8192/dxrating](https://github.com/luoling8192/dxrating) - DX Rating 显示框
- [水鱼查分器](https://www.diving-fish.com/maimaidx/prober/) - 曲目数据
- [落雪查分器](https://maimai.lxns.net/) - 曲目别名
