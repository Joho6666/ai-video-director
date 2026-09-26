import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, normalizeTikHub } from '../packages/reference-source';

test('detects supported platforms', () => {
  assert.equal(detectPlatform('https://www.tiktok.com/@a/video/1'), 'tiktok');
  assert.equal(detectPlatform('https://www.instagram.com/reel/abc'), 'instagram');
  assert.equal(detectPlatform('https://www.douyin.com/video/1'), 'douyin');
});
test('normalizes TikHub data without inventing absent metrics', () => {
  const value = normalizeTikHub({ data: { aweme_id: 'x1', desc: 'demo', author: { nickname: 'A' }, statistics: { digg_count: 4 }, video: { duration: 6000, play_addr: { url_list: ['https://cdn.example/x.mp4'] } } } }, 'https://www.douyin.com/video/1', 'douyin');
  assert.equal(value.id, 'x1'); assert.equal(value.duration, 6); assert.equal(value.metrics?.likes, 4); assert.equal(value.metrics?.views, undefined); assert.equal(value.videoUrl, 'https://cdn.example/x.mp4');
});
