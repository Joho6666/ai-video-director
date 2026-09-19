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
  assert.equal(customerErrorMessage('Visual quality did not pass; retained downloaded MP4'), '质量审核未通过，已保留成片供查看');
});

test('healthy progress logs survive customerization unchanged', () => {
  // Literal messages persisted by a run that worked. The previous sanitizer
  // matched on vendor/product words alone, so every one of these was rewritten
  // into a "服务暂时不可用" line and a successful run looked like an outage.
  const healthy = [
    '素材已保存',
    '正在读取视频元数据并动态抽取参考帧',
    'DeepSeek 正在识别人物动作并提取 Shot DNA',
    'Pi Tool analyze_reference 完成',
    'Producer Agent 生产决策：WAN (wanx2.1-i2v-plus) · 5s · Router resolved wan wanx2.1-i2v-plus for ecommerce (5s 720P)',
    'Pi Tool select_video_provider 完成',
    'Quality Agent 审核 V1：得分 57/100 [未通过] · 缺陷: qc_frame_01 至 qc_frame_08 之间人物下半身近似静止',
    '没有通过审核的推荐视频',
    'Pi Tool generate_video 完成',
  ];
  const task = { logs: healthy.map((message, index) => ({ time: `t${index}`, message })) } as unknown as Task;
  assert.deepEqual(customerizeTask(task).logs?.map(entry => entry.message), healthy);
});

test('raw transport failures inside logs are still masked', () => {
  const logs = [
    { time: 't0', message: 'Pi Tool generate_video 失败: fetch failed' },
    { time: 't1', message: 'Wan HTTP 502' },
  ];
  const task = { logs } as unknown as Task;
  assert.deepEqual(customerizeTask(task).logs?.map(entry => entry.message), [
    '视频生成服务暂时无法连接',
    '视频生成服务暂时无法连接',
  ]);
});

test('business guidance mentioning a provider keeps its meaning', () => {
  // "Wan ..." here is an instruction, not a connection failure.
  for (const message of [
    'Wan 高保真生成必须上传已包含目标模特与商品的成片首帧图',
    '商品质量问题没有满足可修复证据门槛，已保留成片且不重复扣费',
  ]) {
    assert.equal(customerErrorMessage(message), message);
  }
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
