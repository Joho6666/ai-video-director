# Architecture

运行模式由唯一的 `APP_MODE` 决定：

- `mock`: `Web → task API → FFmpeg → Mock Director → generation-plan.json → Mock Provider`，生成明确标记为 `MOCK DEMO / PIPELINE PREVIEW` 的本地参考片转码。
- `director`: `Web → task API → FFmpeg → DeepSeek Director → original Director Skill → generation-plan.json → export package`，完成后不创建 `results/` 或 MP4。
- `full`: `Web → task API → FFmpeg → DeepSeek Director → original Director Skill → generation-plan.json → Seedance Provider → results`。

Web 只负责素材输入、状态轮询、最近任务和结果展示。API 校验类型、大小、扩展名、模式和必需的模特／商品图片，使用原子 JSON 写入保存任务。每个任务有持久 `runtime.json`、幂等提交记录和 `run.lock`；同一个 `Idempotency-Key` 不会创建第二个任务，已有 Seedance `providerTaskId` 时只继续轮询。

`video-analysis` 使用 ffprobe 获取 duration/fps/resolution，并按 ≤10s、≤20s、>20s 分别抽取 16、24、32 张均匀静态帧，同时生成对应列数的联系表和有序 `frames.json`。时间戳表达均匀采样位置；静态抽帧无法证明完整动作路径，快速步态、脚接触、微表情和帧间过渡必须标为 Inferred 或 Unknown。

DeepSeek Adapter 用一次官方 JSON Chat Completion 发送连续抽样帧、联系表、模特图、商品图和只读 Skill。返回值经过 `reference_evidence` 帧追溯、Evidence 与分析交叉校验、原 Skill Schema、2–4 Beat 连续性、2–4 商品展示动作、实际三版本差异和 Prompt 压缩校验。

任务状态是 `UPLOADED → ANALYZING_REFERENCE → EXTRACTING_SHOT_DNA → PLANNING_VARIANTS → (GENERATING_V1/V2/V3) → COMPLETED`；Director 模式跳过生成阶段，直接在方案与导出包写入后完成。任一步失败会写入 `FAILED` 与可读错误。导出 ZIP 只包含七个固定普通文件，不包含原始素材、抽样帧、视频、API 响应或密钥。
