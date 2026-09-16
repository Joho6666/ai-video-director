# AI Video Director v0.4 — Director-First

可运行的单页 MVP：`Reference Video → FFmpeg → Director → generation-plan.json → optional Seedance`。FFmpeg 根据视频时长均匀抽取 16、24 或 32 张静态帧；DeepSeek 分析这些抽样画面，并不原生读取 MP4，也不保证观察到帧间完整动作路径。

## 启动

```bash
npm install
copy .env.example .env.local
npm run dev
```

打开 http://127.0.0.1:3000 。也可使用 `npm run build && npm start` 运行生产构建。

## 配置

`.env.local`：

- `APP_MODE=mock`：离线流程预览，使用 Mock Director 和本地 FFmpeg 参考片转码，不代表 AI 广告成片。
- `APP_MODE=director`：使用官方 `deepseek-flash` 读取有序参考帧、联系表和全部模特／商品图，只输出三套导演方案和导出包，不生成视频。需要 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL`。
- `APP_MODE=full`：DeepSeek Director 加 Seedance Provider，需要同时设置 `DEEPSEEK_API_KEY`、`SEEDANCE_API_KEY` 和 `SEEDANCE_MODEL`。

旧的 `DIRECTOR_MODE` 和 `VIDEO_PROVIDER` 仅作为历史配置参考，不再参与运行决策；请迁移到 `APP_MODE`。

Skill 原文件只读加载自 `DIRECTOR_SKILL_PATH`（默认 `C:\Users\JOHO\.codex\skills\ai-commercial-video-director`），其输出 Schema、动作连续性、三版本差异和 Seedance prompt 均在服务端校验。

## 一次完整流程

1. 上传 1–120 秒 MP4/MOV（≤100 MB），至少一张模特图和一张商品图，合计最多 9 张 JPG/PNG/WebP。
2. 点击开始生成。任务写入 `data/projects/<task-id>`，包含原素材、动态帧、`frames.json`、`contact-sheet.jpg`、Evidence、Director 输出、runtime 和 generation plan。
3. `director` 模式完成后显示 V1/V2/V3 导演方案卡，可复制 Prompt 或下载严格白名单导出包；`mock` 模式显示三个明确标注的流程预览视频。

## 当前限制

没有用户系统、批量矩阵、发布、自动 QC、复杂剪辑器或多租户。Mock 不执行视觉理解；DeepSeek 会进行单次真实视觉 Director 调用，失败时不会自动回退或重试。静态抽帧不能证明完整动作路径，快速步态、脚接触、微表情和帧间过渡只能标为 Inferred 或 Unknown。Seedance 的具体模型和账户权限仍需在目标环境配置。

## 验证

运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`、`npm run smoke`。`npm run director-smoke` 在 Key 存在时强制 `APP_MODE=director`，运行一次真实视觉 Director 并验证 Evidence、plan、runtime、导出包和无视频结果；缺 Key 时明确输出 UNAVAILABLE。`npm run ab -- --reference-a ... --reference-b ... --model ... --product ...` 比较两个客户参考；客户素材、Key、生成视频与 `data/` 不进入 Git。
