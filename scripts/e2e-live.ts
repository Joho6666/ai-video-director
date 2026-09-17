import { readFile, mkdir, copyFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import type { Task } from '../packages/shared/types';
import { projectDir, saveTask, jsonWrite, acquireTaskLock } from '../packages/shared/storage';
import { VideoProductionWorkflow } from '../packages/orchestrator/workflow';
import { validateVideo } from '../packages/agent/production';
import { ffmpeg, mediaExec } from '../packages/video-analysis';

try { process.loadEnvFile('.env.local'); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

type Result = 'PASS' | 'FAIL' | 'UNAVAILABLE' | 'NOT_TESTED' | 'NOT_REQUIRED';
interface PersistedPiEvent { type?: string; toolName?: string; }
interface PersistedQuality { evaluation_mode?: string; request_meta?: { id?: string; frame_count?: number }; evidence?: unknown[]; overall_score?: number; passed?: boolean; retry_required?: boolean; }
interface PersistedRunLog { pi_events?: PersistedPiEvent[]; quality_reports?: Record<string, PersistedQuality[]>; }
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
};
const workspace = process.cwd();
function sha256(data: Buffer) { return createHash('sha256').update(data).digest('hex'); }
function resultLine(name: string, value: Result) { return `| ${name} | ${value} |`; }

async function writeUnavailable(reason: string) {
  const report = `# AI Video Director v1.1 Real E2E

## Status

${reason}

| Stage | Result |
|---|---|
${resultLine('DeepSeek Director', 'UNAVAILABLE')}
${resultLine('Pi Runtime', 'NOT_TESTED')}
${resultLine('Wan/MiniMax video', 'UNAVAILABLE')}
${resultLine('Visual QC', 'NOT_TESTED')}
${resultLine('Quality gate', 'NOT_TESTED')}

No paid provider request was made.
`;
  await writeFile(path.join(workspace, 'REAL_E2E_REPORT.md'), report, 'utf8');
  await writeFile(path.join(workspace, 'V1.1_TRUE_AGENT_REPORT.md'), `# AI Video Director v1.1 True Agent Report

${reason}

The live closure is not claimed.
`, 'utf8');
}

function markdownReport(data: Record<string, unknown>) {
  const stage = (name: string) => String(data[name] ?? 'NOT_TESTED') as Result;
  const artifacts = (data.artifacts ?? {}) as Record<string, unknown>;
  const quality = (data.quality ?? {}) as Record<string, unknown>;
  const pi = (data.pi ?? {}) as Record<string, unknown>;
  return `# AI Video Director v1.1 Real E2E

## 1. Test environment

- Task: \`${data.task_id ?? 'none'}\`
- Provider: \`${data.provider ?? 'none'}\`
- Model: \`${data.model ?? 'unknown'}\`
- Selected versions: V1 only
- Input hashes: reference \`${data.reference_sha256 ?? 'n/a'}\`, model \`${data.model_sha256 ?? 'n/a'}\`, product \`${data.product_sha256 ?? 'n/a'}\`, first frame \`${data.first_frame_sha256 ?? 'n/a'}\`
- Material provenance: ${data.material_boundary ?? 'not recorded'}

## 2. Pipeline

| Stage | Result |
|---|---|
${resultLine('Director plan', stage('Director'))}
${resultLine('Pi Runtime', stage('Pi_Runtime'))}
${resultLine('Provider generation', stage('Generation'))}
${resultLine('Visual QC read', stage('Visual_QC'))}
${resultLine('Quality gate', stage('Quality_Gate'))}
${resultLine('Final MP4', stage('Final_MP4'))}
${resultLine('REAL_E2E', stage('REAL_E2E'))}

## 3. Pi audit

- Tool event count: ${pi.event_count ?? 0}
- Ordered tool sequence: ${(pi.sequence as string[] | undefined)?.join(' → ') || 'none'}
- Model calls: ${pi.model_calls ?? 'not available'}

## 4. Visual QC

- Evaluation mode: ${quality.evaluation_mode ?? 'none'}
- Overall score: ${quality.overall_score ?? 'unknown'}
- Passed: ${quality.passed ?? 'unknown'}
- Evidence items: ${quality.evidence_count ?? 0}
- Generated QC frames: ${quality.frame_count ?? 0}
- Retry required: ${quality.retry_required ?? 'unknown'}

## 5. Persisted artifacts

- Director artifacts: ${artifacts.director ?? 'FAIL'}
- Runtime: ${artifacts.runtime ?? 'FAIL'}
- Agent audit: ${artifacts.agent_run ?? 'FAIL'}
- Export whitelist: ${artifacts.exports ?? 'FAIL'}
- Video file: ${artifacts.video ?? 'FAIL'}

## 6. Boundary and follow-up

${data.notes ?? 'No additional notes.'}

This report contains hashes and sanitized summaries only; it does not contain credentials, source paths, raw provider responses or customer media.
`;
}

if (!process.env.DEEPSEEK_API_KEY?.trim()) {
  await writeUnavailable('UNAVAILABLE: DEEPSEEK_API_KEY missing');
  console.log('UNAVAILABLE: DEEPSEEK_API_KEY missing');
  process.exit(0);
}
const provider = process.env.WAN_API_KEY || process.env.DASHSCOPE_API_KEY ? 'wan' : process.env.MINIMAX_API_KEY ? 'minimax' : undefined;
if (!provider) {
  await writeUnavailable('UNAVAILABLE: WAN_API_KEY / MINIMAX_API_KEY missing');
  console.log('UNAVAILABLE: WAN_API_KEY / MINIMAX_API_KEY missing');
  process.exit(0);
}
const reference = arg('reference');
const model = arg('model');
const product = arg('product');
if (!reference || !model || !product) {
  await writeUnavailable('UNAVAILABLE: provide --reference, --model and --product; --first-frame is optional and can be derived from the reference video');
  console.log('UNAVAILABLE: missing live input assets');
  process.exit(0);
}
for (const file of [reference, model, product]) {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size === 0) {
    await writeUnavailable('UNAVAILABLE: one or more live input assets are missing or empty');
    console.log('UNAVAILABLE: missing or empty live input assets');
    process.exit(0);
  }
}

