import path from 'node:path';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import type {
  BenchmarkCase,
  EvaluationScores,
  CaseComparison,
} from './types';
import { calculateDirectorScore, calculateOutcomeClassification } from './scoring';

export async function loadBenchmarkCases(casesDir: string): Promise<BenchmarkCase[]> {
  const files = (await readdir(casesDir)).filter(f => f.endsWith('.json')).sort();
  const cases: BenchmarkCase[] = [];
  for (const file of files) {
    const content = (await readFile(path.join(casesDir, file), 'utf8')).replace(/^\uFEFF/, '');
    const raw = JSON.parse(content);
    cases.push(raw as BenchmarkCase);
  }
  return cases;
}

export function evaluateCase(caseItem: BenchmarkCase): CaseComparison {
  // Baseline: Generic commercial prompt simulation
  const baselineScoresRaw = {
    motion_naturalness: 13,
    human_realism: 14,
    product_consistency: 13,
    commercial_quality: 15,
  };
  const baseline_scores: EvaluationScores = {
    ...baselineScoresRaw,
    director_score: calculateDirectorScore(baselineScoresRaw),
  };

  // Director: Motion DNA v2 + Product Showcase simulation
  const directorScoresRaw = {
    motion_naturalness: 23,
    human_realism: 22,
    product_consistency: 23,
    commercial_quality: 22,
  };
  const director_scores: EvaluationScores = {
    ...directorScoresRaw,
    director_score: calculateDirectorScore(directorScoresRaw),
  };

  const highlights = [
    `动作自然度测试 (+${director_scores.motion_naturalness - baseline_scores.motion_naturalness}分)：动力学动作解构与非对称摆臂`,
    `真人感与神态测试 (+${director_scores.human_realism - baseline_scores.human_realism}分)：视线先行与面部微表情控制`,
    `商品展示测试 (+${director_scores.product_consistency - baseline_scores.product_consistency}分)：物理接触与特征聚焦`,
    `商业运镜测试 (+${director_scores.commercial_quality - baseline_scores.commercial_quality}分)：平滑平移跟拍与焦点锁定`,
  ];

  const delta = Number((director_scores.director_score - baseline_scores.director_score).toFixed(1));

  return {
    case_id: caseItem.id,
    case_name: caseItem.name,
    category: caseItem.category,
    baseline: {
      score: baseline_scores.director_score,
      dimensions: baseline_scores,
      reference_similarity: 50,
      issues: ['通用提示词缺乏时空动作约束', '商品展示缺乏明确物理触碰'],
    },
    director: {
      score: director_scores.director_score,
      dimensions: director_scores,
      reference_similarity: 88,
      issues: [],
    },
    delta,
    motion_delta: director_scores.motion_naturalness - baseline_scores.motion_naturalness,
    human_delta: director_scores.human_realism - baseline_scores.human_realism,
    product_delta: director_scores.product_consistency - baseline_scores.product_consistency,
    camera_delta: director_scores.commercial_quality - baseline_scores.commercial_quality,
    reference_similarity_delta: 38,
    winner: delta > 0 ? 'director' : delta < 0 ? 'baseline' : 'tie',
    highlights,
    baseline_scores,
    director_scores,
    score_delta: delta,
  };
}

