import type { BenchmarkOutcome } from './types';

/**
 * AI Video Director Weighted Score:
 * Motion (30%) + Human (25%) + Product (25%) + Commercial Camera (20%)
 * Each input dimension is 0-25; multiplying by 4 scales to 0-100.
 * Score = (Motion * 4 * 0.3) + (Human * 4 * 0.25) + (Product * 4 * 0.25) + (Camera * 4 * 0.2)
 *       = Motion * 1.2 + Human * 1.0 + Product * 1.0 + Camera * 0.8
 */
export function calculateDirectorScore(dims: {
  motion_naturalness: number;
  human_realism?: number;
  human_feeling?: number;
  product_consistency?: number;
  product_fidelity?: number;
  commercial_quality?: number;
  camera_execution?: number;
}): number {
  const human = dims.human_realism ?? dims.human_feeling ?? 0;
  const product = dims.product_consistency ?? dims.product_fidelity ?? 0;
  const camera = dims.commercial_quality ?? dims.camera_execution ?? 0;
  const score =
    dims.motion_naturalness * 1.2 +
    human * 1.0 +
    product * 1.0 +
    camera * 0.8;
  return Number(score.toFixed(1));
}

/**
 * Three outcome classifications according to empirical benchmark protocol:
 * - Average Delta >= +8.0: PROMISING
 * - Average Delta +1.0 ~ +7.9: MARGINAL IMPROVEMENT
 * - Average Delta <= 0.0: NO VERIFIED ADVANTAGE
 */
export function calculateOutcomeClassification(avgDelta: number): BenchmarkOutcome {
  if (avgDelta >= 8.0) return 'PROMISING';
  if (avgDelta >= 1.0) return 'MARGINAL IMPROVEMENT';
  return 'NO VERIFIED ADVANTAGE';
}
