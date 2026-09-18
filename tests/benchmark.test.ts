import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  calculateDirectorScore,
  loadBenchmarkCases,
  evaluateCase,
  generateComparisonReport,
  runBenchmarkSuite,
} from '../packages/benchmark';

test('calculateDirectorScore applies exact 30/25/25/20 weights', () => {
  // Max score across all dimensions (25 * 4 = 100)
  const maxScore = calculateDirectorScore({
    motion_naturalness: 25,
    human_realism: 25,
    product_consistency: 25,
    commercial_quality: 25,
  });
  assert.equal(maxScore, 100);

  // Partial score testing weights
  // Motion (30%): 25 * 1.2 = 30
  // Human (25%): 20 * 1.0 = 20
  // Product (25%): 20 * 1.0 = 20
  // Camera (20%): 15 * 0.8 = 12
  // Total = 82
  const score = calculateDirectorScore({
    motion_naturalness: 25,
    human_realism: 20,
    product_consistency: 20,
    commercial_quality: 15,
  });
  assert.equal(score, 82);
});

test('loadBenchmarkCases loads all 5 core commercial categories', async () => {
  const casesDir = path.join(process.cwd(), 'benchmark', 'cases');
  const cases = await loadBenchmarkCases(casesDir);

  assert.equal(cases.length, 5);
  const categories = cases.map(c => c.category).sort();
  assert.deepEqual(categories, ['beauty', 'digital', 'food', 'lifestyle', 'womenswear']);

  for (const c of cases) {
    assert.ok(c.id);
    assert.ok(c.name);
    assert.ok(c.baseline_prompt);
    assert.ok(c.director_config.showcases.length >= 2);
  }
});

test('evaluateCase calculates deltas and highlights', async () => {
  const casesDir = path.join(process.cwd(), 'benchmark', 'cases');
  const cases = await loadBenchmarkCases(casesDir);
  const result = evaluateCase(cases[0]);

  assert.ok(result.director_scores.director_score > result.baseline_scores.director_score);
  assert.ok(result.score_delta > 0);
  assert.ok(result.motion_delta > 0);
  assert.ok(result.highlights.length >= 3);
});

test('generateComparisonReport generates complete Markdown report', async () => {
  const casesDir = path.join(process.cwd(), 'benchmark', 'cases');
  const cases = await loadBenchmarkCases(casesDir);
  const results = cases.map(c => evaluateCase(c));
  const report = generateComparisonReport(results);

  assert.match(report, /# AI Video Director v1.2 Benchmark 评测对比报告/);
  assert.match(report, /Motion Naturalness/);
  assert.match(report, /Human Realism/);
  assert.match(report, /Product Consistency/);
  assert.match(report, /Commercial Quality/);
  assert.match(report, /01_womenswear/);
  assert.match(report, /05_lifestyle/);
});

test('runBenchmarkSuite executes successfully', async () => {
  const casesDir = path.join(process.cwd(), 'benchmark', 'cases');
  const { results, report } = await runBenchmarkSuite(casesDir);

  assert.equal(results.length, 5);
  assert.ok(report.length > 500);
});
