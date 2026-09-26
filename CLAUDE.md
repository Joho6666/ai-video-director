# AI Video Director · 开发交接说明

> 给 AI 编码助手（Claude Code 等）：这份文件是本项目当前的**真实状态**，包含已知缺陷与
> 不可违反的约束。请先读完再改代码。文中的"已实测""已验证"都指真的跑过，不是推测。

---

## 1. 这是什么

把「参考视频 → 导演方案 → 受控视频生成 → 质检」做成一条可复现的流水线。
当前形态：Next.js Web 应用（自带 GUI）+ 一套被 DeepSeek Harness 调用的插件。

**技术栈**：Next.js 15（App Router）+ React 19 + TypeScript + Zod + FFmpeg。
业务核心在 `packages/*`，与 GUI 解耦。

---

## 2. 运行方式

```bash
npm run dev        # 开发（http://127.0.0.1:3000）
npm run build      # 生产构建
npm start          # 生产启动
npm test           # tsx --test tests/*.test.ts   （当前 112 项全绿）
npm run typecheck  # tsc --noEmit
```

### APP_MODE（写在 `.env.local`，决定行为与是否花钱）

| 值 | 行为 | 是否扣费 |
| :--- | :--- | :--- |
| `mock` | 离线演示，Director 走 Mock 适配器，视频走 Mock Provider | 否 |
| `director` | **真实 DeepSeek 视觉分析**，只出导演方案，不生成视频 | DeepSeek token |
| `full` | 上面 + **真实视频生成**（MiniMax / Wan） | **真实视频费用** |

**改 `.env.local` 后必须重启服务才生效。**

`.env.local` 已 gitignore，内含真实密钥（DeepSeek / MiniMax / Wan / RedFox）。
TikHub 的 key 不在这里，而在 `data/projects/config/secrets.json`（GUI「服务连接」页写入）。

---

## 3. 架构与不可违反的约束

```
GUI (app/)  ─┐
             ├─→ packages/*  ←─ 确定性核心
dsh-plugin/ ─┘
```

核心原则：**LLM 决定做什么（WHAT），确定性代码决定付费/有状态操作怎么做（HOW）。**

### 以下约束是硬性的，改动前必须确认不会破坏

1. **付费提交只能经过 `packages/orchestrator`。**
   `WorkflowScheduler` 拥有提交、去重、重试预算、QC 门禁、恢复逻辑。
   任何工具/上层都不得直接调用 Provider 的 `createTask`。
   （实测教训：手工 POST MiniMax 生成接口会立刻产生一个不可取消的付费任务。）

2. **重试预算硬编码封顶**：`packages/skills/retry` 中 `MAX_RETRIES_PER_VARIANT = 1`；
   scheduler 侧对 Wan 限 1、其他限 2。上层不得放宽。

3. **QC 门禁**：下载完成的视频必须有**当前尝试**的质量报告才能标记 `COMPLETED`。
   （见缺陷 #1 —— 这个门禁目前会导致成片无法交付。）

4. **幂等与台账**：`generation-tasks.json` + `task.json` 必须一致；
   `MANUAL_VERIFICATION_REQUIRED` 表示提交结果不明，**永不重提交**。

5. **证据边界**：`Motion DNA v2` 要求"有置信度就必须给帧证据"，看不到必须标 `UNKNOWN`。
   不得为了让模型通过而放宽校验。

6. **Skill 只有一份**：`skills/ai-commercial-video-director/`。
   `packages/director/skill.ts` 会把 SKILL.md 哈希进 `skill_sha256`，
   复制第二份会导致指纹漂移。不要复制到 `.dsh/skills`。

---

## 4. 已知缺陷（按优先级 · 这是继续打磨的入口）

### ✅ P0-1 / P0-2 已修复（2026-09-26）

- `partitionOffContractEvidence`（`packages/skills/quality/index.ts`）：越界维度名的 evidence
  移入 `discarded_evidence` 留档，不参与门禁；但若它是 observed + medium/high 缺陷则抛错，
  交给修复轮重出。维度枚举与四维覆盖校验不变。
- `completeJsonWithRepair`（`packages/shared/llm-json-repair.ts`）：schema/JSON 失败时
  带错误清单重出**一次**，用同一个严格校验器复验；截断/空响应不重试。
  QC（含盲评）与 Director（信封 + Motion DNA v2）已接入，元数据记在
  `request_meta.repair` / `requestMeta.schemaRepair`。只花 DeepSeek token，不动生成重试预算。
- 以下两节保留作历史记录。

### 🔴 P0-1 · QC 输出缺少 schema 容错，成片永远无法交付

**现象**：真实生成成功、视频已下载到 `results/V1.mp4`，但任务被标记 `FAILED`。

