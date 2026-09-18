# AI Video Director v1.3: End-to-End Reliability & Provider Hardening
**Role**: Subagent B (E2E Reliability Engineer)
**Status**: APPROVED & ADOPTED
**Date**: 2026-09-18

---

## 1. 历史故障根本原因分析 (Root Cause Analysis of Wan Poll/Download Failure)

在 v1.1 实机运行记录 (`REAL_E2E_REPORT.md`) 中，出现了 `Wan submission PASS` 但 `Wan query/download FAIL` 的现象。经过实地探查，锁定了三大诱因：

1. **轮询瞬态网络抖动被误判为致命失败**：
   - 阿里云 DashScope 视频生成耗时通常在 6~9 分钟（历史任务 `a94cb13a-72c4-4c01-895e-8d047c745f4e` 实际耗时 8 分 18 秒并在远端 `SUCCEEDED`）。
   - `WanProvider.request` 在 GET 查询状态时仅设置了 3 次极短重试（500ms, 1000ms）。在漫长的长轮询过程中，任意一次公网路由抖动或 Socket 瞬断均直接抛出 `Wan query connection failed`，导致外层 `executeGeneration` 捕获后直接将本地任务标记为 `FAILED`，实际上云端正在正常渲染。
2. **Undici Fetch 连接超时与 OSS 节点特征**：
   - 生成完毕后，DashScope 返回乌兰察布节点 OSS 签名链接（`dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com`）。
   - Windows 环境下 Node.js 22 内置 Undici fetch 对某些带有专网路由特征的 OSS 节点偶发 `UND_ERR_CONNECT_TIMEOUT`，而原生 Node `https.get` 分块流式管道可在 2~4 秒内平滑拉取 26MB 完整文件。
3. **OSS 预签名 URL 对 HTTP 方法的严格鉴权**：
   - 阿里云 OSS 的 GET 预签名 URL 将 HTTP Method 作为签名元数据的一部分，若以 `HEAD` 方法嗅探会触发 `403 SignatureDoesNotMatch`。下载与校验必须统一使用 `GET` 流式读取。

---

## 2. Provider 轮询与下载高可用加固设计

为保障真实生产与 Benchmark 不因网络抖动中断，落地如下韧性策略：

### A. 查询状态自愈与退避重试
- 在 `WanProvider.request` 查询逻辑中，将 GET 重试次数提升至 5 次，引入指数退避（1s, 2s, 4s, 8s），并捕获具体底层错误信息（不再生硬屏蔽为通用字符串）。
- 在 `packages/agent/production.ts` 的 `executeGeneration` 轮询主循环中增加连续容错门限：允许最多连续 5 次查询网络瞬态异常（记录 warning 并休眠后重试），不直接把已受理的生成任务置为 `FAILED`，确保等待云端视频生成完毕。

### B. 多重流式下载韧性引擎 (`downloadVideo`)
- 重构 `downloadVideo`，提供 3 次重试机制及独立 120 秒流式读取超时。
- 引入优先 Fetch、故障无缝回退 Node 原生 `https.get` 分块流式落盘的健壮机制。
- 落地 `.partial` 临时文件机制，下载完毕后执行 `validateVideo(temp, duration)`，确认完整合规后再通过原子重命名成为正式视频产物。

---

## 3. 防重复扣费账本机制 (Idempotency & Anti-Double-Billing Ledger)

真实视频生成涉及付费 API 消耗，系统严格执行零重复扣费铁律：

```
[准备生成]
    │
    ▼
1. 持久化本地 Intent (status: PENDING, submission_started_at)
    │
    ▼
2. 发起远端 createTask() ──(网络异常/超时/结果不确定)──► 标记 MANUAL_VERIFICATION_REQUIRED，严禁自动重提！
    │
    ▼ (成功获取 remote task_id)
3. 立即原子落盘 remote task_id (status: SUBMITTED)
    │
    ▼
4. 后续所有恢复、重启、轮询：仅允许查 remote task_id，绝不再次调用 createTask()！
```

- **状态不可逆规则**：一旦任务获得远程 `task_id`，无论外部环境如何变化（进程重启、断网重连、模式切换），**严禁重新提交生成**。
- **不确定状态隔离**：若向服务商提交时发生超时或连接重置，无法证明远端是否扣费建单，任务状态立即转为 `MANUAL_VERIFICATION_REQUIRED`，要求人工核实，不得发起自动重试。

---

## 4. 严苛真实 MP4 准入质检门禁 (Real MP4 Gate)

视频在交给下游 Quality Agent 质检前，必须顺序通过全部硬件级检查：
1. **文件存在与大小门禁**：本地文件存在且 `size > 100KB`。
2. **FFprobe 元数据结构校验**：能被 `ffprobe` 正确反序列化，无非法 MOOV/ATOM 损坏。
3. **视频流校验**：至少包含 1 条有效 `codec_type === 'video'` 流，且分辨率合规（如 720x1280 或 1080x1920）。
4. **有效播放时长校验**：解析的时长数值合法，且与目标生成时长偏差在合理缓冲范围（例如 5 秒任务时长在 4.5~5.5 秒之间）。

任何一项不满足，严格置为 `Generation FAIL`，绝不允许残损视频或空文件流入质检阶段。
