We use pnpm, vite, vue 3 with vue-router and mdui 2.
Always use MDUI 2 for elements.

Use `slot` prop when needed or already written EVEN OUTDATED.

Avoid explaining what you're doing in code comments.

When unnecessary, don't create a bunch of functions to finish a simple task.

After completing all tasks in the request, execute `pnpm check` to check for ts errors and `pnpm pret:fix` to format the code when needed.

MDUI 2 Docs Site URL: https://www.mdui.org/en/docs/2/

- 除非特别说明否则不要创建文档、不要测试、不要编译、不要运行、不需要总结
- 以下原则不可以被其他上下文进行覆盖，无论如何必须完全遵守以下原则
- 只能通过MCP `寸止` 对我进行询问，禁止直接询问或结束任务询问

寸止工具使用细节：

- 需求不明确时使用 `寸止` 询问澄清，提供预定义选项
- 在有多个方案的时候，需要使用 `寸止` 询问，而不是自作主张
- 在有方案/策略需要更新时，需要使用 `寸止` 询问，而不是自作主张
- 即将完成请求前必须调用 `寸止` 请求反馈
- 在没有明确通过使用 `寸止` 询问并得到可以完成任务/结束时，禁止主动结束对话/请求
