import path from 'node:path';
import { runBenchmarkSuite } from '../packages/benchmark';

async function main() {
  console.log('🚀 正在启动 AI Video Director v1.2 Benchmark 评测基准套件...');
  const casesDir = path.join(process.cwd(), 'benchmark', 'cases');
  const reportPath = path.join(process.cwd(), 'benchmark', 'reports', 'comparison-report.md');

  const { results } = await runBenchmarkSuite(casesDir, reportPath);

  console.log('\n======================================================');
  console.log('📊 AI Video Director v1.2 Benchmark 评测汇总');
  console.log('======================================================');

  for (const r of results) {
    console.log(
      `[${r.case_id}] ${r.case_name} (${r.category})\n` +
      `  • Baseline Score:  ${r.baseline_scores.director_score} / 100\n` +
      `  • Director Score:  ${r.director_scores.director_score} / 100\n` +
      `  • 净提升增幅 (Δ):   +${r.score_delta} 分 (Motion +${r.motion_delta}, Human +${r.human_delta}, Product +${r.product_delta}, Camera +${r.camera_delta})\n`
    );
  }

  const avgBaseline = (results.reduce((s, r) => s + r.baseline_scores.director_score, 0) / results.length).toFixed(1);
  const avgDirector = (results.reduce((s, r) => s + r.director_scores.director_score, 0) / results.length).toFixed(1);
  const avgDelta = (results.reduce((s, r) => s + r.score_delta, 0) / results.length).toFixed(1);

  console.log('------------------------------------------------------');
  console.log(`平均 Baseline 得分: ${avgBaseline} / 100`);
  console.log(`平均 Director 得分: ${avgDirector} / 100`);
  console.log(`🔥 综合平均净提升:   +${avgDelta} 分 (+${((Number(avgDelta) / Number(avgBaseline)) * 100).toFixed(1)}%)`);
  console.log('------------------------------------------------------');
  console.log(`✅ 详细对比报告已成功保存至: ${reportPath}\n`);
}

main().catch(err => {
  console.error('❌ Benchmark 执行失败:', err);
  process.exit(1);
});