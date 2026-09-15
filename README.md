# AI Video Director

可运行的单页 MVP：上传参考视频、模特/商品图和创作要求，服务端用 FFmpeg 读取元数据、抽取 16 帧，加载原始 AI Commercial Video Director Skill 的 Schema，并生成三个结构化创意版本。默认 `mock` 会真实制作三个 8 秒本地转码预览，方便验证闭环；它不会冒充 AI 生成的广告成片。

## 启动

```bash
npm install
copy .env.example .env.local
npm run dev
```

打开 http://127.0.0.1:3000 。也可使用 `npm run build && npm start` 运行生产构建。

## 配置

`.env.local`：

- `VIDEO_PROVIDER=mock`：离线模式，FFmpeg 生成三个可播放的参考片转码预览。
- `VIDEO_PROVIDER=seedance`：调用 Seedance，必须同时设置 `SEEDANCE_API_KEY` 和 `SEEDANCE_MODEL`。
- `DIRECTOR_MODE=mock`：确定性离线导演 fixture，所有视觉分析明确标为 Unknown。
- `DIRECTOR_MODE=pi`：为真实导演运行预留的 Pi Agent 边界；本版本在缺少已验证视觉模型适配器时会 fail closed，不会伪造分析或提交付费任务。

Skill 原文件只读加载自 `DIRECTOR_SKILL_PATH`（默认 `C:\Users\JOHO\.codex\skills\ai-commercial-video-director`），其输出 Schema、动作连续性、三版本差异和 Seedance prompt 均在服务端校验。

## 一次完整流程

1. 上传 1–120 秒 MP4/MOV（≤100 MB），可上传最多 9 张 JPG/PNG/WebP。
2. 点击开始生成。任务写入 `data/projects/<task-id>`，包含原素材、`reference/metadata.json`、16 帧、`contact-sheet.jpg`、`director-output.json` 和 `generation-plan.json`。
3. 页面轮询任务状态，完成后显示 V1 轻奢时尚、V2 都市通勤、V3 活力街拍视频卡，可播放和下载。

## 当前限制

没有用户系统、批量矩阵、发布、自动 QC、复杂剪辑器或多租户。Mock 不执行视觉理解；真实 Pi 适配和 Seedance 的具体模型/账户权限需要在目标环境完成配置与验证。

## 验证

`npm run typecheck`、`npm run lint`、`npm run build`；另有 `npm run smoke` 入口用于具备本地示例视频时的端到端检查。当前未进行真实 Seedance 付费调用，也未进行 live-agent 评估。
