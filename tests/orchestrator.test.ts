import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectDir, saveTask } from '../packages/shared/storage';
import { ffmpeg, mediaExec } from '../packages/video-analysis';
import type { Task, Variant } from '../packages/shared/types';
import { VideoProductionWorkflow } from '../packages/orchestrator/workflow';
import { isValidTransition } from '../packages/orchestrator/state';
import { evaluateProducerSkill } from '../packages/skills/producer';
import { evaluateQualitySkill } from '../packages/skills/quality';
import { evaluateRetrySkill, MAX_RETRIES_PER_VARIANT } from '../packages/skills/retry';

test('Workflow state machine validates legal and illegal transitions', () => {
  assert.equal(isValidTransition('CREATED', 'ANALYZING'), true);
  assert.equal(isValidTransition('ANALYZING', 'PLANNING'), true);
  assert.equal(isValidTransition('PLANNING', 'GENERATING'), true);
  assert.equal(isValidTransition('PLANNING', 'COMPLETED'), true);
  assert.equal(isValidTransition('GENERATING', 'REVIEWING'), true);
  assert.equal(isValidTransition('REVIEWING', 'RETRYING'), true);
  assert.equal(isValidTransition('REVIEWING', 'COMPLETED'), true);
  assert.equal(isValidTransition('RETRYING', 'GENERATING'), true);
  assert.equal(isValidTransition('COMPLETED', 'REVIEWING'), true);
  assert.equal(isValidTransition('GENERATING', 'FAILED'), true);
  assert.equal(isValidTransition('ANALYZING', 'FAILED'), true);

  // Illegal transitions
  assert.equal(isValidTransition('CREATED', 'COMPLETED'), false);
  assert.equal(isValidTransition('COMPLETED', 'ANALYZING'), false);
  assert.equal(isValidTransition('FAILED', 'PLANNING'), false);
  assert.equal(isValidTransition('CREATED', 'GENERATING'), false);
});

test('Producer Agent correctly routes based on appMode, environment, and taskType', () => {
  // Director mode -> none
  const dirDecision = evaluateProducerSkill(null, 'ecommerce', 'director', {});
  assert.equal(dirDecision.provider, 'none');
  assert.equal(dirDecision.model, 'none');

  // Mock mode -> mock
  const mockDecision = evaluateProducerSkill(null, 'ecommerce', 'mock', {});
  assert.equal(mockDecision.provider, 'mock');
  assert.equal(mockDecision.model, 'demo-only');

  // Full mode with MiniMax key -> minimax
  const mmDecision = evaluateProducerSkill(null, 'fashion', 'full', { MINIMAX_API_KEY: 'test-key' });
  assert.equal(mmDecision.provider, 'minimax');
  assert.equal(mmDecision.model, 'MiniMax-Hailuo-2.3');

  // Full mode with Wan key -> wan
  const wanDecision = evaluateProducerSkill(null, 'ecommerce', 'full', { WAN_API_KEY: 'test-key' });
  assert.equal(wanDecision.provider, 'wan');
  assert.equal(wanDecision.model, 'wanx2.1-i2v-plus');

  // Full mode with Seedance
  const seedanceDecision = evaluateProducerSkill(null, 'ecommerce', 'full', {
    SEEDANCE_API_KEY: 'test-key',
    SEEDANCE_MODEL: 'ep-seedance-1',
  });
  assert.equal(seedanceDecision.provider, 'seedance');
  assert.equal(seedanceDecision.model, 'ep-seedance-1');

  // Explicit VIDEO_PROVIDER override
  const veoDecision = evaluateProducerSkill(null, 'ecommerce', 'full', {
    VIDEO_PROVIDER: 'veo',
    VEO_API_KEY: 'test-veo-key',
  });
  assert.equal(veoDecision.provider, 'veo');
  assert.equal(veoDecision.model, 'veo-2.0-generate-001');

  // No key -> throws error
  assert.throws(
    () => evaluateProducerSkill(null, 'ecommerce', 'full', {}),
    /Provider unavailable/
  );
});

test('Quality Agent evaluates scores, dimensions, and pass/fail thresholds', async () => {
  const dummyVariant = {
    id: 'V1',
    name: 'Test Variant',
    creative_direction: 'Test direction',
    timeline: [
      { start_state: 'A', end_state: 'B', transition: 'smooth', duration: 4 },
      { start_state: 'B', end_state: 'C', transition: 'smooth', duration: 4 },
    ],
    performance: { gaze: 'forward' },
    product_showcase: [
      { feature: '领口', action: '轻触领口', camera_focus: '特写', evidence: 'product_01' },
      { feature: '下摆', action: '走动展示', camera_focus: '中景', evidence: 'product_02' },
    ],
    seedance_prompt: 'Cinematic shot of model with progressive weight shift',
    negative_prompt: 'deformed',
    structure: { camera_height: 'eye_level' },
  } as Variant;

  // Passing simulation
  const passReport = await evaluateQualitySkill('dummy.mp4', dummyVariant, 0, { mode: 'mock', simulatedScore: 85 });
  assert.equal(passReport.passed, true);
  assert.equal(passReport.overall_score, 85);
  assert.equal(passReport.issues.length, 0);

  // Failing simulation
  const failReport = await evaluateQualitySkill('dummy.mp4', dummyVariant, 0, { mode: 'mock',
    simulatedScore: 65,
    simulatedIssues: ['Motion glitch on footstep'],
  });
  assert.equal(failReport.passed, false);
  assert.equal(failReport.overall_score, 65);
  assert.ok(failReport.issues.includes('Motion glitch on footstep'));

  // Zero-byte file inspection
  const id = randomUUID();
  const root = projectDir(id);
  await mkdir(path.join(root, 'results'), { recursive: true });
  const emptyPath = path.join(root, 'results/V1.mp4');
  const fs = await import('node:fs/promises');
  await fs.writeFile(emptyPath, Buffer.alloc(0));

  const emptyReport = await evaluateQualitySkill(emptyPath, dummyVariant, 0, { mode: 'mock' });
  assert.equal(emptyReport.passed, false);
  assert.equal(emptyReport.overall_score, 0);
  assert.match(emptyReport.issues[0], /视频文件为空/);
});

