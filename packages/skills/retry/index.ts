import type { QualityReport } from '../quality';
import type { VideoGenerationRequest } from '../../video-provider/types';

export interface RetryEvaluationResult {
  can_retry: boolean;
  attempt: number;
  refined_prompt: string;
  strategy: string;
  reason?: string;
}

export const MAX_RETRIES_PER_VARIANT = 2;

export function evaluateRetrySkill(
  report: QualityReport,
  request: VideoGenerationRequest,
  currentRetryCount = 0
): RetryEvaluationResult {
  if (currentRetryCount >= MAX_RETRIES_PER_VARIANT) {
    return {
      can_retry: false,
      attempt: currentRetryCount,
      refined_prompt: request.prompt,
      strategy: '已达到最大重试限制 (2 次)，停止重试并保留最后结果',
      reason: 'MAX_RETRIES_EXCEEDED',
    };
  }

  const nextAttempt = currentRetryCount + 1;
  const strategies: string[] = [];
  let additions = '';

  const issuesStr = report.issues.join('; ').toLowerCase();

  if (issuesStr.includes('motion') || issuesStr.includes('动作') || issuesStr.includes('瞬移')) {
    strategies.push('强化重心转移与自然肢体惯性阻尼');
    additions += ' Dynamic tuning: Ensure weight shifts naturally to the rear foot before any turn; arms move with organic asymmetric inertia; smooth settling.';
  }

  if (issuesStr.includes('product') || issuesStr.includes('商品') || issuesStr.includes('接触')) {
    strategies.push('强化人手与商品持续物理接触与展示动作');
    additions += ' Product showcase tuning: Hands maintain continuous, firm contact with the garment; deliberately display fabric texture and silhouette details.';
  }

  if (issuesStr.includes('camera') || issuesStr.includes('镜头') || issuesStr.includes('运镜')) {
    strategies.push('平滑摄影机运动轨迹');
    additions += ' Camera tuning: Move camera along a stabilized, gentle curve with steady focal tracking.';
  }

  if (strategies.length === 0) {
    strategies.push('优化动作节奏与微表情放松度');
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
  };
}
