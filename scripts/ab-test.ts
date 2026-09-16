import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pairs = process.argv.slice(2).map((value, index, all) => value.startsWith('--') ? [value.slice(2), all[index + 1]] : null).filter(Boolean) as [string, string][];
const args = Object.fromEntries(pairs);
for (const key of ['reference-a', 'reference-b', 'model', 'product']) if (!args[key]) throw new Error(`Missing --${key}`);

const base = args.base || 'http://127.0.0.1:3000';
const requirement = args.requirement || '参考这个视频做 3 个女装广告，人物动作自然，像真人导购一样展示商品，不要机械复刻。';

async function hash(file: string) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

function fieldDiff(left: unknown, right: unknown, prefix = ''): string[] {
  if (JSON.stringify(left) === JSON.stringify(right)) return [];
  if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].flatMap(key => fieldDiff((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key));
  }
  return [prefix || 'value'];
}

function pickPlan(plan: unknown) {
  const value = plan as { reference_analysis: unknown; shot_dna: unknown; variants: Array<{ id: string; creative_direction: string; structure: unknown; product_showcase: unknown; seedance_prompt: string }> };
  return {
    reference_analysis: value.reference_analysis,
    shot_dna: value.shot_dna,
    variants: value.variants.map(variant => ({ id: variant.id, creative_direction: variant.creative_direction, structure: variant.structure, product_showcase: variant.product_showcase, seedance_prompt: variant.seedance_prompt })),
  };
}

async function run(label: string, reference: string) {
  const form = new FormData();
  form.set('referenceVideo', new File([await readFile(reference)], path.basename(reference), { type: 'video/mp4' }));
  form.append('modelImages', new File([await readFile(args.model)], path.basename(args.model), { type: 'image/jpeg' }));
  form.append('productImages', new File([await readFile(args.product)], path.basename(args.product), { type: 'image/jpeg' }));
  form.set('requirement', requirement);
  const created = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: form });
  const task = await created.json() as { id?: string; error?: string };
  if (!created.ok || !task.id) throw new Error(`${label}: ${task.error || created.status}`);
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const state = await (await fetch(`${base}/api/tasks/${task.id}`)).json() as { status: string; error?: string; plan?: unknown };
    if (state.status === 'COMPLETED') return { label, task_id: task.id, reference_sha256: await hash(reference), plan: state.plan };
    if (state.status === 'FAILED') throw new Error(`${label}: ${state.error}`);
    if (Date.now() > deadline) throw new Error(`${label}: timeout`);
  }
}

const a = await run('A', args['reference-a']);
const b = await run('B', args['reference-b']);
const selectedA = pickPlan(a.plan);
const selectedB = pickPlan(b.plan);
const report = {
  created_at: new Date().toISOString(),
  reference_a_sha256: a.reference_sha256,
  reference_b_sha256: b.reference_sha256,
  same_assets: { model_sha256: await hash(args.model), product_sha256: await hash(args.product), requirement },
  task_ids: { A: a.task_id, B: b.task_id },
  field_level_differences: fieldDiff(selectedA, selectedB),
  reference_analysis: { A: selectedA.reference_analysis, B: selectedB.reference_analysis },
  shot_dna: { A: selectedA.shot_dna, B: selectedB.shot_dna },
  variants: { A: selectedA.variants, B: selectedB.variants },
  manual_review_required: ['动作自然度与过渡', '人物路线与运镜差异', 'Evidence 对应帧准确性', 'KEEP / MUTATE 是否来自参考', '商品展示动作能否实际拍摄', '商品事实是否有证据'],
};
const directory = path.resolve('data', 'ab-tests');
await mkdir(directory, { recursive: true });
const output = path.join(directory, `${Date.now()}.json`);
await writeFile(output, JSON.stringify(report, null, 2));
console.log(output);
