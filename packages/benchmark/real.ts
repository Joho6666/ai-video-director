import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { projectDir, jsonWrite } from '../shared/storage';
import type { Asset, Task } from '../shared/types';
import { ffmpeg, mediaExec, preprocess } from '../video-analysis';
import { DeepSeekDirectorAdapter } from '../agent/deepseek';
import { executeGeneration, productionPrompt } from '../agent/production';
import { routeProvider, resolveVideoRoute } from '../video-provider/router';
import type { GenerationTask, VideoGenerationProvider } from '../video-provider/types';
import { evaluateBlindVideoFile, type QualityReport } from '../skills/quality';
import { recordFailure, classifyFailureCategory } from './failures';
import { calculateDirectorScore, calculateOutcomeClassification } from './scoring';
import type {
  BenchmarkCase,
  BenchmarkRunManifest,
  BenchmarkSuiteResult,
  CaseComparison,
  EvaluationScores,
} from './types';
import { loadBenchmarkCases } from './synthetic';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileHash(file: string) {
  return sha256(await readFile(file));
}

function envAsset(env: Record<string, string | undefined>, caseItem: BenchmarkCase, field: 'reference_video' | 'model_image' | 'product_image') {
  const explicit = caseItem[field];
  if (explicit) return path.resolve(explicit);
  const name = field === 'reference_video' ? 'REFERENCE_VIDEO' : field === 'model_image' ? 'MODEL_IMAGE' : 'PRODUCT_IMAGE';
  const perCase = env[`BENCHMARK_${caseItem.id.toUpperCase()}_${name}`];
  const common = env[`BENCHMARK_${name}`];
  return perCase ? path.resolve(perCase) : common ? path.resolve(common) : undefined;
}

function qualityScores(report: QualityReport): EvaluationScores {
  const dimensions = {
    motion_naturalness: report.dimensions.motion_naturalness ?? 0,
    human_realism: report.dimensions.human_realism ?? report.dimensions.human_feeling ?? 0,
    product_consistency: report.dimensions.product_consistency ?? report.dimensions.product_fidelity ?? 0,
    commercial_quality: report.dimensions.commercial_quality ?? report.dimensions.camera_execution ?? 0,
  };
  return { ...dimensions, director_score: calculateDirectorScore(dimensions) };
}

function promptHash(prompt: string) { return sha256(prompt); }

function blindAssignment(caseId: string) {
  const directorFirst = Number.parseInt(sha256(`${caseId}:${randomUUID()}`).slice(0, 2), 16) % 2 === 0;
  return directorFirst
    ? { case_id: caseId, video_A_arm: 'director' as const, video_B_arm: 'baseline' as const }
    : { case_id: caseId, video_A_arm: 'baseline' as const, video_B_arm: 'director' as const };
}

function comparisonFromReports(caseItem: BenchmarkCase, baseline: QualityReport, director: QualityReport): CaseComparison {
  const base = qualityScores(baseline);
  const directed = qualityScores(director);
  const delta = Number((directed.director_score - base.director_score).toFixed(1));
  const refBase = baseline.reference_similarity_score ?? 0;
  const refDirector = director.reference_similarity_score ?? 0;
  return {
    case_id: caseItem.id,
    case_name: caseItem.name,
    category: caseItem.category,
    baseline: { score: base.director_score, dimensions: base, reference_similarity: refBase, issues: baseline.issues },
    director: { score: directed.director_score, dimensions: directed, reference_similarity: refDirector, issues: director.issues },
    delta,
    motion_delta: directed.motion_naturalness - base.motion_naturalness,
    human_delta: directed.human_realism - base.human_realism,
    product_delta: directed.product_consistency - base.product_consistency,
    camera_delta: directed.commercial_quality - base.commercial_quality,
    reference_similarity_delta: Number((refDirector - refBase).toFixed(1)),
    winner: delta > 0 ? 'director' : delta < 0 ? 'baseline' : 'tie',
    highlights: [...director.issues.map(issue => `Director issue: ${issue}`), ...baseline.issues.map(issue => `Baseline issue: ${issue}`)],
    baseline_scores: base,
    director_scores: directed,
    score_delta: delta,
  };
}

