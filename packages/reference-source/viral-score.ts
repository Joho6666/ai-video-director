import type { ReferenceVideo } from './types';
export function scoreViral(reference: ReferenceVideo): { viralScore: number; viralReasons: string[] } {
  const m = reference.metrics || {}; const reasons: string[] = []; const views = m.views || 0; const followers = reference.author?.followers;
  const rates = [m.likes != null && views ? m.likes / views : undefined, m.comments != null && views ? m.comments / views : undefined, m.shares != null && views ? m.shares / views : undefined].filter((x): x is number => x != null);
  let score = rates.length ? Math.min(70, rates.reduce((a, b) => a + b, 0) * 1000) : 0;
  if (rates[0] != null && rates[0] > 0.08) reasons.push('高点赞率');
  if (rates[2] != null && rates[2] > 0.02) { score += 15; reasons.push('分享率较高'); }
  if (followers && views > followers * 3) { score += 15; reasons.push('播放/粉丝比高'); }
  if (!rates.length && views === 0) reasons.push('互动数据未知');
  return { viralScore: Math.round(Math.max(0, Math.min(100, score))), viralReasons: reasons.length ? reasons : ['暂无足够指标'] };
}
