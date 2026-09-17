import { readTask, acquireTaskLock, saveTask } from '../shared/storage';
import type { Task } from '../shared/types';
import type { ProviderTask, ProviderInput, VideoGenerationProvider } from '../video-provider/legacy';
import { VideoProductionWorkflow } from '../orchestrator/workflow';
import { WorkflowStateManager } from '../orchestrator/state';
import { needsQualityRecovery } from '../orchestrator/scheduler';

const state = globalThis as typeof globalThis & { directorActive?: Set<string> };
export const active = state.directorActive ??= new Set();

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

    // Run via Pi Agent VideoProductionWorkflow
    await VideoProductionWorkflow.run(task);
  } catch (e) {
    task.error = e instanceof Error ? e.message : '任务失败';
    task.status = 'FAILED';
    task.logs.push({ time: new Date().toISOString(), message: `任务执行失败: ${task.error}` });
    await saveTask(task);
  } finally {
    active.delete(task.id);
    await release();
  }
}

export async function recoverTask(id: string): Promise<Task> {
  return readTask(id);
}
