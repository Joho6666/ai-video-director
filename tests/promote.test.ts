import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Task } from '../packages/shared/types';

// Isolate from the real data/projects: storage resolves DATA_DIR at import time.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'avd-promote-'));
const { projectDir, saveTask } = await import('../packages/shared/storage');
const { promoteDirectorTask } = await import('../packages/agent/promote');
const { loadGenerationTasks } = await import('../packages/agent/production');
const { WorkflowStateManager } = await import('../packages/orchestrator/state');

const fullEnv = { APP_MODE: 'full', MINIMAX_API_KEY: 'test-key' };

async function directorTask(overrides: Partial<Task> = {}): Promise<Task> {
  const id = randomUUID();
  await mkdir(projectDir(id), { recursive: true });
  const variant = (vid: 'V1' | 'V2' | 'V3', name: string) => ({ id: vid, name });
  const task = {
    id, project_id: id, createdAt: 'now', updatedAt: 'now', requirement: 'test', assets: [],
    taskType: 'ecommerce', status: 'COMPLETED', appMode: 'director', provider: null, director: 'deepseek',
    logs: [], results: [],
    plan: { variants: [variant('V1', '轻奢时尚'), variant('V2', '都市通勤'), variant('V3', '活力街拍')] },
    ...overrides,
  } as unknown as Task;
  await saveTask(task);
  const state = new WorkflowStateManager(id, 'director');
  state.transition('ANALYZING', 'director', 'a');
  state.transition('PLANNING', 'director', 'p');
  state.transition('COMPLETED', 'orchestrator', 'done');
  await state.persist();
  return task;
}

test('promotion requires APP_MODE=full', async () => {
  const task = await directorTask();
  await assert.rejects(promoteDirectorTask(task.id, { env: { APP_MODE: 'director', MINIMAX_API_KEY: 'k' } }), /不是 full/);
});

test('a finished director plan is promoted in place without a paid attempt', async () => {
  const task = await directorTask();
  const promoted = await promoteDirectorTask(task.id, { selectedVariants: ['V2'], env: fullEnv });
  assert.equal(promoted.appMode, 'full');
  assert.equal(promoted.status, 'PLANNING');
  assert.equal(promoted.provider, 'minimax');
  assert.deepEqual(promoted.selectedVariants, ['V2']);
  assert.deepEqual(promoted.results, [{ id: 'V2', name: '都市通勤', status: 'waiting' }]);
  assert.deepEqual(await loadGenerationTasks(promoted), []);
  const run = JSON.parse(await readFile(path.join(projectDir(task.id), 'agent-run.json'), 'utf8'));
  assert.equal(run.status, 'PLANNING');
  assert.equal(run.app_mode, 'full');
  assert.equal(run.transitions.at(-1).from, 'COMPLETED');
  // A second promotion is refused: the task is no longer a director task.
  await assert.rejects(promoteDirectorTask(task.id, { env: fullEnv }), /只有 director/);
});

test('promotion refuses when a generation ledger exists on disk', async () => {
  const task = await directorTask();
  await writeFile(path.join(projectDir(task.id), 'generation-tasks.json'), '[]');
  await assert.rejects(promoteDirectorTask(task.id, { env: fullEnv }), /generation-tasks\.json exists/);
});

test('promotion refuses when a result carries a provider task id', async () => {
  const task = await directorTask({ results: [{ id: 'V1', name: 'V1', status: 'waiting', providerTaskId: 'remote' }] });
  await assert.rejects(promoteDirectorTask(task.id, { env: fullEnv }), /provider task id/);
});

test('promotion refuses unfinished analysis and unknown variants', async () => {
  const unfinished = await directorTask({ status: 'ANALYZING' as Task['status'] });
  await assert.rejects(promoteDirectorTask(unfinished.id, { env: fullEnv }), /尚未完成/);
  const task = await directorTask({ plan: { variants: [{ id: 'V1', name: 'only' }] } as unknown as Task['plan'] });
  await assert.rejects(promoteDirectorTask(task.id, { selectedVariants: ['V3'], env: fullEnv }), /不存在 V3/);
});

test('the missing-ledger guard is unchanged for tasks that did start production', async () => {
  const task = await directorTask({ appMode: 'full', status: 'COMPLETED', results: [{ id: 'V1', name: 'V1', status: 'completed' }] });
  await assert.rejects(loadGenerationTasks(task), /refusing to recreate paid attempts/);
});