// A caller-supplied composed first frame is preferred. Deriving one keeps the
// technical test runnable while recording that product provenance was not
// independently verified.
const temp = await fsTemp();
let firstFrame = arg('first-frame');
let derivedFirstFrame = false;
if (!firstFrame) {
  firstFrame = path.join(temp, 'first-frame.jpg');
  await mediaExec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', reference, '-frames:v', '1', '-q:v', '3', firstFrame]);
  derivedFirstFrame = true;
}
const firstFrameInfo = await stat(firstFrame).catch(() => null);
if (!firstFrameInfo?.isFile() || firstFrameInfo.size === 0) {
  await writeUnavailable('UNAVAILABLE: first frame could not be prepared');
  console.log('UNAVAILABLE: first frame could not be prepared');
  process.exit(0);
}

process.env.APP_MODE = 'full';
process.env.VIDEO_PROVIDER = provider;
const id = randomUUID();
const root = projectDir(id);
await mkdir(path.join(root, 'uploads'), { recursive: true });
const inputFiles = { reference, model, product, first_frame: firstFrame };
const hashes: Record<string, string> = {};
const task: Task = {
  id, project_id: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  requirement: arg('requirement') || '参考真人商业视频，人物动作自然、持续保持商品外观，制作适合竖屏电商的 V1。',
  assets: [], status: 'CREATED', appMode: 'full', director: 'deepseek', provider,
  taskType: 'ecommerce', selectedVariants: ['V1'], logs: [], results: [],
};
for (const [kind, source] of Object.entries(inputFiles)) {
  const bytes = await readFile(source);
  hashes[kind] = sha256(bytes);
  const ext = kind === 'reference' ? path.extname(source).toLowerCase() : '.jpg';
  const file = `uploads/${kind}${ext}`;
  await copyFile(source, path.join(root, file));
  task.assets.push({ kind: kind as Task['assets'][number]['kind'], name: path.basename(file), file, mime: kind === 'reference' ? 'video/mp4' : 'image/jpeg' });
}
await saveTask(task);
await jsonWrite(path.join(root, 'live-input-manifest.json'), { hashes, provider, selected_variants: ['V1'], max_live_retry: 1, first_frame: derivedFirstFrame ? 'derived_from_reference_first_frame' : 'provided_by_caller' });
console.log(`LIVE task=${id} provider=${provider} variants=V1 max_live_retry=1`);

