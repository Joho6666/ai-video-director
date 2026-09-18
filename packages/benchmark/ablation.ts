import path from 'node:path';
import { writeFile } from 'node:fs/promises';

export interface AblationResult { status: 'COMPLETED' | 'UNAVAILABLE'; report: string; reason?: string }

/**
 * Motion ablation is deliberately a real-video experiment. It never substitutes
 * deterministic scores when credentials or assets are absent.
 */
export async function runMotionAblationBenchmark(options: { outputPath?: string; env?: Record<string, string | undefined> } = {}): Promise<AblationResult> {
  const env = options.env ?? process.env;
  const reason = !env.WAN_API_KEY && !env.DASHSCOPE_API_KEY && !env.MINIMAX_API_KEY
    ? 'video provider key missing'
    : !env.DEEPSEEK_API_KEY ? 'DEEPSEEK_API_KEY missing' : 'external real ablation assets are not configured';
  const report = `# Motion DNA Ablation\n\nREAL_MOTION_ABLATION = UNAVAILABLE\n\n${reason}. No synthetic scores were substituted.\n`;
  await writeFile(options.outputPath ?? path.join(process.cwd(), 'benchmark', 'reports', 'MOTION_ABLATION_REPORT.md'), report, 'utf8');
  return { status: 'UNAVAILABLE', report, reason };
}
