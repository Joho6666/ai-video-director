import path from 'node:path';
import { writeFile } from 'node:fs/promises';

export interface RetryBenchmarkResult { status: 'COMPLETED' | 'UNAVAILABLE'; report: string; reason?: string }

/** Targeted retry benchmark requires two real generations and an independent QC review. */
export async function runRetryBenchmark(options: { outputPath?: string; env?: Record<string, string | undefined> } = {}): Promise<RetryBenchmarkResult> {
  const env = options.env ?? process.env;
  const reason = !env.DEEPSEEK_API_KEY ? 'DEEPSEEK_API_KEY missing' : 'real generation assets are not configured';
  const report = `# Targeted Retry Benchmark\n\nREAL_RETRY_BENCHMARK = UNAVAILABLE\n\n${reason}. No retry score was fabricated.\n`;
  await writeFile(options.outputPath ?? path.join(process.cwd(), 'benchmark', 'reports', 'RETRY_BENCHMARK_REPORT.md'), report, 'utf8');
  return { status: 'UNAVAILABLE', report, reason };
}
