import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { readGenerationLedger, writeGenerationLedger, type BenchmarkGenerationLedgerEntry } from '../packages/benchmark/real';
import { productionPrompt } from '../packages/agent/production';
import { resolveVideoRoute } from '../packages/video-provider/router';
import { customerErrorMessage, customerizeTask } from '../packages/shared/errors';
import { isVerifiedReplayTask } from '../packages/shared/replay';
import { projectDir } from '../packages/shared/storage';
import type { Task } from '../packages/shared/types';

test('benchmark ledger persists paid intent and remote task id atomically', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'director-ledger-'));
  try {
    const entry: BenchmarkGenerationLedgerEntry = { job_id: 'job-1', case_id: 'womenswear', arm: 'director', provider: 'wan', model: 'wanx2.1-i2v-plus', status: 'PENDING', submission_started_at: new Date().toISOString(), attempt: 0, updated_at: new Date().toISOString() };
    await writeGenerationLedger(dir, [entry]);
    entry.remote_task_id = 'remote-1'; entry.status = 'SUBMITTED'; entry.updated_at = new Date().toISOString();
    await writeGenerationLedger(dir, [entry]);
    const saved = await readGenerationLedger(dir);
    assert.equal(saved[0].remote_task_id, 'remote-1');
    assert.equal(JSON.parse(await readFile(path.join(dir, 'generation-ledger.json'), 'utf8'))[0].job_id, 'job-1');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('invalid benchmark ledger fails closed instead of resetting paid state', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'director-ledger-invalid-'));
  try {
    await writeFile(path.join(dir, 'generation-ledger.json'), '{"not":"an array"}');
    await assert.rejects(() => readGenerationLedger(dir), /Generation ledger is invalid/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('real provider route and compiled prompt share duration and resolution', () => {
  const wan = resolveVideoRoute('full', 'fashion', { WAN_API_KEY: 'configured', VIDEO_PROVIDER: 'wan' });
  assert.ok(wan && wan.duration === 5 && wan.resolution === '720P');
  const variant = { timeline: [{ duration: 3, transition: 'enter', end_state: 'walk' }, { duration: 5, transition: 'turn', end_state: 'settle' }], performance: { gaze: 'eyes lead' } } as never;
  const compiled = productionPrompt(variant, wan!.duration).prompt;
  assert.match(compiled, /5-second/);
  assert.doesNotMatch(compiled, /8-second|0-8s/);
  const minimax = resolveVideoRoute('full', 'ecommerce', { MINIMAX_API_KEY: 'configured', VIDEO_PROVIDER: 'minimax' });
  assert.ok(minimax && minimax.duration === 6 && minimax.resolution === '1080P');
});

test('customer errors hide provider transport details and preserve manual verification', () => {
  assert.equal(customerErrorMessage('UND_ERR_CONNECT_TIMEOUT'), '视频生成服务暂时无法连接');
  assert.equal(customerErrorMessage('Wan submission outcome unknown; manual verification required; no resubmission'), '提交状态不确定，请人工确认，系统不会重复扣费');
});

test('replay requires a passing visual QC artifact and sanitizes result errors', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const root = projectDir(id);
  const task = {
    id, project_id: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), requirement: 'demo', assets: [], status: 'COMPLETED', appMode: 'full', provider: 'wan', director: 'deepseek', logs: [],
    results: [{ id: 'V1', name: 'V1', status: 'completed', error: 'Wan HTTP 502' }],
    generationTasks: [{ id: 'job', variantId: 'V1', provider: 'wan', model: 'wanx2.1-i2v-plus', status: 'COMPLETED', attempt: 0, created_at: 'now', updated_at: 'now', request: { taskId: id, variantId: 'V1', model: 'wanx2.1-i2v-plus', mode: 'image-to-video', prompt: 'demo', duration: 5, aspect_ratio: '9:16', quality: 'high', resolution: '720P' } }],
  } as unknown as Task;
  try {
    await mkdir(path.join(root, 'results'), { recursive: true });
    await mkdir(path.join(root, 'quality', 'V1', 'attempt-0'), { recursive: true });
    for (const file of ['director-output.json', 'generation-plan.json', 'reference-evidence.json', 'runtime.json']) await writeFile(path.join(root, file), '{}');
    await writeFile(path.join(root, 'results', 'V1.mp4'), 'mp4');
    await writeFile(path.join(root, 'quality', 'V1', 'attempt-0', 'quality-report.json'), JSON.stringify({ passed: false, evaluation_mode: 'visual' }));
    assert.equal(await isVerifiedReplayTask(task), false);
    await writeFile(path.join(root, 'quality', 'V1', 'attempt-0', 'quality-report.json'), JSON.stringify({ passed: true, evaluation_mode: 'visual' }));
    assert.equal(await isVerifiedReplayTask(task), true);
    assert.equal(customerizeTask(task).results?.[0]?.error, '视频生成服务暂时无法连接');
  } finally { await rm(root, { recursive: true, force: true }); }
});
