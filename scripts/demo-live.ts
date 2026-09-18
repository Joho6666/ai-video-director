import path from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { loadLocalEnv } from './env';
import { startServer, stopServer } from './test-server';
import { projectDir } from '../packages/shared/storage';
import { runPreflight } from './demo-preflight-lib';
import { exec as execCommand } from 'node:child_process';
import { promisify } from 'node:util';

type GoldenCase = { reference_video: string; model_image: string; product_image: string; requirement: string; selected_variant: 'V1'|'V2'|'V3'; provider_preference: 'wan'|'minimax' };
const exec = promisify(execCommand);

async function submit(base: string, golden: GoldenCase) {
  const form = new FormData();
  const read = async (relative: string, name: string, type: string) => new File([await readFile(path.resolve(process.cwd(), relative))], name, { type });
  form.set('referenceVideo', await read(golden.reference_video, 'reference.mp4', 'video/mp4'));
  form.append('modelImages', await read(golden.model_image, 'model.jpg', 'image/jpeg'));
  form.append('productImages', await read(golden.product_image, 'product.jpg', 'image/jpeg'));
  form.set('requirement', golden.requirement);
  form.set('selectedVariants', JSON.stringify([golden.selected_variant]));
  const response = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: form });
  const body = await response.json() as { id?: string; error?: string };
  if (!response.ok || !body.id) throw new Error(body.error || `task submission failed (${response.status})`);
  return body.id;
}

await loadLocalEnv();
const preflight = await runPreflight({ quiet: true, requireLive: true });
if (!preflight.ok) {
  const report = '# Demo Rehearsal Report\n\nLIVE REHEARSAL = UNAVAILABLE\n\nPreflight did not pass; no paid request was submitted.\n';
  await writeFile(path.join(process.cwd(), 'DEMO_REHEARSAL_REPORT.md'), report, 'utf8');
  console.log(report);
  process.exit(0);
}
try {
  // Live demo must never start against a stale shared .next directory.
  await exec('npm run build', { cwd: process.cwd(), timeout: 10 * 60_000, windowsHide: true });
} catch {
  const report = '# Demo Rehearsal Report\n\nLIVE REHEARSAL = UNAVAILABLE\n\nFresh production build failed; no paid request was submitted.\n';
  await writeFile(path.join(process.cwd(), 'DEMO_REHEARSAL_REPORT.md'), report, 'utf8');
  console.log(report);
  process.exit(0);
}
const golden = JSON.parse(await readFile(path.join(process.cwd(), 'demo', 'golden-case.json'), 'utf8')) as GoldenCase;
const started = Date.now();
let server: { base: string; child: ReturnType<typeof startServer> extends Promise<infer T> ? T extends { child: infer C } ? C : never : never } | undefined;
try {
  const runtime = await startServer({ APP_MODE: 'full', VIDEO_PROVIDER: golden.provider_preference, MAX_RETRIES: '1' });
  server = { base: runtime.base, child: runtime.child };
  const taskId = await submit(runtime.base, golden);
  const deadline = Date.now() + 35 * 60_000;
  let last: Record<string, unknown> = {};
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const response = await fetch(`${runtime.base}/api/tasks/${taskId}`, { cache: 'no-store' });
    last = await response.json() as Record<string, unknown>;
    if (last.status === 'COMPLETED' || last.status === 'FAILED') break;
    if (Date.now() > deadline) throw new Error('live rehearsal timeout; remote task remains resumable');
  }
  const taskRoot = projectDir(taskId);
  const results = Array.isArray(last.results) ? last.results : [];
  const result = results.find((item) => (item as { id?: string }).id === golden.selected_variant) as { url?: string; qualityScore?: number; status?: string } | undefined;
  const videoPath = path.join(taskRoot, 'results', `${golden.selected_variant}.mp4`);
  const videoExists = await stat(videoPath).then(info => info.isFile() && info.size > 0).catch(() => false);
  const report = [
    '# Demo Rehearsal Report', '',
    `- LIVE REHEARSAL = ${last.status === 'COMPLETED' && videoExists ? 'PASS' : 'FAIL'}`,
    `- task: ${taskId}`,
    `- provider: ${String(last.provider || golden.provider_preference)}`,
    `- model: ${(last.generationTasks as Array<{ model?: string }> | undefined)?.find(item => item.model)?.model || 'configured model'}`,
    `- variant: ${golden.selected_variant}`,
    `- total_ms: ${Date.now() - started}`,
    `- final_status: ${String(last.status || 'unknown')}`,
    `- final_mp4: ${videoExists ? 'PASS' : 'FAIL'}`,
    `- quality_score: ${result?.qualityScore ?? 'not available'}`,
    `- retry: ${Array.isArray((last as { generationTasks?: unknown }).generationTasks) && ((last as { generationTasks: Array<{ attempt?: number }> }).generationTasks.some(item => (item.attempt ?? 0) > 0)) ? 'USED' : 'NOT_REQUIRED'}`,
    '', 'Only sanitized task metadata is recorded. No key, signed URL, absolute path, or customer media is included.',
  ].join('\n');
  await writeFile(path.join(process.cwd(), 'DEMO_REHEARSAL_REPORT.md'), report, 'utf8');
  console.log(report);
} catch (error) {
  const report = `# Demo Rehearsal Report\n\nLIVE REHEARSAL = FAIL\n\n${error instanceof Error ? error.message : 'live rehearsal failed'}\n\nThe durable task ledger must be used for recovery; no automatic resubmission was performed.\n`;
  await writeFile(path.join(process.cwd(), 'DEMO_REHEARSAL_REPORT.md'), report, 'utf8');
  console.log(report);
  process.exitCode = 1;
} finally {
  if (server) stopServer(server.child);
}
