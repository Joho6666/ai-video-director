import path from 'node:path';
import { runSyntheticBenchmark } from '../packages/benchmark/synthetic';

const casesDir = path.join(process.cwd(), 'benchmark', 'cases');
const reportPath = path.join(process.cwd(), 'benchmark', 'reports', 'SYNTHETIC_COMPARISON_REPORT.md');
const result = await runSyntheticBenchmark(casesDir, reportPath);
console.log(result.report.split('\n').slice(0, 14).join('\n'));
console.log(`SYNTHETIC_BENCHMARK = COMPLETED (${result.results.length} cases)`);
