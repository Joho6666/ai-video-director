import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeUrl } from '../packages/reference-source';
test('rejects unsafe reference URLs', async () => { await assert.rejects(() => assertSafeUrl('file:///etc/passwd')); await assert.rejects(() => assertSafeUrl('http://127.0.0.1/video.mp4')); await assert.rejects(() => assertSafeUrl('http://192.168.1.2/video.mp4')); await assert.rejects(() => assertSafeUrl('http://[::1]/video.mp4')); await assert.rejects(() => assertSafeUrl('http://100.64.0.1/video.mp4')); });
