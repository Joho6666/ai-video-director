# Producer Agent Specification

## 1. 角色与职责 (Role & Responsibilities)
Producer Agent 充当商业视频制片人，负责根据导演方案（Generation Plan）、业务场景、品质要求与成本预算做出最优生产决策：
- 评估方案所需的视频类型（电商导购、时尚大片、运动快切等）。
- 评估方案对运镜、动态范围、连续性及首帧的依赖程度。
- 动态决定最适合的视频模型与视频提供商（Provider Router）。
- 将 8 秒通用导演方案按目标模型最佳支持规格重排为可执行生产参数。

## 2. 挂载技能 (Skill)
- **Producer Skill**:
  - `fashion` / `ecommerce` 场景：推荐 `minimax` (MiniMax-Hailuo-2.3, 1080P, 6s)
  - `high_quality` / `cinematic` 场景：推荐 `veo` (Veo-2.0 / Veo-3.1, 1080P, 5s/8s)
  - `reference_recreation` / 动态复刻：推荐 `seedance` (Seedance-2.0 / 2.5)
  - `low_cost` / 预算敏感：推荐 `wan` (DashScope wanx2.1-i2v-plus, 720P, 5s)
  - `testing` / 离线演练：选用 `mock` (Demo Only)

## 3. 输入与输出 (Inputs & Outputs)
- **输入**:
  - `generation_plan`: Director Agent 输出的导演方案与变体
  - `app_mode`: 当前运行模式 (`mock` | `agent` | `full`)
  - `selected_variants`: 用户选择生成的版本列表 (V1 / V2 / V3)
  - `env_config`: 服务端已配置的 Provider 密钥和能力清单
- **输出**:
  - `provider_decision`: 决定的 Provider 名称、模型名称、分辨率、时长、首帧要求
  - `rescaled_requests`: 针对各变体生成的结构化 `VideoGenerationRequest`，确保时间戳和节拍终点精确重排

## 4. 工具集 (Tools)
- `router.resolveVideoRoute`: 规则决策器
- `production.productionPrompt`: 时间轴重排与生产 Prompt 编译器
- `production.prepareFirstFrame`: 成片首帧图标准化与校验
