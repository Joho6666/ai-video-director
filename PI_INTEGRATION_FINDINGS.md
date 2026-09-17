# Pi Runtime Integration Findings

- npm 发布版为 `0.85.1`，官方仓库为 `earendil-works/pi`。
- `Agent` 构造需要显式 `streamFn`；工具采用 `AgentTool`（TypeBox parameters 与 execute），应设置 `toolExecution: "sequential"`。
- 默认工具执行可能并行；应用工具本体仍必须检查任务状态、归属、前置产物和付费预算。
- Pi 的 DeepSeek 模型目录没有 `deepseek-flash`，需注册自定义 OpenAI-compatible model，保持项目配置的名称并把 catalog 能力标为未认证。
- Pi 外围存在 retry wrapper；stream 调用必须显式 `maxRetries: 0`。事件仅保存脱敏摘要。
- `beforeToolCall`/`terminate` 不能替代服务端幂等和状态门禁；`agent.prompt()`/`waitForIdle()` 后才视为监听器完成。

来源：npm README、发布包 types、deepseek provider、openai-completions 实现（见审查记录）。依赖安装后的 Next.js bundling 需由构建验证。
