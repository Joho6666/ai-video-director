# AI Video Director v1.0 · Pi Video Agent 生产系统报告

## 一、架构升级概述

AI Video Director 从单步 Prompt 生成工具正式升级为 **Pi Agent 驱动的商业视频生产操作系统 (AI Video Production OS)**。系统不再将视频创作简化为单次静态提示词拼接，而是构建了由多智能体协作闭环的工业化生产链路：

```
                    ┌─────────────────────────┐
                    │  Pi Agent Orchestrator  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     Workflow Engine     │
                    └────────────┬────────────┘
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     │                           │                           │
┌────▼──────────┐       ┌────────▼───────┐          ┌────────▼────────┐
│ Director Agent│──────>│ Producer Agent │─────────>│ Generator Agent │
└───────────────┘       └────────────────┘          └────────┬────────┘
                                                             │ (新生成视频)
                                                             │
                                                    ┌────────▼────────┐
                        ┌───────────────────────────│  Quality Agent  │
                        │ (未达标, 重试次数 < 2)     └────────┬────────┘
                        │                                    │ (通过 / 达上限)
               ┌────────▼───────┐                            │
               │  Retry Agent   │────────────────────────────┤
               └────────────────┘ (调优提示词重跑 Generator)   │
                                                             ▼
                                                    ┌─────────────────┐
                                                    │ 最终推荐与交付   │
                                                    │ (V1/V2/V3 + 推荐)│
                                                    └─────────────────┘
```

---

## 二、Agent 列表与职责分工

系统设立了 5 个核心专业 Agent，每个 Agent 均具备独立的系统设定、输入输出契约与对应规范（位于 `agents/` 目录）：

| Agent 名称 | 定义文件 | 核心职责 | 输入 | 输出 |
| :--- | :--- | :--- | :--- | :--- |
| **Director Agent** | `agents/director.md` | 视频多模态时空理解、真人连续动作规划、镜头语言解析 | 参考视频切帧序列、模特/商品图、需求文字 | Shot DNA、动作连续性设计、商品展示动作、三套导演方案 |
| **Producer Agent** | `agents/producer.md` | 生产策略与模型路由调度、时长与分辨率对齐 | Generation Plan、任务类型、环境变量配置 | 生产决策 (选定 Provider、模型、有效时长、分辨率及选型依据) |
| **Generator Agent** | `agents/generator.md` | 统一调用视频生成底层、异步轮询、任务进度管理与产物落地 | 结构化视频生成请求、成片首帧 | 本地标准 MP4 视频产物、生成任务状态落盘 |
| **Quality Agent** | `agents/quality.md` | 4 维严苛商业成片审核（动作自然度、真人感、商品展示、运镜平滑） | 生成的视频流、对应方案契约、生成尝试次数 | 综合评分 (0-100)、分项得分、缺陷诊断列表、改进建议 |
| **Retry Agent** | `agents/retry.md` | 基于质检缺陷定位的提示词定向优化微调，严格限制最多重试 2 次 | 质检报告、上一轮生成请求、当前重试轮次 | 调优后的定向生产 Prompt、重试策略记录 |

---

## 三、Skill 体系与核心逻辑

1. **Producer Skill (`packages/skills/producer/`)**：
   - 根据任务类型与配置自适应选择最优性价比路线：
     - 时尚/电商穿搭场景优先选择 **MiniMax**（织物与肢体形态稳定）；
     - 高性价比大批量策略选择 **阿里 Wan2.1**；
     - 强动作复刻需求支持 **火山 Seedance**；
     - 电影级品质支持 **Google Veo**；
     - 本地演练保持 **Mock** 管道。
   - 严禁静默回退，无可用提供商时明确报告 `Provider unavailable`。

2. **Quality Skill (`packages/skills/quality/`)**：
   - 包含四维评分指标（各 25 分，满分 100 分，通过阈值 75 分）：
     - `motion_naturalness`：动作过渡连贯度、无瞬变/骨骼形变；
     - `human_feeling`：真人松弛感、眼神视线自然度；
     - `product_presentation`：人手与商品持续接触、卖点特写展示充分；
     - `camera_execution`：运镜轨迹平稳度、9:16 比例与时长合规性。

3. **Retry Skill (`packages/skills/retry/`)**：
   - 严格执行 `MAX_RETRIES_PER_VARIANT = 2`；
   - 拒绝无效的整段重写或加入虚假形容词，采用**靶向补偿机制**（如针对肢体瞬变注入 `weight shifts naturally to the rear foot`，针对商品展示注入 `Hands maintain continuous, firm contact`）；
   - 输出提示词控制在可执行字符长度预算内。

