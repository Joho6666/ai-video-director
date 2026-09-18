# AI Video Director v1.2 - Motion DNA v2 架构与动作智能规范报告

**专家角色**：Subagent A (Motion DNA 专家)  
**版本目标**：AI Video Director v1.2 商业化动作智能升级  
**状态**：已完成设计并就绪集成  

---

## 一、当前动作生成痛点深度剖析

商业电商与时尚短视频客户反馈最强烈的核心痛点为：
1. **AI 模特动作机械死板（Robotic Pose & Motion）**：缺乏人体运动生物力学（Biomechanics）的连续因果链。常见如“头、肩、胯、手在同一帧瞬间转向同一角度”，在物理视觉上极其违和。
2. **缺乏动力学时间差（Lack of Kinematic Delay / Staggering）**：真人转身必先由“眼神视线（Gaze）”微移引导，继而“转颈（Head Rotation）”，再带动“肩胛与上躯干（Shoulder & Torso）”，最后“髋部与双脚旋转”，各关节存在 0.15s - 0.3s 的生理时间差。AI 往往将其合并为刚体旋转。
3. **肢体过度对称与僵直（Symmetrical Rigidity）**：行进或停步时，双臂出现机械式对称摆动；手持商品时，未持物手通常完全僵直或不自然握拳。
4. **缺少重力支撑与惯性滞后（Weight Shift & Inertia Settling）**：在行进急停或转身时，真人必须先将重力落于支撑脚（Support Foot），并在减速后伴随衣摆、发梢、手持物体的滞后惯性摆动（Settling）。AI 视频中人物往往如同在传送带上滑动。
5. **提示词形容词泛滥无执行力（Vague Adjective Slop）**：传统 Prompt 充斥“自然走来”、“优雅转身”、“高级感展示”等抽象形容词，生成模型完全无法解析具体运动轨迹，导致随机退化。

---

## 二、Motion DNA v2 Schema 规范设计

在 `packages/shared/motion-dna.schema.ts` 中建立三位一体的结构化动作描述体系：

### 1. 结构概览
- **`subject_motion`（人物运动学，9个核心维度）**：
  - `gait`：步态特征与脚跟/脚尖接触地面的动力学。
  - `body_posture`：脊柱曲线、胸腔前倾/后仰微姿态。
  - `head_direction`：颈部偏航/俯仰角。
  - `eye_direction`：视线先行角与焦点停顿。
  - `shoulder_movement`：双肩前旋、下沉与倾斜不对称性。
  - `arm_behavior`：持物臂与非持物臂的阻尼摆动。
  - `hand_interaction`：手指关节微屈与商品持续接触面。
  - `weight_transfer`：重心转移、支撑脚变换与轴心点。
  - `tempo`：动作加速度、停顿点（Hold Beat）与收尾阻尼。
- **`camera_motion`（摄影机运动，4个维度）**：
  - `movement`：推拉摇移（Pan/Tilt/Dolly/Truck/Pedestal）。
  - `speed`：镜头线性或贝塞尔平滑速度曲线。
  - `tracking`：针对主体或商品的跟随平滑度与景深焦点。
  - `stabilization`：稳定器阻尼质感与微手持呼吸感。
- **`emotion`（情绪与微表现，2个维度）**：
  - `facial_expression`：眼周肌群与唇角微表情生动度。
  - `energy_level`：呈现的商业气质与状态活力（如休闲、专注、自信）。

### 2. 帧级证据约束与反幻觉机制
每个动作及运镜维度必须输出为：
```typescript
{
  action: string;
  evidence: {
    frames: string[];   // 对应的抽样帧ID，如 ["frame_02", "frame_03"]
    confidence: number; // 置信度 0.0 - 1.0
  }
}
```
**严格规则**：
- **可观测动作（Observed）**：`frames.length >= 1` 且 `confidence >= 0.7`。
- **未观测动作（Unknown）**：若抽样帧未覆盖（如足底着地瞬间被遮挡），`action` 必须包含 `"UNKNOWN"`，`frames` 必须为 `[]`，`confidence <= 0.4`。
- **严禁无据断言**：严禁在未见帧证据时声称“观察到人物完成了脚掌着地”。

---

## 三、动作去模糊化与导演级语法编译器

### 1. 禁用词过滤列表（Banned Vague Words）
以下词汇将被拦截器直接判定为非法动作指令：
- `自然走路` / `随意走动`
- `高级展示` / `高级感`
- `优雅动作` / `优美身姿`
- `大方得体` / `美丽动人`
- `自然流露` / `自然摆动`

### 2. 导演级结构化动作解构语法（Kinematic Deconstruction Grammar）
动作编译器强制将模糊需求重构为四阶段因果链：
1. **引导相（Initiation）**：`视线 (Gaze) 先行 15° 扫向镜头，延迟 0.2s 头部跟转`。
2. **传动相（Transmission）**：`颈部转动带起单肩下沉后旋，重心由前脚跟过渡至后足弓外侧支撑`。
3. **表现相（Execution）**：`持物手臂保持 25° 屈肘悬空展示面料，另一手臂自然微屈形成非对称对冲`。
4. **沉降相（Settling）**：`躯干停驻后，衣摆与发丝经历 0.4s 的柔和惯性沉降与阻尼衰减`。

---

## 四、系统集成与数据流规划

1. **DeepSeek Director Envelope 扩充**：
   ```json
   {
     "treatment": { ... },
     "supplements": [ ... ],
     "reference_evidence": { ... },
     "motion_dna": {
       "subject_motion": { ... },
       "camera_motion": { ... },
       "emotion": { ... }
     }
   }
   ```
2. **Skill Schema 隔离**：由于原 Skill Schema 设置了 `additionalProperties: false`，`motion_dna` 处于外层 Envelope，不破坏原 Skill 校验器。
3. **生成计划与导出包**：
   - 将验证通过的 `motion_dna` 同步持久化至 `generation-plan.json` 的 `motion_dna` 字段。
   - 导出安全 ZIP 包中新增独立的 `motion-dna.json`，供前端渲染与工业生产复查。

---
