import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { runRealBenchmark } from '../packages/benchmark/real';

async function loadLocalEnv() {
  try {
    const text = await readFile(path.join(process.cwd(), '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* missing .env.local is reported by the runner */ }
}

await loadLocalEnv();
const result = await runRealBenchmark({ outputReportPath: path.join(process.cwd(), 'benchmark', 'reports', 'REAL_COMPARISON_REPORT.md') });
console.log(result.report_markdown);
console.log(`REAL_BENCHMARK = ${result.status}`);
if (result.status === 'FAILED') process.exitCode = 1;
