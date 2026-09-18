# AI Video Director v1.2 - Quality Agent v2 与视觉质检系统设计报告

**专家角色**：Subagent B (Video Quality 专家)  
**版本目标**：AI Video Director v1.2 视觉质检与自适应重试升级  
**状态**：已完成设计并就绪集成  

---

## 一、视觉质检系统现状与痛点评估

在现有的视频生成流程中，Quality Agent 承担了关键的质量把关角色，但存在以下关键缺陷：
1. **单向静态审核**：仅抽取生成成片帧（`qc_frames`）并对比模特图和商品图，缺乏与输入参考视频（Reference Video）的直接动态对标，无法判定生成的视频是否真正学到了参考视频的运镜节奏与运镜路径。
2. **缺乏相似度度量（Similarity Metric）**：导致生成方案容易走向两个极端——要么完全无视参考视频导致风格脱节，要么过度同质化。
3. **重试策略粗放**：当视频质检未达标时，旧版仅做简单的通用后缀附加，未能针对“手臂僵硬”、“转身突兀”、“商品边缘模糊变形”等具体缺陷施加针对性的动力学物理提示词。

---

## 二、Quality Agent v2 核心设计

### 1. 统一的 4 维基准评分（满分 100 分）
系统严格对齐 4 项 0-25 分的基础维度，满分为 100 分：
- **`motion_naturalness` (0-25 分)**：
  - 重心转移顺畅度、步态平稳性、关节屈伸自然度、减速停驻布料惯性。
- **`human_realism` (0-25 分，兼容 `human_feeling`)**：
  - 眼神聚焦与微转动、唇角及眼周微表情放松度、头颈躯干分步转动（禁止僵硬旋转）。
- **`product_consistency` (0-25 分，兼容 `product_fidelity`)**：
  - 商品外廓稳定性、材质纹理质感、人手与商品持续无穿模接触、展示动作清晰度。
- **`commercial_quality` (0-25 分，兼容 `camera_execution`)**：
  - 摄影机运镜平滑度与防抖、景深控制、主体商业构图美感、核心卖点视觉突出度。

### 2. 参考视频双向比对（Reference Similarity Evaluation）
在视觉质检请求中，除了传入生成视频关键帧（`qc_frames`，16~24帧），同时注入参考视频代表性抽样帧（`reference_frames`，8~12帧）：
- **`camera_similarity` (0-25 分)**：评估运镜方向、景别层级（中景转特写）及高度是否准确致敬。
- **`motion_similarity` (0-25 分)**：评估人物行进方向、节奏点与展示动作的结构神似度。
- **`composition_similarity` (0-25 分)**：评估画幅内主体比例、留白和视觉中心分布。
- **`product_presentation_similarity` (0-25 分)**：评估商品展示时机与人机互动关系的一致性。
- **总评相似度**：输出 `reference_similarity_score` (0-100 分) 及结构化相似度指标，作为商业复刻与微创新的平衡指示标。

---

## 三、靶向 Retry Agent v2 修复系统

当质检未达标（Score < 75）且存在可修复证据（`retry_required: true`）时，针对具体诊断出的缺陷注入精确补丁：

### 1. 针对“机械手臂”（Robotic Arm / Symmetrical Arm Motion）
- **触发条件**：质检问题命中“手臂”、“僵直”、“对称”、“robotic arm”等。
- **靶向修复补丁**：
  `"Biomechanic correction: Ensure arms move with natural asymmetric pendulum swing; relaxed fingers with subtle knuckle flexion and no synchronized robotic rigidity."`

### 2. 针对“转体僵硬 / 动作突变”（Unnatural Turn / Sudden Spin）
- **触发条件**：质检问题命中“转身”、“转体”、“突兀”、“瞬移”、“unnatural turn”等。
- **靶向修复补丁**：
  `"Turn choreography: Gaze initiates turn first at 0.3s lead, neck follows, then shoulders rotate, driving the torso with deliberate rear-foot weight transfer."`

### 3. 针对“商品丢失 / 形变闪现”（Product Morphing / Disappearance）
- **触发条件**：质检问题命中“商品变形”、“闪现”、“丢失”、“product morphing”等。
- **靶向修复补丁**：
  `"Product stability constraint: Maintain continuous physical hand contact with the product silhouette; product geometry, edges, and logo must remain strictly stable with no flickering or morphing."`

### 4. 针对“运镜抖动 / 镜头跳跃”（Camera Shake / Jitter）
- **触发条件**：质检问题命中“镜头抖动”、“跳帧”、“camera jitter”等。
- **靶向修复补丁**：
  `"Camera stabilization: Smooth camera trajectory following subject with stable 3-axis gimbal damping."`

### 5. 提示词字符保护
严格限制重试提示词总字符数不超过 2000 字符，超长时采用中间截断并完整保留原 Prompt 核心设定与新注入的物理约束。

---
