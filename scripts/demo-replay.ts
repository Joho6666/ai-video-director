import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { projectDir } from '../packages/shared/storage';

const taskId = process.argv[2] || process.env.DEMO_REPLAY_TASK_ID;
if (!taskId) {
  console.log('REPLAY = UNAVAILABLE: provide a completed real task ID');
  process.exit(0);
}
try {
  const task = JSON.parse(await readFile(path.join(projectDir(taskId), 'task.json'), 'utf8')) as {
    id: string; appMode?: string; status?: string; provider?: string; generationTasks?: Array<{ variantId: string; status: string; task_id?: string }>; results?: Array<{ id: string; status: string }>;
  };
  if (task.appMode !== 'full' || task.status !== 'COMPLETED') throw new Error('task is not a completed real production task');
  for (const file of ['director-output.json', 'generation-plan.json', 'reference-evidence.json', 'runtime.json']) { const info = await stat(path.join(projectDir(taskId), file)); if (!info.isFile() || !info.size) throw new Error(`${file} missing`); }
  const completed = (task.results || []).filter(item => item.status === 'completed');
  if (!completed.length || (task.generationTasks || []).some(job => job.status === 'MANUAL_VERIFICATION_REQUIRED')) throw new Error('no verified completed result');
  for (const result of completed) { const info = await stat(path.join(projectDir(taskId), 'results', `${result.id}.mp4`)); if (!info.isFile() || !info.size) throw new Error(`${result.id} MP4 missing`); }
  console.log('Verified Previous Run / 已验证历史任务');
  console.log(`task=${task.id} provider=${task.provider || 'unknown'} results=${completed.map(item => item.id).join(',')}`);
  console.log('Replay performs read-only local file access and makes no DeepSeek, Wan, or MiniMax request.');
} catch (error) {
  console.log(`REPLAY = UNAVAILABLE: ${error instanceof Error ? error.message : 'invalid task'}`);
}
