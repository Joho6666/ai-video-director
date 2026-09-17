# AI Video Director v1.1 · Pi Video Agent

上传参考视频、模特及商品图，经 DeepSeek Director 生成三份导演方案。生产模式增加成片首帧图，可勾选 V1/V2/V3 中的 1–3 条视频（默认 V1）。

## 运行模式

- `APP_MODE=director`：DeepSeek 分析和导演方案，无视频 Provider。
- `APP_MODE=mock`：离线流程演示，所有成片显著标注 DEMO ONLY。
- `APP_MODE=full`：DeepSeek → Production Agent → Router → Wan / MiniMax → 本地 MP4。

复制 `.env.example` 至 `.env.local`，填写需要的 Key。生产模式需要 DeepSeek 与视频 Provider Key（Wan 或 MiniMax）。通过 VIDEO_PROVIDER=wan|minimax 指定，或自动选用已配置的 Key。无 MiniMax 返回 Provider unavailable，不回退 Mock。旧 DIRECTOR_MODE、VIDEO_PROVIDER 不参与选择。Full 模式可直接上传参考视频和模特／商品图；未提供独立首帧时，服务端从参考视频提取首帧作为 image-to-video 输入。 当前参考视频只用于 Director 视觉分析，Wan 的真实提交仍是 image-to-video；对已有视频做 video-to-video 优化尚未接入。

MiniMax 已核实组合：`MiniMax-Hailuo-2.3`、1080P、6 秒，使用 `https://api.minimax.cn`。8 秒 Director timeline 按比例重排到 6 秒，再生成通用生产 Prompt。UI 在提交前显示实际组合；未核实的模型不接受提交。独立首帧图建议已包含人物与商品，服务端会自动补边至 1080×1920；未提供时 Full 模式从参考视频提取首帧作为 image-to-video 输入，不会将独立模特图和商品图伪装成多参考能力。打开 `/?new=1` 可开始一个不恢复最近任务的新视频任务。

```powershell
npm install
npm run dev -- --port 3080
```

## 验证

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run smoke
npm run provider-test
npm run provider-live -- --plan <generation-plan.json> --first-frame <image.jpg>
```

`provider-live` 仅显式生成 V1。缺 Key 输出 UNAVAILABLE 并退出 0；模拟接口测试不代表真实视频测试。build/smoke 前停止同目录开发服务器，避免共用 .next 缓存冲突。

## 状态与恢复

每个版本持久保存 `generation-tasks.json`，先写提交意图，再提交一次，拿到 task_id 后立即保存。已有 task_id 仅查询；无 task_id 但存在提交意图时要求人工核对，不自动再扣费。远程成功后还需下载并通过 FFprobe 检查才完成。部分失败保留成功版本。

`npm run production-resume -- <task-id>` 复用既有 plan 和生产记录。运行锁存在时不启动第二个 runner；进程异常退出留下的锁需要人工确认原进程停止后清理，系统不自动抢锁。旧 Seedance 任务仅查看，不恢复付费任务。

## 导出

Director 保留七文件白名单 ZIP。生产任务另含 director-plan.json、generation-request.json、provider-result.json（合计十文件）；不含素材、视频、Key、data URL、绝对路径或临时签名下载地址。MP4 在 results/ 单独提供下载。

## Provider 边界

Pi Runtime 0.85.1 作为编排层接入，保留确定性 WorkflowScheduler 作为安全执行层。真实视觉 QC 会对生成视频抽帧后调用 DeepSeek，并保存带帧证据的质量报告；不能把抽样静态图当作完整运动路径证明。Wan 优先用于本机 Live 入口，MiniMax 可配置，Seedance 与 Veo 保留适配器但本轮不做 Live 验收。

官方契约来源（已读取）：
- https://platform.minimax.cn/docs/api-reference/video-generation-i2v
- https://platform.minimax.cn/docs/api-reference/video-generation-query
- https://platform.minimax.cn/docs/api-reference/video-generation-download
