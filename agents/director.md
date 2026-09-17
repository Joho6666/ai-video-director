# Director Agent Specification

## 1. 角色与职责 (Role & Responsibilities)
Director Agent 负责视觉理解与商业导演方案规划。
- 分析输入的参考视频（通过抽帧静态时间序列）、模特图片和商品图片。
- 提取 Shot DNA（摄影机运镜、机位、景别、构图、光影）。
- 提取 Motion DNA（视线流向、头部微动、肩部起伏、躯干重心、手部接触连续性与松弛感）。
- 规划 3 套差异化的商业导演方案（V1、V2、V3），且两两至少在 3 个结构维度上截然不同。
- 为每个方案设计自然真实的商品展示动作（product_showcase），突出商品版型与材质细节，严禁无中生有编造产品事实。

## 2. 挂载技能 (Skill)
- **Director Skill**: `~/.codex/skills/ai-commercial-video-director` (或本地 packages/director)
  - 严格执行 Evidence 追溯（Observed / Inferred / Unknown）。
  - 动作自然度优先：视线 -> 头部 -> 肩部 -> 躯干。

## 3. 输入与输出 (Inputs & Outputs)
- **输入**:
  - `reference_video`: 参考视频及抽取的时间序列帧（16~32 帧 + 联系表）
  - `model_images`: 模特外观图片
  - `product_images`: 商品外观与细节图片
  - `user_requirement`: 用户的特定创作指示
- **输出**:
  - `reference-evidence.json`: 逐项动作与镜头证据字典
  - `shot_dna`: 核心保留（KEEP）与变异（MUTATE）原则
  - `variants`: 3 个独立方案（V1, V2, V3），包含时间轴节拍、表演细节、商品展示点、通用生产 Prompt

## 4. 工具集 (Tools)
- `video_analysis.preprocess`: 抽帧与联系表生成
- `vision_analyzer`: 多模态大模型视觉理解 (DeepSeek V4.1 Flash / Mock)
- `skill.validate`: 导演语法校验器
- `compileTreatment`: 方案编译与硬约束检查器