function realReport(cases: CaseComparison[], provider: string, model: string, runId: string) {
  const avgBase = cases.length ? cases.reduce((sum, item) => sum + item.baseline.score, 0) / cases.length : 0;
  const avgDirector = cases.length ? cases.reduce((sum, item) => sum + item.director.score, 0) / cases.length : 0;
  const avgDelta = avgDirector - avgBase;
  const outcome = calculateOutcomeClassification(avgDelta);
  const lines = [
    '# AI Video Director v1.3 Real Benchmark',
    '',
    '> REAL VIDEO EVIDENCE ONLY. Scores below come from blind visual review; no preset scores or simulated fallback are used.',
    '',
    `- run_id: \`${runId}\``,
    `- provider/model: \`${provider} / ${model}\``,
    `- outcome: **${outcome}**`,
    `- average baseline: **${avgBase.toFixed(1)} / 100**`,
    `- average director: **${avgDirector.toFixed(1)} / 100**`,
    `- average delta: **${avgDelta >= 0 ? '+' : ''}${avgDelta.toFixed(1)}**`,
    '',
    '| Case | Baseline | Director | Delta | Winner | Reference similarity (B/D) |',
    '|---|---:|---:|---:|---|---:|',
  ];
  for (const item of cases) lines.push(`| ${item.case_id} | ${item.baseline.score.toFixed(1)} | ${item.director.score.toFixed(1)} | ${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)} | ${item.winner} | ${item.baseline.reference_similarity.toFixed(1)} / ${item.director.reference_similarity.toFixed(1)} |`);
  lines.push('', '## Blind review boundary', '', 'Quality score is Motion 30% + Human 25% + Product 25% + Commercial Camera 20%. Reference similarity is reported separately and does not change the quality score.', '', 'No conclusion is valid beyond the generated assets and the cases in this run.');
  return lines.join('\n');
}

type PreparedCase = { reference: string; model: string; product: string };
type RealRoute = Exclude<ReturnType<typeof resolveVideoRoute>, null>;

export interface BenchmarkGenerationLedgerEntry {
  job_id: string;
  case_id: string;
  arm: 'baseline' | 'director';
  provider: string;
  model: string;
  status: GenerationTask['status'];
  submission_started_at?: string;
  remote_task_id?: string;
  attempt: number;
  updated_at: string;
  result_file?: string;
}

