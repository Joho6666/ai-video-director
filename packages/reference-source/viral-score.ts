import type { ReferenceVideo } from './types';

/**
 * Score a reference for "is this worth learning from".
 *
 * Two tiers, because the data sources differ:
 *
 * 1. **Play count available** — the original rate-based score: engagement per
 *    view, plus share velocity and a play/follower ratio.
 * 2. **Play count missing** — Douyin's search API returns `play_count: 0` even
 *    for popular videos, while likes/comments/shares/favorites are populated.
 *    Scoring only the rate path made every candidate 0, which destroyed the
 *    ranking that "pick the most reference-worthy clips" depends on. In this
 *    tier the score falls back to a log-scaled weighted engagement volume and
 *    says so in the reasons, so an estimate is never mistaken for a measured
 *    rate.
 *
 * A reference with genuinely no metrics still scores 0 with an explicit
 * "互动数据未知" reason rather than being guessed.
 */
export function scoreViral(reference: ReferenceVideo): { viralScore: number; viralReasons: string[] } {
  const m = reference.metrics || {};
  const reasons: string[] = [];
  const views = m.views || 0;
  const followers = reference.author?.followers;

  const rates = [
    m.likes != null && views ? m.likes / views : undefined,
    m.comments != null && views ? m.comments / views : undefined,
    m.shares != null && views ? m.shares / views : undefined,
  ].filter((x): x is number => x != null);

  let score = 0;
  if (rates.length) {
    score = Math.min(70, rates.reduce((a, b) => a + b, 0) * 1000);
    if (rates[0] != null && rates[0] > 0.08) reasons.push('高点赞率');
    if (rates[2] != null && rates[2] > 0.02) { score += 15; reasons.push('分享率较高'); }
  } else {
    // Weighted engagement volume: shares and saves signal stronger intent than
    // a like. 100 units maps to 0 and 100k units saturates the 70-point band.
    const engagement =
      (m.likes ?? 0) + (m.comments ?? 0) * 2 + (m.shares ?? 0) * 3 + (m.favorites ?? 0) * 2;
    if (engagement > 0) {
      score = Math.min(70, (Math.log10(engagement / 100) / Math.log10(1000)) * 70);
      reasons.push(`播放量缺失，按加权互动量 ${Math.round(engagement)} 估算`);
      if ((m.shares ?? 0) >= 200) reasons.push('分享量较高');
    } else {
      reasons.push('互动数据未知');
    }
  }

  if (followers && views > followers * 3) { score += 15; reasons.push('播放/粉丝比高'); }
  return { viralScore: Math.round(Math.max(0, Math.min(100, score))), viralReasons: reasons.length ? reasons : ['暂无足够指标'] };
}
