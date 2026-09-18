import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { projectDir } from './storage';
import type { Task } from './types';

/** Read-only replay gate for a completed real task with passing visual QC. */
export async function isVerifiedReplayTask(task: Task): Promise<boolean> {
  if (task.appMode !== 'full' || task.status !== 'COMPLETED' || !task.generationTasks?.length || !task.results?.some(result => result.status === 'completed')) return false;
  const root = projectDir(task.id);
  for (const file of ['director-output.json', 'generation-plan.json', 'reference-evidence.json', 'runtime.json']) {
    try { if (!(await stat(path.join(root, file))).isFile()) return false; } catch { return false; }
  }
  for (const result of task.results.filter(item => item.status === 'completed')) {
    const job = task.generationTasks.filter(item => item.variantId === result.id).at(-1);
    if (!job || job.status !== 'COMPLETED') return false;
    try {
      const video = await stat(path.join(root, 'results', `${result.id}.mp4`));
      if (!video.isFile() || video.size === 0) return false;
      const report = JSON.parse(await readFile(path.join(root, 'quality', result.id, `attempt-${job.attempt ?? 0}`, 'quality-report.json'), 'utf8')) as { passed?: unknown; evaluation_mode?: unknown };
      if (report.passed !== true || report.evaluation_mode !== 'visual') return false;
    } catch { return false; }
  }
  return true;
}
