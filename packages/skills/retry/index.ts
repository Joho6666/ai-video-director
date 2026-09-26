import type { QualityReport } from '../quality';
import type { VideoGenerationRequest } from '../../video-provider/types';

export interface RetryEvaluationResult {
  can_retry: boolean;
  attempt: number;
  refined_prompt: string;
  strategy: string;
  reason?: string;
  target_issues?: string[];
}

export const MAX_RETRIES_PER_VARIANT = 1;
export const RemixRetryIssue = {
  HOOK_MISMATCH: 'HOOK_MISMATCH', SHOT_STRUCTURE_MISMATCH: 'SHOT_STRUCTURE_MISMATCH', CAMERA_MISMATCH: 'CAMERA_MISMATCH', MOTION_MISMATCH: 'MOTION_MISMATCH', PACING_MISMATCH: 'PACING_MISMATCH', CHARACTER_DRIFT: 'CHARACTER_DRIFT', PRODUCT_DRIFT: 'PRODUCT_DRIFT', SCENE_DRIFT: 'SCENE_DRIFT', HUMAN_UNNATURAL: 'HUMAN_UNNATURAL', QUALITY_LOW: 'QUALITY_LOW',
} as const;

export function evaluateRetrySkill(
  report: QualityReport,
  request: VideoGenerationRequest,
  currentRetryCount = 0
): RetryEvaluationResult {
  // A retry is only safe when the visual QC server explicitly identified an
  // evidence-backed, repairable defect. Network/auth/JSON failures and
  // uncertainty deliberately set retry_required=false and must never trigger
  // another paid generation request.
  if (report.retry_required !== true) {
    return {
      can_retry: false,
      attempt: currentRetryCount,
      refined_prompt: request.prompt,
      strategy: '没有证据支持的可修复视觉缺陷，禁止付费重试',
      reason: 'RETRY_NOT_REQUIRED',
    };
  }
  if (currentRetryCount >= MAX_RETRIES_PER_VARIANT) {
    return {
      can_retry: false,
      attempt: currentRetryCount,
      refined_prompt: request.prompt,
      strategy: '已达到最大重试限制 (1 次)，停止重试并保留最后结果',
      reason: 'MAX_RETRIES_EXCEEDED',
    };
  }

  const nextAttempt = currentRetryCount + 1;
  const strategies: string[] = [];
  const targetIssues: string[] = [];
  let additions = '';

  const issuesStr = report.issues.join('; ').toLowerCase();
  const targeted = (needle: string, code: keyof typeof RemixRetryIssue) => { if (issuesStr.includes(needle)) targetIssues.push(RemixRetryIssue[code]); };
  targeted('hook', 'HOOK_MISMATCH'); targeted('shot structure', 'SHOT_STRUCTURE_MISMATCH'); targeted('pacing', 'PACING_MISMATCH'); targeted('character', 'CHARACTER_DRIFT'); targeted('scene', 'SCENE_DRIFT'); targeted('unnatural', 'HUMAN_UNNATURAL');

  // 1. Robotic arm / 机械手臂缺陷局部补丁
  if (issuesStr.includes('robotic arm') || issuesStr.includes('机械手') || issuesStr.includes('僵硬手') || issuesStr.includes('arm')) {
    strategies.push('针对机械手臂缺陷：注入自然非对称钟摆律动与指关节微屈微动约束');
    targetIssues.push('robotic_arm');
    additions += ' Anti-robotic arm patch: Arms swing with natural asymmetric pendulum motion; fingers remain relaxed with subtle knuckle flexion, avoiding synchronous or rigid limbs.';
  }

  // 2. Unnatural turn / 转体僵硬缺陷局部补丁
  if (issuesStr.includes('unnatural turn') || issuesStr.includes('转体') || issuesStr.includes('转身') || issuesStr.includes('turn') || issuesStr.includes('瞬移')) {
    strategies.push('针对转体僵硬缺陷：注入视线先行、颈部引导转头、带动肩胸躯干的时间差层级约束');
    targetIssues.push('unnatural_turn');
    additions += ' Natural turn patch: The eye gaze shifts first, followed by head and neck rotation, which organically leads the shoulders and torso with realistic hierarchical delay; weight shifts decisively to the pivot foot before body turn.';
  }

  // 3. Product disappearance/morph / 商品闪现/形变缺陷局部补丁
  if (issuesStr.includes('product disappearance') || issuesStr.includes('morph') || issuesStr.includes('形变') || issuesStr.includes('闪现') || issuesStr.includes('丢失') || issuesStr.includes('穿模') || issuesStr.includes('mismatch') || issuesStr.includes('not visible') || issuesStr.includes('不一致') || issuesStr.includes('不可见')) {
    strategies.push('针对商品错配、形变或缺失：锁定首帧商品外观、持续接触与镜头焦点');
    // Keep the historical product_morph label for persisted reports and UI
    // consumers, while exposing the more precise v1.1 consistency category.
    targetIssues.push('product_consistency', 'product_morph');
    additions += ' Product consistency patch: Preserve exactly the product already visible in the supplied first frame: same color, silhouette, pattern, seams and proportions. Keep one hand in uninterrupted physical contact with it; frame it in a stable medium close shot without flickering or morphing, with no replacement or disappearance.';
  }

  // 4. General motion dynamics (compatibility & baseline tuning)
  if (issuesStr.includes('motion') || issuesStr.includes('动作') || issuesStr.includes('步态') || issuesStr.includes('gait')) {
    if (!additions.includes('weight shifts naturally')) {
      strategies.push('强化重心转移与自然肢体惯性阻尼');
      targetIssues.push('motion_inertia');
      additions += ' Dynamic tuning: Ensure weight shifts naturally to the rear foot before any turn; arms move with organic asymmetric inertia; smooth settling.';
    }
  }

  // 5. General product showcase tuning (compatibility)
  if (issuesStr.includes('product') || issuesStr.includes('商品') || issuesStr.includes('接触') || issuesStr.includes('卖点')) {
    if (!additions.includes('Product showcase tuning')) {
      strategies.push('强化人手与商品持续物理接触与展示动作');
      targetIssues.push('product_showcase');
      additions += ' Product showcase tuning: Hands maintain continuous, firm contact with the garment; deliberately display fabric texture and silhouette details.';
    }
  }

  // 6. Camera stabilization & tracking
  if (issuesStr.includes('camera') || issuesStr.includes('镜头') || issuesStr.includes('运镜')) {
    strategies.push('平滑摄影机运动轨迹');
    targetIssues.push('camera_tracking');
    additions += ' Camera tuning: Move camera along a stabilized, gentle curve with steady focal tracking.';
  }

  if (strategies.length === 0) {
    strategies.push('优化动作节奏与微表情放松度');
    targetIssues.push('general_relaxation');
    additions += ' Relaxed commercial performance: Gaze leads head movement smoothly, maintaining professional and warm presenter demeanor.';
  }

  // Combine and constrain to 2000 chars
  let refined = request.prompt;
  if (refined.length + additions.length <= 2000) {
    refined = refined + additions;
  } else {
    // Trim from middle if necessary
    const budget = 2000 - additions.length - 10;
    refined = refined.slice(0, budget) + '...' + additions;
  }

  return {
    can_retry: true,
    attempt: nextAttempt,
    refined_prompt: refined,
    strategy: strategies.join('；'),
    target_issues: targetIssues,
  };
}