**原因**：质检模型（`deepseek-flash`）在 `evidence[].dimension` 里返回了
schema 中不存在的枚举值 `reference_similarity`，Zod 校验直接抛错：

```
invalid_enum_value: path ["evidence", 12, "dimension"]
received "reference_similarity"
expected motion_naturalness | human_realism | product_consistency |
         commercial_quality | human_feeling | product_fidelity | camera_execution
```

**影响**：任务 `FAILED`、导出包不完整，但视频文件其实是好的。
**每次生成都会卡在这里。**

**建议方向**：在 QC adapter 层做输出规范化或有限重试（拒绝越界维度名并要求重出，
或映射到最近的合法维度），**不要把 7 个维度放宽成任意字符串** —— 那会削弱 QC。

相关位置：`packages/skills/quality/index.ts`、`packages/orchestrator/agents.ts` 的 `QualityAgent`。

### 🔴 P0-2 · 两类 adapter 都缺「schema 失败重试」

目前只有一次针对 Unknown 冲突的修复（`repairUnknownConflicts`），
没有针对 **schema 校验失败** 的自动重试。

已实测撞上两次：
- Motion DNA v2 的 14 个字段各自要求帧证据（假素材时全失败）
- QC 的维度枚举越界（缺陷 #1）

**方向**：一次「带错误信息的重出」，上限 1 次，且不得放宽校验。

### 🟠 P1 · director → full 无法原地转换

director 模式跑完分析后 `task.status = 'COMPLETED'`。
但 `packages/agent/production.ts:46` 把 `COMPLETED` 当作"生产已开始"：

```js
const productionStarted = Boolean(task.generationTasks?.length)
  || task.results.some(r => r.status !== 'waiting' || r.providerTaskId)
  || ['GENERATING','REVIEWING','RETRYING','COMPLETED'].includes(task.status);
```

于是 `loadGenerationTasks` 拒绝返回空台账，报
`generation-tasks.json missing after production started`。

**根因**：director 的 `COMPLETED`（分析完成）与 full 的 `COMPLETED`（成片完成）语义冲突。
**方向**：要么给两种模式不同的终态语义，要么在 `loadGenerationTasks` 里区分
"从未提交过付费尝试"（`generationTasks` 为空且 `providerTaskId` 为空）与"生产被中断"。

### 🟠 P2 · 任务创建逻辑仍在 HTTP route 里

`app/api/tasks/route.ts` 承担了上传校验、首帧预览、指纹、幂等、任务落盘的全部逻辑，
未下沉到 `packages/`。后果：`dsh-plugin` 的 `video_analyze` / `video_produce`
**只能操作已存在的任务**，无法自主建任务。

**方向**：把这段逻辑抽成 `packages/` 里的纯函数（不含 Next.js 依赖），
route 与插件共用同一实现。**不要出现第二套实现。**

### 🟠 P2 · RedFox provider 是空壳

`packages/reference-source/providers/redfox.ts` 只有 5 行，两个方法都直接
`throw new Error('RedFox Provider 尚未实现')`。
`secrets.ts` 已支持 `redfox` 配置项，但没有任何调用路径。
实现它需要 RedFox 的 API 文档 —— **不要凭空猜接口**。

### 🟡 P3 · TikHub 搜索的 `limit` 不精确

传 `limit: 5` 实测返回 7 条。`TikHubProvider.search` 把 limit 透传给上游，
上游不严格保证条数。建议在返回前本地截断。

### 🟡 P3 · `data/` 下累积了 141 个任务目录

含大量测试残留。它们的 `task.json` 都在，但素材是测试用的占位文件。
清理前请确认不误删真实任务。

### ⚪ 环境问题（非代码）

- 本地 LLM 通道（CLIProxyAPI 转发）**很慢**：一次 headless 任务约 15 分钟。
  4000 tokens 输出约 48 秒。不要把超时设得太短。
- DSH 桌面 App 是 `0.1.7-rc.2`，全局 `dsh` CLI 是 `0.1.0-rc.6`，
  两者 `.credentials.yaml` 的 `version` 类型要求不同（数字 vs 字符串）。

---

## 5. dsh-plugin（DeepSeek Harness 插件）

把 4 个高层工具暴露给 Harness，**全部薄封装，无业务逻辑**：

| Tool | 作用 | 委托给 |
| :--- | :--- | :--- |
| `video_reference` | search / resolve / import 参考视频 | `packages/reference-source` |
| `video_analyze` | 导演分析，出 Shot DNA / Motion DNA / V1-V3 | `DirectorAgent` |
| `video_produce` | 受控生产（生成 + 质检 + 预算内重试） | `WorkflowScheduler`（`skipPi`） |
| `video_inspect` | 只读审计（不取锁、不改状态、不调 Provider） | `task.json` + `agent-run.json` |

