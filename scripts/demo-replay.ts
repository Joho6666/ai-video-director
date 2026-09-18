import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { projectDir } from '../packages/shared/storage';
import { isVerifiedReplayTask } from '../packages/shared/replay';

const taskId = process.argv[2] || process.env.DEMO_REPLAY_TASK_ID;
if (!taskId) {
  console.log('REPLAY = UNAVAILABLE: provide a completed real task ID');
  process.exit(0);
}
try {
  const task = JSON.parse(await readFile(path.join(projectDir(taskId), 'task.json'), 'utf8')) as {
    id: string; appMode?: string; status?: string; provider?: string; generationTasks?: Array<{ variantId: string; status: string; task_id?: string }>; results?: Array<{ id: string; status: string }>;
  };
  if (!(await isVerifiedReplayTask(task as never))) throw new Error('no completed real task with passing visual QC');
  const completed = (task.results || []).filter(item => item.status === 'completed');
  console.log('Verified Previous Run / 已验证历史任务');
  console.log(`task=${task.id} provider=${task.provider || 'unknown'} results=${completed.map(item => item.id).join(',')}`);
  console.log('Replay performs read-only local file access and makes no DeepSeek, Wan, or MiniMax request.');
} catch (error) {
  console.log(`REPLAY = UNAVAILABLE: ${error instanceof Error ? error.message : 'invalid task'}`);
}
