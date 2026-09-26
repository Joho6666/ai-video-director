import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Task } from '../shared/types';
import { acquireTaskLock, projectDir, readTask, saveTask } from '../shared/storage';
import { resolveVideoRoute } from '../video-provider/router';
import { WorkflowStateManager } from '../orchestrator/state';
import { selectionSchema } from './production';

type Env = Record<string, string | undefined>;

/**
 * Evidence that a paid provider attempt may exist. Any hit means the task is
 * not a pure Director plan and must never be re-planned into production.
 */
export async function paidAttemptEvidence(task: Task): Promise<string[]> {
  const evidence: string[] = [];
  if (task.generationTasks?.length) evidence.push('task.json has generation attempts');
  if (task.results.some(result => result.providerTaskId)) evidence.push('a result has a provider task id');
  if (task.results.some(result => result.status !== 'waiting')) evidence.push('a result has left the waiting state');
  try {
    await stat(path.join(projectDir(task.id), 'generation-tasks.json'));
    evidence.push('generation-tasks.json exists');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return evidence;
}

/**
 * Turn a completed Director-only task into a full production task in place,
 * so "analyse first, generate once satisfied" works without re-uploading or
 * re-paying for analysis. It only rewrites mode/status/results; submission,
 * dedupe, retry budget and QC stay with WorkflowScheduler. Refuses whenever a
 * paid attempt could exist, so the missing-ledger guard in
 * loadGenerationTasks never has to be relaxed.
 */
export async function promoteDirectorTask(
  taskId: string,
  options: { selectedVariants?: unknown; env?: Env } = {},
): Promise<Task> {
  const env = options.env ?? process.env;
  if (env.APP_MODE !== 'full') throw new Error('当前 APP_MODE 不是 full，无法进入视频生成（会产生真实费用，请先确认后切换并重启服务）');

  const release = await acquireTaskLock(taskId);
  if (!release) throw new Error('任务正在处理中，请稍后再试');
  try {
    const task = await readTask(taskId);
    if (task.appMode !== 'director') throw new Error(`只有 director 模式的任务可以转入生产（当前：${task.appMode}）`);
    if (task.status !== 'COMPLETED' || !task.plan) throw new Error('导演分析尚未完成，无法转入生产');
    const evidence = await paidAttemptEvidence(task);
    if (evidence.length) throw new Error(`检测到可能的付费尝试（${evidence.join('；')}），拒绝转入生产以免重复扣费`);

    const selected = selectionSchema.parse(options.selectedVariants ?? task.selectedVariants ?? ['V1']);
    const variants = selected.map(id => {
      const variant = task.plan!.variants.find(v => v.id === id);
      if (!variant) throw new Error(`导演方案中不存在 ${id}`);
      return variant;
    });
    const route = resolveVideoRoute('full', task.taskType, {
      ...env,
      ...(task.providerPreference && task.providerPreference !== 'auto' ? { VIDEO_PROVIDER: task.providerPreference } : {}),
    });
    if (!route) throw new Error('无法解析视频 Provider 路线');

    const state = await WorkflowStateManager.load(task.id, task.appMode);
    state.promoteDirectorPlan();
    task.appMode = 'full';
    task.provider = route.provider;
    task.selectedVariants = selected;
    task.results = variants.map(v => ({ id: v.id, name: v.name, status: 'waiting' }));
    task.status = 'PLANNING';
    delete task.error;
    task.logs.push({ time: new Date().toISOString(), message: `导演方案转入生产：${selected.join('/')} · ${route.provider} (${route.model})` });
    await state.persist();
    await saveTask(task);
    return task;
  } finally {
    await release();
  }
}
