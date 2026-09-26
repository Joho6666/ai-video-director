import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreViral } from '../packages/reference-source';
test('returns explainable unknown score when metrics are missing', () => { const result = scoreViral({ id:'x', platform:'douyin', provider:'tikhub', sourceUrl:'https://x' }); assert.equal(result.viralScore, 0); assert.deepEqual(result.viralReasons, ['互动数据未知']); });
test('rewards engagement and share velocity signals', () => { const result = scoreViral({ id:'x', platform:'douyin', provider:'tikhub', sourceUrl:'https://x', metrics:{ views:100000, likes:12000, shares:3000 }, author:{ followers:1000 } }); assert.ok(result.viralScore > 50); assert.ok(result.viralReasons.includes('高点赞率')); });
