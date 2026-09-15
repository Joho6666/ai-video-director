# Architecture

`Web → task API → Pi/Mock Agent → original Director Skill → generation-plan.json → Seedance/Mock Provider → playable results`

Web 只负责素材输入、状态轮询和结果展示。API 校验类型、大小、扩展名和配置，使用原子 JSON 写入保存任务。`video-analysis` 使用 ffprobe 获取 duration/fps/resolution，再以 FFmpeg 抽取 16 帧和联系表。`director` 读取 `C:\Users\JOHO\.codex\skills\ai-commercial-video-director` 的原始提示词和 Schema，离线模式将未知视觉证据显式标记，并执行结构差异、时间线连续性和 prompt 完整性校验。`video-provider` 提供 `createTask/getTaskStatus/getResult`，Seedance 适配器只负责 HTTP 任务生命周期；Mock 适配器使用 FFmpeg 生成可播放预览。

任务状态是 `UPLOADED → ANALYZING_REFERENCE → EXTRACTING_SHOT_DNA → PLANNING_VARIANTS → GENERATING_V1/V2/V3 → COMPLETED`，任一步失败会写入 `FAILED` 与可读错误。服务重启时未完成任务会标记中断，保留 Provider task ID，避免重复提交。
