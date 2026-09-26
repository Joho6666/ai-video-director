import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreViral } from '../packages/reference-source';
test('returns explainable unknown score when metrics are missing', () => { const result = scoreViral({ id:'x', platform:'douyin', provider:'tikhub', sourceUrl:'https://x' }); assert.equal(result.viralScore, 0); assert.deepEqual(result.viralReasons, ['互动数据未知']); });
test('rewards engagement and share velocity signals', () => { const result = scoreViral({ id:'x', platform:'douyin', provider:'tikhub', sourceUrl:'https://x', metrics:{ views:100000, likes:12000, shares:3000 }, author:{ followers:1000 } }); assert.ok(result.viralScore > 50); assert.ok(result.viralReasons.includes('高点赞率')); });
// Douyin's search API reports play_count as 0 even for popular clips, so the
// rate-based tier cannot rank them. Real counters captured from a live search
// must still produce a usable, differentiating score.
test('ranks by engagement volume when the play count is missing', () => {
  const base = { id: 'x', platform: 'douyin' as const, provider: 'tikhub' as const, sourceUrl: 'https://x' };
  const popular = scoreViral({ ...base, metrics: { views: 0, likes: 3204, comments: 99, shares: 349, favorites: 1359 } });
  const quiet = scoreViral({ ...base, metrics: { views: 0, likes: 8, comments: 0, shares: 0, favorites: 1 } });
  assert.ok(popular.viralScore > 0, '有互动数据时不应恒为 0');
  assert.ok(popular.viralScore > quiet.viralScore, `${popular.viralScore} 应高于 ${quiet.viralScore}`);
  assert.ok(popular.viralReasons.some(reason => reason.includes('播放量缺失')), '必须说明这是估算而非实测');
  assert.ok(popular.viralReasons.some(reason => reason.includes('分享量较高')));
  // A clip with no counters at all still refuses to invent a score.
  assert.equal(scoreViral({ ...base, metrics: { views: 0 } }).viralScore, 0);
});