export async function readGenerationLedger(runDir: string): Promise<BenchmarkGenerationLedgerEntry[]> {
  const file = path.join(runDir, 'generation-ledger.json');
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) throw new Error('generation ledger must be an array');
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || typeof (item as { job_id?: unknown }).job_id !== 'string' ||
        typeof (item as { case_id?: unknown }).case_id !== 'string' ||
        !['baseline', 'director'].includes(String((item as { arm?: unknown }).arm)) ||
        typeof (item as { provider?: unknown }).provider !== 'string' ||
        typeof (item as { model?: unknown }).model !== 'string' ||
        typeof (item as { status?: unknown }).status !== 'string' ||
        typeof (item as { attempt?: unknown }).attempt !== 'number') {
        throw new Error('generation ledger entry is invalid');
      }
    }
    return parsed as BenchmarkGenerationLedgerEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error(`Generation ledger is invalid; refusing to reset or resubmit: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function writeGenerationLedger(runDir: string, ledger: BenchmarkGenerationLedgerEntry[]) {
  await jsonWrite(path.join(runDir, 'generation-ledger.json'), ledger);
}

async function prepareTask(caseItem: BenchmarkCase, assets: PreparedCase, duration: number): Promise<{ task: Task; planPrompt: string }> {
  const id = randomUUID();
  const root = projectDir(id);
  await mkdir(path.join(root, 'assets'), { recursive: true });
  const copyAsset = async (source: string, kind: Asset['kind'], ext: string): Promise<Asset> => {
    const file = `assets/${kind}${ext}`;
    await copyFile(source, path.join(root, file));
    return { name: path.basename(source), file, mime: 'image/jpeg', kind };
  };
  const referenceAsset: Asset = { name: path.basename(assets.reference), file: 'reference.mp4', mime: 'video/mp4', kind: 'reference' };
  await copyFile(assets.reference, path.join(root, referenceAsset.file));
  await mkdir(path.join(root, 'production'), { recursive: true });
  await mediaExec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(root, referenceAsset.file), '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2', '-frames:v', '1', '-q:v', '3', path.join(root, 'production', 'first-frame.jpg')]);
  const modelAsset = await copyAsset(assets.model, 'model', path.extname(assets.model) || '.jpg');
  const productAsset = await copyAsset(assets.product, 'product', path.extname(assets.product) || '.jpg');
  const task: Task = {
    id,
    project_id: id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    requirement: caseItem.requirement,
    assets: [referenceAsset, modelAsset, productAsset],
    status: 'CREATED',
    appMode: 'director',
    provider: null,
    director: 'deepseek',
    logs: [],
    results: [],
    taskType: caseItem.category === 'womenswear' ? 'fashion' : 'ecommerce',
  };
  task.metadata = await preprocess(path.join(root, referenceAsset.file), path.join(root, 'reference'));
  const planned = await new DeepSeekDirectorAdapter().plan(task);
  task.plan = planned.plan;
  const prompt = productionPrompt(task.plan.variants[0], duration).prompt;
  return { task, planPrompt: prompt };
}

async function generateArm(
  task: Task,
  provider: VideoGenerationProvider,
  prompt: string,
  arm: 'baseline' | 'director',
  route: RealRoute,
  caseId: string,
  runDir: string,
  ledger: BenchmarkGenerationLedgerEntry[],
) {
  const root = projectDir(task.id);
  const firstFrame = { id: 'first_frame_01', file: 'production/first-frame.jpg', sha256: await fileHash(path.join(root, 'production', 'first-frame.jpg')) };
  const existing = ledger.find(entry => entry.case_id === caseId && entry.arm === arm);
  if (existing && existing.provider !== route.provider) throw new Error(`Generation ledger provider mismatch for ${caseId}/${arm}`);
  if (existing && existing.model !== route.model) throw new Error(`Generation ledger model mismatch for ${caseId}/${arm}`);
  if (existing && existing.submission_started_at && !existing.remote_task_id) {
    throw new Error(`MANUAL_VERIFICATION_REQUIRED: ${caseId}/${arm} submission started without remote task ID; no resubmission`);
  }
  const id = existing?.job_id || randomUUID();
  const job: GenerationTask = {
    id, variantId: 'V1', provider: provider.name, model: route.model, status: existing?.remote_task_id ? (existing.status === 'COMPLETED' ? 'PROCESSING' : existing.status) : 'PENDING', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    request: { taskId: task.id, variantId: 'V1', model: route.model, mode: 'image-to-video', prompt, duration: route.duration, aspect_ratio: route.aspect_ratio, quality: 'high', resolution: route.resolution, firstFrame },
  };
  if (existing?.remote_task_id) job.task_id = existing.remote_task_id;
  if (existing?.submission_started_at) job.submission_started_at = existing.submission_started_at;
  const entry: BenchmarkGenerationLedgerEntry = existing || {
    job_id: id, case_id: caseId, arm, provider: route.provider, model: route.model,
    status: 'PENDING', attempt: 0, updated_at: new Date().toISOString(),
  };
  if (!existing) ledger.push(entry);
  const persist = async () => {
    entry.status = job.status;
    entry.submission_started_at = job.submission_started_at;
    entry.remote_task_id = job.task_id;
    entry.updated_at = new Date().toISOString();
    await writeGenerationLedger(runDir, ledger);
  };
  // The intent is durable before any paid createTask call.
  await persist();
  const target = path.join(root, 'results', `${arm}.mp4`);
  await executeGeneration(job, provider, persist, async url => {
    if (provider.name === 'mock') throw new Error('Real benchmark cannot use Mock Provider');
    const { downloadVideo } = await import('../agent/production');
    await downloadVideo(url, target, route.duration);
    return target;
  }, { pollMs: 5000, timeoutMs: 20 * 60_000 });
  entry.result_file = path.relative(runDir, target).replaceAll(path.sep, '/');
  await persist();
  return { job, file: target };
}

export async function runRealBenchmark(options: { casesDir?: string; outputReportPath?: string; env?: Record<string, string | undefined>; runId?: string } = {}): Promise<BenchmarkSuiteResult> {
  const env = options.env ?? process.env;
  const runId = options.runId || env.BENCHMARK_RUN_ID || `real-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const runDir = path.join(process.cwd(), 'benchmark', 'runs', runId);
  await mkdir(runDir, { recursive: true });
  const generationLedger = await readGenerationLedger(runDir);
  const unavailable = async (error: string): Promise<BenchmarkSuiteResult> => {
    const result: BenchmarkSuiteResult = { mode: 'real', run_id: runId, timestamp: new Date().toISOString(), provider: 'unavailable', model: 'unavailable', cases: [], average_baseline_score: 0, average_director_score: 0, average_delta: 0, outcome: 'NO VERIFIED ADVANTAGE', report_markdown: `# AI Video Director v1.3 Real Benchmark\n\nREAL_BENCHMARK = UNAVAILABLE\n\n${error}\n`, status: 'UNAVAILABLE', error };
    await writeFile(path.join(runDir, 'UNAVAILABLE.md'), result.report_markdown, 'utf8');
    if (options.outputReportPath) await writeFile(options.outputReportPath, result.report_markdown, 'utf8');
    return result;
  };
  const failed = async (error: string): Promise<BenchmarkSuiteResult> => {
    const result: BenchmarkSuiteResult = { mode: 'real', run_id: runId, timestamp: new Date().toISOString(), provider: routeName, model: routeModel, cases: [], average_baseline_score: 0, average_director_score: 0, average_delta: 0, outcome: 'NO VERIFIED ADVANTAGE', report_markdown: `# AI Video Director v1.3 Real Benchmark\n\nREAL_BENCHMARK = FAILED\n\n${error}\n`, status: 'FAILED', error };
    await writeFile(path.join(runDir, 'FAILED.md'), result.report_markdown, 'utf8');
    if (options.outputReportPath) await writeFile(options.outputReportPath, result.report_markdown, 'utf8');
    return result;
  };
  if (!env.DEEPSEEK_API_KEY) return unavailable('DEEPSEEK_API_KEY missing');
  let route: ReturnType<typeof resolveVideoRoute>;
  let routeName = 'unavailable';
  let routeModel = 'unavailable';
  try { route = resolveVideoRoute('full', 'ecommerce', env); } catch (error) { return unavailable(error instanceof Error ? error.message : String(error)); }
  if (!route || route.provider === 'mock') return unavailable('No real video provider configured');
  routeName = route.provider;
  routeModel = route.model;
  let provider: VideoGenerationProvider;
  try { provider = routeProvider('full', 'ecommerce', env); } catch (error) { return unavailable(error instanceof Error ? error.message : String(error)); }
  let cases: BenchmarkCase[];
  try {
    const maxCases = Math.max(1, Math.min(5, Number.parseInt(env.BENCHMARK_MAX_CASES || '3', 10) || 3));
    cases = (await loadBenchmarkCases(options.casesDir ?? path.join(process.cwd(), 'benchmark', 'cases'))).slice(0, maxCases);
  } catch (error) { return failed(error instanceof Error ? error.message : String(error)); }
  const manifest: BenchmarkRunManifest = { run_id: runId, created_at: new Date().toISOString(), mode: 'real', provider: route.provider, model: route.model, duration: route.duration, resolution: route.resolution, cases: [] };
  const comparisons: CaseComparison[] = [];
  try {
    for (const caseItem of cases) {
      const reference = envAsset(env, caseItem, 'reference_video');
      const model = envAsset(env, caseItem, 'model_image');
      const product = envAsset(env, caseItem, 'product_image');
      if (!reference || !model || !product) throw new Error(`UNAVAILABLE: ${caseItem.id} missing reference/model/product asset; set BENCHMARK_* paths`);
      const prepared = { reference, model, product };
      for (const file of [reference, model, product]) {
        try { const info = await stat(file); if (!info.isFile() || !info.size) throw new Error('empty'); }
        catch { throw new Error(`UNAVAILABLE: benchmark asset is missing or empty: ${path.basename(file)}`); }
      }
      const [refStat, modelStat, productStat] = await Promise.all([readFile(reference), readFile(model), readFile(product)]);
      const { task, planPrompt } = await prepareTask(caseItem, prepared, route.duration);
      const baselinePrompt = caseItem.baseline_prompt;
      const assignment = blindAssignment(caseItem.id);
      const baseline = await generateArm(task, provider, baselinePrompt, 'baseline', route, caseItem.id, runDir, generationLedger);
      const director = await generateArm(task, provider, planPrompt, 'director', route, caseItem.id, runDir, generationLedger);
      const baselineLabel = assignment.video_A_arm === 'baseline' ? 'video_A' : 'video_B';
      const directorLabel = assignment.video_A_arm === 'director' ? 'video_A' : 'video_B';
      const baseQc = await evaluateBlindVideoFile(baseline.file, baselineLabel, path.join(runDir, caseItem.id, 'baseline-qc'), { commercialRequirement: caseItem.requirement, productImagePath: product, modelImagePath: model, referenceVideoPath: reference, env });
      const directorQc = await evaluateBlindVideoFile(director.file, directorLabel, path.join(runDir, caseItem.id, 'director-qc'), { commercialRequirement: caseItem.requirement, productImagePath: product, modelImagePath: model, referenceVideoPath: reference, env });
      const comparison = comparisonFromReports(caseItem, baseQc, directorQc);
      comparisons.push(comparison);
      const reports: Array<['baseline' | 'director_v1', QualityReport]> = [['baseline', baseQc], ['director_v1', directorQc]];
      for (const [arm, report] of reports) {
        if (report.issues.length) await recordFailure(path.join(process.cwd(), 'benchmark', 'failures'), { failure_id: randomUUID(), case_id: caseItem.id, timestamp: new Date().toISOString(), provider: route.provider, model: route.model, prompt_version: arm, issues: report.issues.map(description => ({ category: classifyFailureCategory(description), description })), severity: report.passed ? 'low' : 'medium' });
      }
      manifest.cases.push({ case_id: caseItem.id, baseline_prompt_hash: promptHash(baselinePrompt), director_prompt_hash: promptHash(planPrompt), asset_hashes: { reference_video: sha256(refStat), model_image: sha256(modelStat), product_image: sha256(productStat) }, generation_task_ids: { baseline: baseline.job.task_id, director: director.job.task_id }, blind_assignment: assignment });
      await writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
      await writeFile(path.join(runDir, 'comparison.json'), JSON.stringify({ run_id: runId, case_id: caseItem.id, comparison }, null, 2), 'utf8');
      await sleep(10);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = message.startsWith('UNAVAILABLE:') ? await unavailable(message) : await failed(message);
    await writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await writeFile(path.join(runDir, 'UNAVAILABLE.md'), result.report_markdown, 'utf8');
    return result;
  }
  const avgBaseline = comparisons.reduce((sum, item) => sum + item.baseline.score, 0) / (comparisons.length || 1);
  const avgDirector = comparisons.reduce((sum, item) => sum + item.director.score, 0) / (comparisons.length || 1);
  const avgDelta = avgDirector - avgBaseline;
  const report = realReport(comparisons, route.provider, route.model, runId);
  const result: BenchmarkSuiteResult = { mode: 'real', run_id: runId, timestamp: new Date().toISOString(), provider: route.provider, model: route.model, cases: comparisons, average_baseline_score: Number(avgBaseline.toFixed(1)), average_director_score: Number(avgDirector.toFixed(1)), average_delta: Number(avgDelta.toFixed(1)), outcome: calculateOutcomeClassification(avgDelta), report_markdown: report, status: 'COMPLETED' };
  await writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(path.join(runDir, 'comparison.json'), JSON.stringify({ run_id: runId, cases: comparisons, average_delta: result.average_delta, outcome: result.outcome }, null, 2), 'utf8');
  await writeFile(options.outputReportPath ?? path.join(process.cwd(), 'benchmark', 'reports', 'REAL_COMPARISON_REPORT.md'), report, 'utf8');
  return result;
}
