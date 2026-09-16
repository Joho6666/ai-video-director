# Architecture · v0.5

唯一模式配置为 APP_MODE：

- mock：Web → Task API → FFmpeg → Mock Director → plan → Production Agent → Mock Provider。视频显著标记 DEMO ONLY。
- director：Web → Task API → FFmpeg → DeepSeek → 只读 Director Skill → plan → 七文件导出。不生成视频。
- full：同一 Director 链路 → Production Agent → Router → Wan / MiniMax → 本地 MP4 → 十文件导出。

Provider 接口统一为 name、capabilities、createTask、getTaskStatus、getResult。Mock、MiniMax 与 Wan（DashScope wanx2.1-i2v-plus）可路由；Seedance 旧代码保留但不路由，Veo 明确未实现。不自动重试或降级。

全模式上传独立成片首帧图，按比例缩放补边为 1080×1920。模特图、商品图仅用于 Director；MiniMax 使用单张已包含人物及商品的首帧。当前验证的 MiniMax-Hailuo-2.3 高质量能力为 1080P/6 秒。Production Agent 重排原 8 秒 timeline 后编译通用 Prompt，原始 plan 不改写。

每个选中版本持久保存 GenerationTask。提交意图在 POST 前落盘；远程 ID 返回后立即落盘。恢复时读取 generation-tasks.json，已有 ID 只能查询。无 ID 且有提交意图视为结果不明，需人工核对。任务锁与 Idempotency-Key 阻止并发重复执行。远程成功后下载并 FFprobe 校验时长、比例、视频流，再标记 COMPLETED。部分失败保留成功视频。

FFmpeg 按 ≤10s、≤20s、>20s 抽取 16/24/32 张均匀静态帧，生成联系表和有序清单。时间戳是均匀采样位置，不能证明完整运动轨迹。DeepSeek 单次请求包含帧、联系表、模特和商品图片；不包含新增首帧。保持 Skill Schema、Evidence、连续性、实际三版本差异和 Prompt 校验。

Director ZIP 保持七文件白名单；生产增加 director-plan.json、generation-request.json、provider-result.json。导出拒绝 symlink 和超限文件，不含素材、MP4、密钥、data URL、绝对路径、签名下载地址。视频单独下载。

本地 runtime、任务锁、幂等记录及生产记录不进入 Git。异常退出遗留锁需要人工确认原进程已停止后处理。真实 MiniMax 质量只能通过具备凭证的显式 live 测试验收，模拟 HTTP 测试不能替代。
