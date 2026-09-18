import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { runSyntheticBenchmark } from '../packages/benchmark/synthetic';
import { runRealBenchmark } from '../packages/benchmark/real';
import { evaluateBlindVideoFile } from '../packages/skills/quality';

test('synthetic benchmark is explicitly marked as simulated evidence', async () => {
  const result = await runSyntheticBenchmark(path.join(process.cwd(), 'benchmark', 'cases'));
  assert.match(result.report, /\[SIMULATED - NOT REAL VIDEO EVIDENCE\]/);
  assert.equal(result.results.length, 5);
});

test('real benchmark returns unavailable without credentials and never fabricates scores', async () => {
  const reportPath = path.join(os.tmpdir(), `ai-video-director-real-${Date.now()}.md`);
  const result = await runRealBenchmark({ env: {}, outputReportPath: reportPath });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.match(result.report_markdown, /REAL_BENCHMARK = UNAVAILABLE/);
  assert.equal(result.cases.length, 0);
  assert.match(await readFile(reportPath, 'utf8'), /DEEPSEEK_API_KEY missing/);
});

test('blind QC never converts a missing key into a simulated pass', async () => {
  await assert.rejects(
    () => evaluateBlindVideoFile('missing.mp4', 'video_A', path.join(os.tmpdir(), `qc-${Date.now()}`), {
      commercialRequirement: 'commercial test', productImagePath: 'product.jpg', modelImagePath: 'model.jpg', env: {},
    }),
    /UNAVAILABLE: DEEPSEEK_API_KEY missing/
  );
});
