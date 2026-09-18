import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRetrySkill, MAX_RETRIES_PER_VARIANT } from '../packages/skills/retry';
import type { VideoGenerationRequest } from '../packages/video-provider/types';
import type { QualityReport } from '../packages/skills/quality';

const baseRequest: VideoGenerationRequest = {
  taskId: 'test-retry-task',
  variantId: 'V1',
  model: 'wan',
  mode: 'image-to-video',
  prompt: 'A model showcases autumn trench coat in studio.',
  duration: 8,
  aspect_ratio: '9:16',
  quality: 'high',
  resolution: '720P',
};

function createReport(issues: string[], retryRequired = true): QualityReport {
  return {
    variant_id: 'V1',
    attempt: 0,
    overall_score: 62,
    passed: false,
    dimensions: {
      motion_naturalness: 14,
      human_realism: 16,
      product_consistency: 14,
      commercial_quality: 18,
    },
    issues,
    recommendations: ['Apply targeted physical constraints'],
    evaluated_at: new Date().toISOString(),
    evaluation_mode: 'visual',
    evidence: [],
    retry_required: retryRequired,
  };
}

test('Retry Agent injects robotic arm patch when robotic arm defect detected', () => {
  const report = createReport(['检测到机械手臂僵硬 (robotic arm), 摆臂缺乏自然惯性']);
  const result = evaluateRetrySkill(report, baseRequest, 0);

  assert.equal(result.can_retry, true);
  assert.equal(result.attempt, 1);
  assert.ok(result.target_issues?.includes('robotic_arm'));
  assert.match(result.refined_prompt, /Anti-robotic arm patch/i);
  assert.match(result.refined_prompt, /asymmetric pendulum motion/i);
  assert.match(result.refined_prompt, /knuckle flexion/i);
});

test('Retry Agent injects natural turn patch when unnatural turn detected', () => {
  const report = createReport(['转体动作突兀 (unnatural turn), 视线未先行带动头颈']);
  const result = evaluateRetrySkill(report, baseRequest, 0);

  assert.equal(result.can_retry, true);
  assert.equal(result.attempt, 1);
  assert.ok(result.target_issues?.includes('unnatural_turn'));
  assert.match(result.refined_prompt, /Natural turn patch/i);
  assert.match(result.refined_prompt, /eye gaze shifts first/i);
  assert.match(result.refined_prompt, /pivot foot/i);
});

test('Retry Agent injects product consistency patch when product morphing detected', () => {
  const report = createReport(['商品在运动中闪现变形 (product disappearance / morph)']);
  const result = evaluateRetrySkill(report, baseRequest, 0);

  assert.equal(result.can_retry, true);
  assert.equal(result.attempt, 1);
  assert.ok(result.target_issues?.includes('product_morph'));
  assert.match(result.refined_prompt, /Product consistency patch/i);
  assert.match(result.refined_prompt, /uninterrupted physical contact/i);
  assert.match(result.refined_prompt, /without flickering or morphing/i);
});

test('Retry Agent halts when max retries exceeded or retry not required', () => {
  const report = createReport(['robotic arm']);
  const maxRetry = evaluateRetrySkill(report, baseRequest, MAX_RETRIES_PER_VARIANT);
  assert.equal(maxRetry.can_retry, false);
  assert.equal(maxRetry.reason, 'MAX_RETRIES_EXCEEDED');

  const noRetryReport = createReport(['robotic arm'], false);
  const noRetry = evaluateRetrySkill(noRetryReport, baseRequest, 0);
  assert.equal(noRetry.can_retry, false);
  assert.equal(noRetry.reason, 'RETRY_NOT_REQUIRED');
});