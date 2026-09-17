# Quality Agent Specification

## 1. 角色与职责 (Role & Responsibilities)
Quality Agent 负责对生成的商业视频成品进行严格的工业级多维度质量审核：
- 审查真人肢体运动的连贯性与自然度（避免机械卡顿、瞬间移位、关节翻折、非自然对称摆动）。
- 审查人类模特的情感、眼神接触与微表情真实度（眼神是否生动、是否存在空洞呆滞或假笑）。
- 审查商品展示真实度（手部是否与商品保持稳定物理接触、衣物褶皱与版型在动态下是否失真）。
- 审查摄影机运镜与构图（是否有异常镜头抖动、视角畸变或主体出画）。
- 输出量化评分报告及可定位的具体缺陷清单，并给出是否通过（Pass/Fail）判定。

## 2. 挂载技能 (Skill)
- **Quality Skill**:
  - 核心维度 (总分 100，>= 75 分判定通过)：
    1. `motion_naturalness` (25分): 重心转移、起步与停止阻尼、肢体协调。
    2. `human_feeling` (25分): 眼神流向、面部肌肉松弛度、生活化互动感。
    3. `product_presentation` (25分): 卖点展现、手部贴合、材质质感表现。
    4. `camera_execution` (25分): 运镜轨迹、跟拍稳定性、主体比例。

## 3. 输入与输出 (Inputs & Outputs)
- **输入**:
  - `video_file`: 已下载验证的 MP4 本地视频
  - `variant_plan`: 原导演方案的时间轴与动作规划
  - `product_showcase`: 期望呈现的商品特性与动作
- **输出**:
  - `quality_report`:
    - `overall_score`: 综合得分 (0~100)
    - `passed`: 是否达标 (boolean)
    - `dimension_scores`: 各维度细分得分
    - `issues`: 识别出的具体问题列表（如 "手部与商品在第 2 秒接触悬空"）
    - `actionable_feedback`: 供 Retry Agent 针对性调优的具体指导

## 4. 工具集 (Tools)
- `ffprobe`: 视频流基本信息解析
- `video_qc_evaluator`: 质量评估引擎（支持启发式检测与智能打分）