---

## 四、Workflow 状态机与状态跃迁

生产流程由 `WorkflowStateManager` 强校验控制，状态只能沿合规路径跃迁：

```
CREATED ──> ANALYZING ──> PLANNING ──┬──> GENERATING <──> REVIEWING ──> COMPLETED
  │              │            │      │        │                │            ▲
  │              │            │      │        │ (失败重试)     │ (未达标)   │
  │              │            │      │        └─── RETRYING ───┘            │
  │              │            │      │                                      │
  │              │            │      └───> (Agent/Director 规划完成) ───────┘
  ▼              ▼            ▼                       ▼
FAILED <────── FAILED <──── FAILED <────────────── FAILED
```

- **全流程日志审计**：每次运行均在 `data/projects/<task-id>/agent-run.json` 记录完整的状态跃迁、时间戳、Producer 决策、各版本 Quality 报告、Retry 历史轨迹以及最终智能体推荐依据。

---

## 五、统一 Provider Layer

底层视频生成适配器全部实现统一的 `VideoGenerationProvider` 契约（`packages/video-provider/`）：
- **MockProvider**：全流程测试与本地离线演练；
- **MiniMaxProvider**：MiniMax-Hailuo-2.3 真实图生视频接口；
- **WanProvider**：阿里云 DashScope Wan2.1-i2v 真实视频生成接口；
- **SeedanceProvider**：火山方舟 Seedance 统一实现；
- **VeoProvider**：Google Veo 适配器规范。

---

## 六、前端交互升级

1. **AI 生产流程 5 步看板**：
   - 完整模式：`分析参考视频` → `制定导演方案` → `选择生成模型` → `生成视频中` → `AI质量审核`
   - 规划模式：`分析参考视频` → `制定导演方案` → `选择生成模型` → `方案就绪` → `导出创作包`
2. **AI 推荐首选横幅**：
   - 在结果区域顶端展示 `⭐ AI 推荐首选：Vx (综合评分 88/100)` 及其选型依据。
3. **卡片品质徽章**：
   - 视频卡片实时展示 AI 质检评分与反馈标签，推荐首选版本带有专属金色徽标。
4. **版本标识**：
   - 侧边栏及全局页脚统一更新为 `v1.0 · Pi Video Agent`。

---

## 七、测试验证汇总

| 验证项 | 测试范围 | 状态 | 说明 |
| :--- | :--- | :--- | :--- |
| **单元测试 (Unit Tests)** | `tests/*.test.ts` (37 项测试) | **PASS** | 包含状态机校验、路由决策、质检评分、重试限制及端到端 Mock 闭环 |
| **类型检查 (Typecheck)** | `npm run typecheck` (`tsc --noEmit`) | **PASS** | 全工程 TypeScript 类型零错误 |
| **代码规范 (Lint)** | `npm run lint` (`eslint .`) | **PASS** | 全工程代码规范零警告、零错误 |
| **生产构建 (Build)** | `npm run build` (`next build`) | **PASS** | 静态页面与 API 路由编译完全正常 |
| **端到端冒烟测试 (Smoke)** | `npm run smoke` | **PASS** | 本地拉起独立服务，8 秒参考视频抽帧与视频生产完全通过 |
| **Provider 专项测试** | `npm run provider-test` (16 项测试) | **PASS** | 覆盖 Mock、MiniMax、Wan 映射及异常分支 |
| **服务运行状态** | `http://127.0.0.1:3080/` | **RUNNING** | 本地生产服务已热加载最新 v1.0 成果并正常响应 |

---

## 八、当前限制与边界

1. **密钥与环境依赖**：
   - 真实 DeepSeek 分析依赖 `DEEPSEEK_API_KEY`；
   - 真实 MiniMax 生成依赖 `MINIMAX_API_KEY`；
   - 真实 Wan 生成依赖 `WAN_API_KEY` 或 `DASHSCOPE_API_KEY`；
   - 本地未配置密钥时系统严禁伪造成功，将准确阻断并报告 `UNAVAILABLE`。
2. **重试上限保护**：
   - 为避免非预期的 API 账单消耗，当前单版本最大重试轮次固定为 2 次，达到上限后将保留最新视频产物并记录质检提示。