### 分层（改代码时保持）

```
src/index.ts        唯一 import Harness 运行时的文件（defineTool + ctx.tools.register）
src/plugin-meta.ts  name / inject / 工具清单（DSH-free，可单测）
src/tools/*.ts      纯描述符（DSH-free，可单测）
src/adapters/*      任务查询、参数校验、素材路径、Skill 发现校验
src/dsh.d.ts        抄录自真实安装包的 host 契约（非猜测）
```

### 已实测通过

v1.4 全量 typecheck、真实 `defineTool` 加载并注册 4 个 tool、
`video_inspect` 读真实任务、`video_reference` 真实调 TikHub、
`video_analyze` 成功且幂等、`video_produce` 在 director 模式正确拒绝，
以及 headless Harness 会话自主编排多工具。

### 两个必须知道的坑

1. **Harness 版本差异**：`@deepseek-ai/dsh-tools@0.1.0-rc.6`（全局 CLI）
   **强制要求每个 `type:'object'` schema 节点显式声明 `additionalProperties`**，
   省略会在注册时抛 `JsonSchemaError`。桌面版 0.1.7-rc.2 不报错。
2. **运行需要 TS-aware 解析器**：插件入口是 TS 源码且用无扩展名相对导入，
   Node 原生类型擦除不会补扩展名，必须 `node --import tsx <dsh bin.js> --profile <name>`。

### 接入方式（已建立，勿删）

```powershell
# 让插件解析到 DSH 包
mklink /J <项目>/node_modules/@deepseek-ai `
          "%USERPROFILE%\.npm-global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai"
# 让 profile 解析到插件
mklink /J "%USERPROFILE%\.dsh\profiles\avd\node_modules\dsh-plugin-ai-video-director" <项目>/dsh-plugin
```

配套 profile：`~/.dsh/profiles/avd/`（`cordis.patch.yml` 已配好插件 + skill 目录 + LLM 通道）。
**桌面 App 的 `profiles/desktop` 与 `.credentials.yaml` 未被改动，请保持。**

---

## 6. 关键文件地图

```
packages/
  shared/          storage(任务读写/幂等/锁) types config(APP_MODE) motion-dna.schema exports
  reference-source/  TikHub 客户端 · scoreViral · SSRF 防护下载器 · 暂存
  video-analysis/  FFmpeg 抽帧 / 联系表 / ffprobe
  director/        Skill 加载与哈希 · compileTreatment · checkPlan
  agent/           deepseek(Director 适配器) production(生成/下载/台账) runner(任务锁)
  orchestrator/    scheduler(付费守卫核心) agents(Director/Producer/Generator/Quality/Retry) state workflow
  skills/          producer · quality · retry
  video-provider/  router(唯一路由权威) providers/{minimax,wan,mock,seedance,veo}
  server/          secrets(GUI 设置页的密钥存储，支持 deepseek/wan/minimax/seedance/tikhub/redfox)
app/api/           tasks · references · media · settings · system · benchmark
dsh-plugin/        Harness 插件
skills/ai-commercial-video-director/   Director Skill（唯一一份）
tests/             112 项测试
```

### 数据流

```
上传素材 → task.json + uploads/
   ↓ DirectorAgent
reference/frames/ + contact-sheet.jpg → DeepSeek 视觉分析 → generation-plan.json
   ↓ WorkflowScheduler
generation-tasks.json(台账) → Provider → results/V*.mp4 → QualityAgent → agent-run.json
```

---

## 7. 改代码时的纪律

1. **先跑 `npm test` 确认基线**（应 112 项全绿），改完再跑一次。
2. **不要为了迁就模型而放宽校验**（schema、证据帧、维度枚举）。放宽 = 削弱产品。
3. **不要引入第二套实现**。同一能力只允许一处实现，GUI 与插件共用。
4. **不要在测试里产生付费调用**。需要真实 Provider 的路径必须显式标记且默认跳过。
5. `APP_MODE=full` 会产生**真实费用**。跑任何生成前先确认当前模式。
6. 提交前跑 `npm run typecheck`；构建若失败先确认不是环境问题
   （`node_modules` 里若有指向别处的 junction，Next/webpack 会解析出非法路径）。

---

## 8. 建议的打磨顺序

1. **P0-1 QC schema 容错** —— 不修则每次生成都白花钱且交付不了。
2. **P0-2 adapter schema 重试** —— 一并解决 Motion DNA 与 QC 两类脆弱点。
3. **P1 director→full 状态语义** —— 让"先分析、满意后再生成"成为正常工作流。
4. **P2 任务创建下沉到 packages** —— 顺带解锁 Harness 自主建任务。
5. **P3 limit 截断 / 数据清理 / RedFox 实现（需 API 文档）**。