test('Retry Agent enforces the single targeted Wan retry budget', () => {
  const request = {
    taskId: 'test-task',
    variantId: 'V1' as const,
    model: 'mock',
    mode: 'image-to-video' as const,
    prompt: 'Model walks wearing silk dress',
    duration: 8,
    aspect_ratio: '9:16' as const,
    quality: 'high' as const,
    resolution: '720P',
  };

  const report = {
    variant_id: 'V1' as const,
    attempt: 0,
    overall_score: 60,
    passed: false,
    dimensions: { motion_naturalness: 12, human_feeling: 15, product_fidelity: 15, camera_execution: 18 },
    issues: ['检测到突兀瞬移或非连续动作词', '商品卖点展示不明显'],
    recommendations: [],
    evaluated_at: new Date().toISOString(),
    evaluation_mode: 'mock' as const,
    evidence: [],
    retry_required: true,
  };

  // Attempt 0 -> Retry 1
  const retry1 = evaluateRetrySkill(report, request, 0);
  assert.equal(retry1.can_retry, true);
  assert.equal(retry1.attempt, 1);
  assert.match(retry1.refined_prompt, /weight shifts naturally/);
  assert.match(retry1.refined_prompt, /Product showcase tuning/);

  // Attempt 1 -> budget exhausted; a second paid attempt is forbidden.
  const retry2 = evaluateRetrySkill(report, { ...request, prompt: retry1.refined_prompt }, 1);
  assert.equal(retry2.can_retry, false);
  assert.equal(retry2.attempt, 1);

  // Attempt 2 -> Reached maximum
  const retry3 = evaluateRetrySkill(report, request, MAX_RETRIES_PER_VARIANT);
  assert.equal(retry3.can_retry, false);
  assert.equal(retry3.reason, 'MAX_RETRIES_EXCEEDED');

  const uncertainReport = { ...report, retry_required: false };
  const noRetry = evaluateRetrySkill(uncertainReport, request, 0);
  assert.equal(noRetry.can_retry, false);
  assert.equal(noRetry.reason, 'RETRY_NOT_REQUIRED');
});

test('End-to-end Mock Workflow runs full state machine, generates agent-run.json and recommendation', async () => {
  const id = randomUUID();
  const root = projectDir(id);
  await mkdir(path.join(root, 'uploads'), { recursive: true });

  // Generate synthetic reference video (8s 9:16)
  await mediaExec(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=navy:size=360x640:rate=10',
    '-t', '8', '-pix_fmt', 'yuv420p',
    path.join(root, 'uploads/reference.mp4'),
  ]);

  // Generate synthetic model & product images
  await mediaExec(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=purple:size=360x640',
    '-frames:v', '1',
    path.join(root, 'uploads/model.jpg'),
  ]);
  await mediaExec(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=gold:size=360x640',
    '-frames:v', '1',
    path.join(root, 'uploads/product.jpg'),
  ]);

  const task: Task = {
    id,
    project_id: id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    requirement: '制作自然女装商业导购广告，突出腰线与剪裁',
    assets: [
      { kind: 'reference', file: 'uploads/reference.mp4', name: 'reference.mp4', mime: 'video/mp4' },
      { kind: 'model', file: 'uploads/model.jpg', name: 'model.jpg', mime: 'image/jpeg' },
      { kind: 'product', file: 'uploads/product.jpg', name: 'product.jpg', mime: 'image/jpeg' },
    ],
    appMode: 'mock',
    director: 'mock',
    provider: 'mock',
    status: 'CREATED',
    logs: [],
    results: [],
    selectedVariants: ['V1', 'V2'],
  };
  await saveTask(task);

  // Run full workflow
  await VideoProductionWorkflow.run(task);

  // 1. Task status and results
  assert.equal(task.status, 'COMPLETED');
  assert.ok(task.plan);
  assert.equal(task.plan.variants.length, 3);
  assert.deepEqual(task.selectedVariants, ['V1', 'V2']);
  assert.equal(task.results.length, 2);
  assert.ok(task.results.every(r => r.status === 'completed' && r.url));
  assert.ok(task.results.every(r => typeof r.qualityScore === 'number' && r.qualityScore >= 75));

  // 2. Final recommendation
  assert.ok(task.finalRecommendation);
  assert.ok(['V1', 'V2'].includes(task.finalRecommendation.recommended_variant));
  assert.ok(task.finalRecommendation.score >= 75);
  assert.ok(task.finalRecommendation.rationale.length > 0);

  // 3. agent-run.json persistence & structure
  const runLogRaw = await readFile(path.join(root, 'agent-run.json'), 'utf8');
  const runLog = JSON.parse(runLogRaw);
  assert.equal(runLog.workflow_id, 'wf_' + id);
  assert.equal(runLog.task_id, id);
  assert.equal(runLog.status, 'COMPLETED');
  assert.equal(runLog.provider, 'mock');
  assert.ok(runLog.transitions.length >= 5);
  assert.ok(runLog.quality_reports.V1?.length > 0);
  assert.ok(runLog.quality_reports.V2?.length > 0);
  assert.equal(runLog.final_recommendation.recommended_variant, task.finalRecommendation.recommended_variant);
  assert.ok(runLog.timestamps.created_at);
  assert.ok(runLog.timestamps.completed_at);
});
