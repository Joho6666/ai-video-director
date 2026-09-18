# AI Video Director v1.3: Real Benchmark Architecture & Protocol Design
**Role**: Subagent A (Real Benchmark Architect)
**Status**: APPROVED & ADOPTED
**Date**: 2026-09-18

---

## 1. 核心问题诊断 (Diagnosis of Prior Benchmark)

在 v1.2 中，`packages/benchmark/index.ts` 的评分计算使用了预设静态分：
```ts
const baselineScoresRaw = { motion_naturalness: 13, human_realism: 14, product_consistency: 13, commercial_quality: 15 };
const directorScoresRaw = { motion_naturalness: 23, human_realism: 22, product_consistency: 23, commercial_quality: 22 };
```
此逻辑仅能测试加权公式求和及 Markdown 报告生成器，**不能作为证明 AI Video Director 相比直接调用底层模型有实质提升的科学证据**。

---

## 2. 模式彻底拆分体系 (Synthetic vs Real Split)

v1.3 实施严格的双轨评测体系：

| 维度 | Synthetic Benchmark (`benchmark:synthetic`) | Real Benchmark (`benchmark:real`) |
| :--- | :--- | :--- |
| **定位** | 离线确定性 CI 测试、公式校验、Schema 检查 | 真实成片质量对比、商业效果实测 |
| **API 调用** | 0 付费 API，离线快速执行 | 真实调用 DeepSeek Director + 视频 Provider |
| **执行环境** | GitHub Actions CI、本地 PR 检查 | 显式手动触发、受控网络与凭证环境 |
| **数据真实性** | 明确标记 `[SIMULATED - NOT REAL VIDEO EVIDENCE]` | 绝对禁止预设分数与假数据，真实成片双盲打分 |
| **报告产物** | `benchmark/reports/synthetic-report.md` | `benchmark/reports/REAL_COMPARISON_REPORT.md` |

---

## 3. 真实成对实验协议 (Real Paired Experiment Protocol)

每个 Benchmark Case 遵循绝对受控变量原则：

1. **统一生成约束**：
   - **同一 Provider 与同一 Model**：首选 DashScope Wan (`wanx2.1-i2v-plus`)，备选 MiniMax (`MiniMax-Hailuo-2.3`)。
   - **同一输入素材**：相同的模特参考图、商品特写图、参考视频抽帧。
   - **同一首帧策略**：均采用标准 letterbox 补边为 9:16 的第一帧图片。
   - **同一成片参数**：相同输出分辨率（720P）、相同生成时长（Wan 5s / MiniMax 6s）、相同画面比例（9:16）。

2. **成对实验组划分**：
   - **Group A (BASELINE)**：
     - 采用经验丰富的商业营销人员常写的自然语言商业提示词。
     - **禁止故意弱化**（严禁使用类似 `beautiful girl 4k` 的无效 prompt），必须包含模特、服装商品、场景走动和商业氛围。
     - **严禁注入**：Motion DNA v2、Shot DNA、Product Showcase 编排结构及 Director Skill 动作解构。
   - **Group B (DIRECTOR)**：
     - 严格走完完整的 `Reference Video Analysis` → `Reference Evidence` → `Motion DNA v2` → `Shot DNA` → `Product Showcase` → `Director Prompt Compiler`。
     - 严禁人工手动修饰 Prompt。

3. **首期受控成本配置**：
   - `BENCHMARK_MAX_CASES = 3`（覆盖 01_womenswear, 02_beauty, 04_digital）。
   - `BENCHMARK_VARIANTS_PER_CASE = 1`（固定使用 V1 首轮方案）。
   - `BENCHMARK_MAX_RETRY = 0`（首轮对比不启用自动 Retry，纯净评估初次生成质量）。
   - 3 个 Case × 2 组 = 6 个真实视频，严控 API 成本。

---

## 4. 实验 Manifest 规约 (`benchmark/runs/<run-id>/manifest.json`)

每个真实评测批次建立独立可追溯的 Manifest，包含：
- `run_id`: 批次唯一 UUID。
- `created_at`: 启动 ISO-8601 时间戳。
- `provider`: 视频生成 Provider 名称。
- `model`: 视频生成模型型号。
- `cases`: 逐 Case 记录：
  - `case_id`: 测试用例 ID。
  - `baseline_prompt_hash`: Baseline 提示词 SHA-256。
  - `director_prompt_hash`: Director 提示词 SHA-256。
  - `asset_hashes`: 模特图、商品图、首帧图哈希。
  - `generation_task_ids`: 对应的底层视频任务 ID。
  - `blind_assignment`: `video_A` 与 `video_B` 的随机归属映射。
- **安全过滤**：严格剔除所有 API Key、Authorization Header、临时签名 OSS/COS URL。

---

## 5. 解盲数学计算与三态结论判决

评分经双盲质检完成后，服务器依据 `blind_assignment` 进行解盲：
- $Delta = \text{Score}_{\text{Director}} - \text{Score}_{\text{Baseline}}$
- **胜负判定**（纯数学计算，无人工干预）：
  - $Delta > 0 \rightarrow \text{director}$
  - $Delta < 0 \rightarrow \text{baseline}$
  - $Delta = 0 \rightarrow \text{tie}$
- **整体综合评价（三态判定标准）**：
  1. $\text{Average Delta} \ge +8.0$ $\rightarrow$ **`PROMISING`**（证明 Director 架构带来实质性商业视频质量提升）。
  2. $\text{Average Delta} \in [+1.0, +7.9]$ $\rightarrow$ **`MARGINAL IMPROVEMENT`**（微弱优势，需进一步优化动作动力学提示词）。
  3. $\text{Average Delta} \le 0.0$ $\rightarrow$ **`NO VERIFIED ADVANTAGE`**（未能证明相对基线的优势，需如实记录并倒逼算法复盘）。

---

## 6. 衍生实验模块规约

1. **Retry Benchmark (`benchmark:retry`)**：
   - 评测对象：`Director Initial (V1)` vs `Director + Targeted Retry (V1-Retry)`。
   - 验证 Quality Agent 发现缺陷后，Retry Agent 局部注入补丁对成片缺陷修复的有效率。
2. **Motion DNA 消融实验 (`benchmark:motion-ablation`)**：
   - 评测对象：`Director with Motion DNA` vs `Director without Motion DNA`。
   - 剥离动作时空解构后，评测成片肢体协调性与步态惯性分数的差异。