let failure: string | undefined;
const release = await acquireTaskLock(id);
if (!release) throw new Error('Task lock unavailable');
try {
  await VideoProductionWorkflow.run(task, { maxRetries: 1 });
} catch (error) {
  failure = error instanceof Error ? error.message : 'Workflow failed';
  task.status = 'FAILED';
  task.error = failure;
  await saveTask(task);
} finally {
  await release();
}
const present = async (file: string) => { const info = await stat(path.join(root, file)).catch(() => null); return Boolean(info?.isFile() && info.size > 0); };
const readJson = async (file: string): Promise<unknown> => readFile(path.join(root, file), 'utf8').then(JSON.parse).catch(() => null);
const runLog = (await readJson('agent-run.json')) as PersistedRunLog | null;
const latestJob = (task.generationTasks ?? []).filter(job => job.variantId === 'V1').at(-1);
let videoOk = false;
if (latestJob && await present('results/V1.mp4')) {
  try { await validateVideo(path.join(root, 'results/V1.mp4'), latestJob.request.duration); videoOk = true; } catch { /* recorded as FAIL below */ }
}
const piEvents = (runLog?.pi_events ?? []).filter((event: { type?: string; toolName?: string }) => event.type === 'tool_execution_end' && event.toolName);
const sequence = piEvents.flatMap(event => event.toolName ? [event.toolName] : []);
const retryExpected = sequence.includes('refine_generation');
const expectedPrefix = ['analyze_reference', 'build_director_plan', 'select_video_provider', 'generate_video', 'review_video'];
const expectedTail = retryExpected ? ['refine_generation', 'finalize_delivery'] : ['finalize_delivery'];
const piOk = sequence.length === expectedPrefix.length + expectedTail.length && expectedPrefix.every((name, index) => sequence[index] === name) && expectedTail.every((name, index) => sequence[expectedPrefix.length + index] === name);
const qualityReports = runLog?.quality_reports?.V1 ?? [];
const quality = qualityReports.at(-1) ?? {};
const exportNames = ['V1-prompt.txt', 'V2-prompt.txt', 'V3-prompt.txt', 'generation-plan.json', 'reference-evidence.json', 'assets-manifest.json', 'README.txt', 'director-plan.json', 'generation-request.json', 'provider-result.json', 'creative-package.zip'];
const exportOk = (await Promise.all(exportNames.map(name => present(`exports/${name}`)))).every(Boolean);
const artifacts = {
  // A plan without the persisted DeepSeek request metadata is not evidence
  // that the Director stage used the live model.
  director: (await present('reference-evidence.json') && await present('director-output.json') && await present('generation-plan.json') && await present('deepseek-request.json')) ? 'PASS' : 'FAIL',
  runtime: await present('runtime.json') ? 'PASS' : 'FAIL',
  agent_run: await present('agent-run.json') ? 'PASS' : 'FAIL',
  exports: exportOk ? 'PASS' : 'FAIL',
  video: videoOk ? 'PASS' : 'FAIL',
};
const visualRead = quality.evaluation_mode === 'visual' && typeof quality.request_meta?.id === 'string' && Array.isArray(quality.evidence) && quality.evidence.length >= 4;
const qualityGate = visualRead ? (quality.passed === true ? 'PASS' : 'FAIL') : 'FAIL';
const reportData: Record<string, unknown> = {
  task_id: id, provider, model: latestJob?.model ?? process.env.WAN_MODEL ?? process.env.MINIMAX_MODEL ?? 'unknown',
  reference_sha256: hashes.reference, model_sha256: hashes.model, product_sha256: hashes.product, first_frame_sha256: hashes.first_frame,
  material_boundary: derivedFirstFrame ? 'Technical closure only: first frame derived from reference; no independent authorization or same-source product provenance was supplied.' : 'Caller supplied first frame; authorization and same-source product provenance were not independently verified.',
  Director: artifacts.director === 'PASS' ? 'PASS' : 'FAIL', Pi_Runtime: piOk ? 'PASS' : 'FAIL', Generation: videoOk ? 'PASS' : 'FAIL',
  Visual_QC: visualRead ? 'PASS' : 'FAIL', Quality_Gate: qualityGate, Final_MP4: videoOk ? 'PASS' : 'FAIL',
  REAL_E2E: task.status === 'COMPLETED' && artifacts.director === 'PASS' && piOk && videoOk && visualRead && qualityGate === 'PASS' ? 'PASS' : 'FAIL',
  workflow_status: task.status, attempts: (task.generationTasks ?? []).filter(job => job.variantId === 'V1').length,
  pi: { event_count: piEvents.length, sequence, model_calls: piEvents.length ? 'recorded in sanitized event log' : 'none' },
  quality: { evaluation_mode: quality.evaluation_mode ?? null, overall_score: quality.overall_score ?? null, passed: quality.passed ?? null, evidence_count: quality.evidence?.length ?? 0, frame_count: quality.request_meta?.frame_count ?? null, retry_required: quality.retry_required ?? null },
  artifacts, notes: failure ? `Workflow failed: ${failure}. Inspect the local task directory for the sanitized error and artifacts.` : (qualityGate === 'PASS' ? 'Real Director, Pi, provider, downloaded MP4 and visual QC completed. This does not establish customer product fidelity or public authorization.' : 'A visual report was produced but the quality gate did not pass; the video remains available for review and is not recommended.'),
};
await jsonWrite(path.join(root, 'e2e-live-report.json'), reportData);
await writeFile(path.join(workspace, 'REAL_E2E_REPORT.md'), markdownReport(reportData), 'utf8');
await writeFile(path.join(workspace, 'V1.1_TRUE_AGENT_REPORT.md'), `# AI Video Director v1.1 True Agent Report

- REAL_E2E: **${reportData.REAL_E2E}**
- Director: **${reportData.Director}**
- Pi Runtime: **${reportData.Pi_Runtime}**
- Provider generation: **${reportData.Generation}**
- Visual QC read: **${reportData.Visual_QC}**
- Quality gate: **${reportData.Quality_Gate}**

Task \`${id}\` contains the full sanitized audit trail. The material boundary is recorded in \`REAL_E2E_REPORT.md\`; no claim of customer-level product fidelity or authorization is made.
`, 'utf8');
console.log(JSON.stringify(reportData));
if (reportData.REAL_E2E !== 'PASS') process.exitCode = 1;

async function fsTemp() {
  const dir = await fsMkdtemp(path.join(os.tmpdir(), 'ai-video-director-e2e-'));
  return dir;
}
async function fsMkdtemp(prefix: string) {
  const { mkdtemp } = await import('node:fs/promises');
  return mkdtemp(prefix);
}
