# Architecture

`Web → task API → DeepSeek/Mock Director → original Director Skill → generation-plan.json → Seedance/Mock Provider → playable results`

Web 只负责素材输入、状态轮询和结果展示。API 校验类型、大小、扩展名和配置，使用原子 JSON 写入保存任务。`video-analysis` 使用 ffprobe 获取 duration/fps/resolution，并按 ≤10s、≤20s、>20s 分别抽取 16、24、32 张均匀静态帧。DeepSeek Adapter 用一次官方 JSON Chat Completion 发送这些抽样帧、联系表、模特图、商品图和只读 Skill；抽帧间无法确认的路径必须标为 Inferred 或 Unknown。`director` 随后执行原 Schema、Evidence、结构差异、时间线连续性和 Prompt 完整性校验。

任务状态是 `UPLOADED → ANALYZING_REFERENCE → EXTRACTING_SHOT_DNA → PLANNING_VARIANTS → GENERATING_V1/V2/V3 → COMPLETED`，任一步失败会写入 `FAILED` 与可读错误。服务重启时未完成任务会标记中断，保留 Provider task ID，避免重复提交。
