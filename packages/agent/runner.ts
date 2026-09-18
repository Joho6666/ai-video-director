import { readTask, acquireTaskLock, saveTask, dataRoot } from '../shared/storage';
import { readdir } from 'node:fs/promises';
import type { Task } from '../shared/types';
import type { ProviderTask, ProviderInput, VideoGenerationProvider } from '../video-provider/legacy';
import { VideoProductionWorkflow } from '../orchestrator/workflow';
import type { SchedulerOptions } from '../orchestrator/scheduler';
import { WorkflowStateManager } from '../orchestrator/state';
import { needsQualityRecovery } from '../orchestrator/scheduler';
import { customerErrorMessage } from '../shared/errors';

const state = globalThis as typeof globalThis & { directorActive?: Set<string> };
export const active = state.directorActive ??= new Set();
const recoveryState = state as typeof state & { pendingRecoveryStarted?: boolean };

export async function getOrCreateProviderTask(
  provider: VideoGenerationProvider,
  input: ProviderInput,
  result: Task['results'][number]
): Promise<ProviderTask> {
  if (result.providerTaskId) return { id: result.providerTaskId };
  const job = await provider.createTask(input);
  result.providerTaskId = job.id;
  return job;
}

export async function runTask(task: Task): Promise<void> {
  const release = await acquireTaskLock(task.id);
  if (!release) return;
  active.add(task.id);

  try {
    task = await readTask(task.id);
    delete task.error;
    if (task.status === 'COMPLETED') {
      const runState = await WorkflowStateManager.load(task.id, task.appMode);
      if (!(await needsQualityRecovery(task, runState))) return;
    }
    if (task.provider === 'seedance' && !task.plan) {
      throw new Error('Legacy Seedance task: production resume is not supported');
    }

    // Once a Director plan and generation ledger exist, recovery must not
    // spend another Director/Pi model call just to reach an already-submitted
    // provider task. The guarded scheduler can resume polling/download/QC
    // using the persisted provider and request instead.
    const resumeOptions: SchedulerOptions = task.plan && task.generationTasks?.length
      ? { skipPi: true, skipDirector: true, skipProducer: true }
      : {};
    await VideoProductionWorkflow.run(task, resumeOptions);
  } catch (e) {
    task.error = e instanceof Error ? e.message : '任务失败';
    task.status = 'FAILED';
    task.logs.push({ time: new Date().toISOString(), message: `任务执行失败: ${customerErrorMessage(task.error)}` });
    await saveTask(task);
  } finally {
    active.delete(task.id);
    await release();
  }
}

export async function recoverTask(id: string): Promise<Task> {
  return readTask(id);
}

/** Resume durable non-terminal workflows after a process restart. */
export async function recoverPendingTasks(): Promise<void> {
  let entries;
  try { entries = await readdir(dataRoot, { withFileTypes: true }); } catch { return; }
  const resumable = new Set(['UPLOADED', 'ANALYZING', 'ANALYZING_REFERENCE', 'EXTRACTING_SHOT_DNA', 'PLANNING', 'PLANNING_VARIANTS', 'GENERATING', 'GENERATING_V1', 'GENERATING_V2', 'GENERATING_V3', 'REVIEWING', 'RETRYING', 'COMPLETED', 'FAILED']);
  await Promise.all(entries.filter(entry => entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)).map(async entry => {
    try {
      const task = await readTask(entry.name);
      if (!resumable.has(task.status) || active.has(task.id)) return;
      // Director-only and Mock tasks are terminal once their plan/demo result
      // is persisted. Only a full task with production evidence can need a
      // post-restart quality or provider recovery pass.
      if (task.status === 'COMPLETED' && (task.appMode !== 'full' || !task.generationTasks?.length)) return;
      if (task.status === 'FAILED' && !task.generationTasks?.length) return;
      if (task.generationTasks?.some(job => job.status === 'MANUAL_VERIFICATION_REQUIRED')) return;
      void runTask(task);
    } catch {
      // A corrupt task is intentionally left for explicit operator review.
    }
  }));
}

/**
 * Start durable task recovery once per server process. This is called by both
 * the task list and task detail routes so a browser refresh on a direct task
 * URL cannot leave an already-submitted provider job stalled after restart.
 */
export function startPendingTaskRecovery(): void {
  if (recoveryState.pendingRecoveryStarted) return;
  recoveryState.pendingRecoveryStarted = true;
  void recoverPendingTasks();
}