export function generateComparisonReport(
  results: CaseComparison[],
  isSynthetic = true
): string {
  const count = results.length || 1;
  const avgBaseline = (results.reduce((s, r) => s + r.baseline.score, 0) / count).toFixed(1);
  const avgDirector = (results.reduce((s, r) => s + r.director.score, 0) / count).toFixed(1);
  const avgDelta = (results.reduce((s, r) => s + r.delta, 0) / count).toFixed(1);
  const avgMotionDelta = (results.reduce((s, r) => s + r.motion_delta, 0) / count).toFixed(1);
  const avgHumanDelta = (results.reduce((s, r) => s + r.human_delta, 0) / count).toFixed(1);
  const avgProductDelta = (results.reduce((s, r) => s + r.product_delta, 0) / count).toFixed(1);
  const avgCameraDelta = (results.reduce((s, r) => s + r.camera_delta, 0) / count).toFixed(1);
  const outcome = calculateOutcomeClassification(Number(avgDelta));

  const headerPrefix = isSynthetic
    ? `# AI Video Director v1.3 Benchmark 评测对比报告 [SIMULATED - NOT REAL VIDEO EVIDENCE]\n\n> ⚠️ **声明：本报告为 CI / 离线模拟数据**，仅用于验证评分加权公式、维度统计计算及报告生成流程，**不作为证明模型真实生成效果的实机视频证据**。真实效果验证请运行 \`npm run benchmark:real\`。\n`
    : `# AI Video Director v1.3 Real Benchmark 真实视频评测对比报告\n\n> 🎬 **声明：本报告基于真实视频模型生成及双盲视觉审核生成**。包含 Baseline 与 Director 组实机生成的成对盲测数据。\n`;

  let md = `${headerPrefix}
## 1. 综合评测概览 (Executive Summary)

- **评测模式**：${isSynthetic ? 'Synthetic Simulation (离线模拟验证)' : 'Real Video Generation (真实实机实验)'}
- **用例总数**：${results.length} 个商业品类用例
- **综合评定结论**：**\`${outcome}\`**
- **商业质量加权得分 (AI Video Director Score)**：
  - **Baseline 平均分**：\`${avgBaseline} / 100\`
  - **Director 平均分**：\`${avgDirector} / 100\`
  - **平均净提升 (Score Delta)**：\`${Number(avgDelta) >= 0 ? '+' : ''}${avgDelta} 分\`

---

## 2. 核心维度指标分析 (Dimension Breakdown)

| 评分维度 | 权重 | Baseline 平均 | Director 平均 | 净增幅 (Δ) | 核心评估关注点 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Motion Naturalness (动作自然度)** | **30%** | ${(results.reduce((s, r) => s + r.baseline.dimensions.motion_naturalness, 0) / count).toFixed(1)} / 25 | ${(results.reduce((s, r) => s + r.director.dimensions.motion_naturalness, 0) / count).toFixed(1)} / 25 | **${Number(avgMotionDelta) >= 0 ? '+' : ''}${avgMotionDelta}** | 滑步消除、非对称摆臂、步态支撑脚重心转移 |
| **Human Realism (真人感与神态)** | **25%** | ${(results.reduce((s, r) => s + r.baseline.dimensions.human_realism, 0) / count).toFixed(1)} / 25 | ${(results.reduce((s, r) => s + r.director.dimensions.human_realism, 0) / count).toFixed(1)} / 25 | **${Number(avgHumanDelta) >= 0 ? '+' : ''}${avgHumanDelta}** | 视线先行引导转头、面部微表情放松与躯干延迟转动 |
| **Product Consistency (商品一致性)** | **25%** | ${(results.reduce((s, r) => s + r.baseline.dimensions.product_consistency, 0) / count).toFixed(1)} / 25 | ${(results.reduce((s, r) => s + r.director.dimensions.product_consistency, 0) / count).toFixed(1)} / 25 | **${Number(avgProductDelta) >= 0 ? '+' : ''}${avgProductDelta}** | 手持物理持续贴合、轮廓纹理无穿模形变闪烁 |
| **Commercial Quality (商业镜头感)** | **20%** | ${(results.reduce((s, r) => s + r.baseline.dimensions.commercial_quality, 0) / count).toFixed(1)} / 25 | ${(results.reduce((s, r) => s + r.director.dimensions.commercial_quality, 0) / count).toFixed(1)} / 25 | **${Number(avgCameraDelta) >= 0 ? '+' : ''}${avgCameraDelta}** | 摄影机低速稳定推拉跟拍、焦点锁定与无杂乱跳变 |

---

## 3. 详细测试用例对比列表 (Per-Case Comparison Table)

| 用例 ID | 品类 | 用例名称 | Baseline | Director | 综合净提升 (Δ) | 参考相似度 (Base/Dir) | 裁决胜方 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

  for (const r of results) {
    md += `| \`${r.case_id}\` | **${r.category}** | ${r.case_name} | ${r.baseline.score} | **${r.director.score}** | **${r.delta >= 0 ? '+' : ''}${r.delta}** | ${r.baseline.reference_similarity} / ${r.director.reference_similarity} | **${r.winner.toUpperCase()}** |\n`;
  }

  md += `
---

## 4. 用例深度评测详情

`;

  for (const r of results) {
    md += `### ${r.case_name} (\`${r.case_id}\` - ${r.category})
- **胜方判定**：\`${r.winner.toUpperCase()}\` (净变化: ${r.delta >= 0 ? '+' : ''}${r.delta} 分)
- **Baseline 表现**：总分 ${r.baseline.score} (Motion ${r.baseline.dimensions.motion_naturalness}, Human ${r.baseline.dimensions.human_realism}, Product ${r.baseline.dimensions.product_consistency}, Camera ${r.baseline.dimensions.commercial_quality})
- **Director 表现**：总分 ${r.director.score} (Motion ${r.director.dimensions.motion_naturalness}, Human ${r.director.dimensions.human_realism}, Product ${r.director.dimensions.product_consistency}, Camera ${r.director.dimensions.commercial_quality})
- **参考视频相似度对比**：Baseline ${r.baseline.reference_similarity} / 100 vs Director ${r.director.reference_similarity} / 100 (仅作独立参考指标，不计入质量总分)
- **评测亮点**：
${r.highlights.map(h => `  - ${h}`).join('\n')}

`;
  }

  md += `## 5. 结论判定说明
根据实机评测标准：
- **PROMISING** (Average Delta ≥ +8.0): 证明 Director 方法产生显著商业正向提升。
- **MARGINAL IMPROVEMENT** (Average Delta +1.0 ~ +7.9): 存在一定提升，需针对弱势项继续迭代。
- **NO VERIFIED ADVANTAGE** (Average Delta ≤ 0.0): 未观察到确定提升，严禁主观宣称有增益。
`;

  return md;
}

export async function runSyntheticBenchmark(
  casesDir: string,
  outputReportPath?: string
): Promise<{ results: CaseComparison[]; report: string }> {
  const cases = await loadBenchmarkCases(casesDir);
  const results = cases.map(c => evaluateCase(c));
  const report = generateComparisonReport(results, true);
  if (outputReportPath) {
    await writeFile(outputReportPath, report, 'utf8');
  }
  return { results, report };
}

// Backward compatibility alias for v1.2
export const runBenchmarkSuite = runSyntheticBenchmark;
