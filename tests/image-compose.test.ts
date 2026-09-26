import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type OpenAI from 'openai';
import type { Task } from '../packages/shared/types';
import { projectDir, saveTask, readTask } from '../packages/shared/storage';
import { ffmpeg, ffprobe, mediaExec } from '../packages/video-analysis';
import { QwenImageEditClient, resolveQwenEditConfig, isTrustedResultUrl } from '../packages/image-compose/qwen-edit';
import { composeFirstFrame, composeGatePassed, needsComposedFirstFrame } from '../packages/image-compose';
import type { JsonCompletionClient } from '../packages/shared/llm-json-repair';

const env = { WAN_API_KEY: 'test-key', DEEPSEEK_API_KEY: 'test-deepseek' };
const RESULT_URL = 'https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/out.png?Expires=1';

function okEditResponse(url = RESULT_URL) {
  return new Response(JSON.stringify({ output: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: [{ image: url }] } }] }, usage: { width: 1088, height: 1920, image_count: 1 }, request_id: 'req-1' }), { status: 200 });
}

test('config only accepts official DashScope hosts and verified models', () => {
  assert.throws(() => resolveQwenEditConfig({}), /WAN_API_KEY/);
  assert.throws(() => resolveQwenEditConfig({ ...env, WAN_BASE_URL: 'https://evil.example.com' }), /official/);
  assert.throws(() => resolveQwenEditConfig({ ...env, IMAGE_COMPOSE_MODEL: 'qwen-image-edit' }), /未验证/);
  assert.equal(resolveQwenEditConfig(env).model, 'qwen-image-edit-plus');
});

test('edit request matches the documented multimodal-generation shape', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const transport = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return okEditResponse(); }) as unknown as typeof fetch;
  const client = new QwenImageEditClient(resolveQwenEditConfig(env), transport);
  const img = (n: number) => ({ data: Buffer.from([n, 1, 2]), mime: 'image/jpeg' as const });
  const result = await client.edit({ images: [img(1), img(2), img(3)], prompt: 'compose', size: '1080*1920', negativePrompt: 'text' });
  assert.equal(result.url, RESULT_URL);
  assert.equal(result.requestId, 'req-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer test-key');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.model, 'qwen-image-edit-plus');
  assert.equal(body.input.messages.length, 1);
  const content = body.input.messages[0].content;
  assert.equal(content.length, 4);
  assert.match(content[2].image, /^data:image\/jpeg;base64,/);
  assert.deepEqual(content[3], { text: 'compose' });
  assert.deepEqual(body.parameters, { n: 1, size: '1080*1920', prompt_extend: false, watermark: false, negative_prompt: 'text' });
});

test('edit rejects bad input, surfaces API errors and never trusts foreign URLs', async () => {
  const client = new QwenImageEditClient(resolveQwenEditConfig(env), (async () => new Response(JSON.stringify({ code: 'InvalidApiKey', message: 'Invalid API-key provided.' }), { status: 401 })) as unknown as typeof fetch);
  const img = { data: Buffer.from([1]), mime: 'image/jpeg' as const };
  await assert.rejects(client.edit({ images: [img, img, img, img], prompt: 'x', size: '1080*1920' }), /1-3 images/);
  await assert.rejects(client.edit({ images: [img], prompt: 'x', size: '4000*1920' }), /512-2048/);
  await assert.rejects(client.edit({ images: [img], prompt: 'x', size: '1080*1920' }), /InvalidApiKey/);
  const foreign = new QwenImageEditClient(resolveQwenEditConfig(env), (async () => okEditResponse('https://attacker.example.com/x.png')) as unknown as typeof fetch);
  await assert.rejects(foreign.edit({ images: [img], prompt: 'x', size: '1080*1920' }), /trusted/);
  await assert.rejects(foreign.download('http://169.254.169.254/latest'), /untrusted/);
  assert.equal(isTrustedResultUrl('https://aliyuncs.com.evil.com/x'), false);
});

test('gate passes only on a matching product and no contradicting person or composition', () => {
  const v = (product: string, person = 'match', composition = 'match') => ({ product: { verdict: product, description: 'd' }, person: { verdict: person, description: 'd' }, composition: { verdict: composition, description: 'd' }, issues: [] }) as Parameters<typeof composeGatePassed>[0];
  assert.equal(composeGatePassed(v('match')), true);
  assert.equal(composeGatePassed(v('match', 'uncertain')), true);
  assert.equal(composeGatePassed(v('uncertain')), false);
  assert.equal(composeGatePassed(v('mismatch')), false);
  assert.equal(composeGatePassed(v('match', 'mismatch')), false);
  assert.equal(composeGatePassed(v('match', 'match', 'mismatch')), false);
});

async function fixtureTask(): Promise<Task> {
  const id = randomUUID();
  const root = projectDir(id);
  await mkdir(path.join(root, 'uploads'), { recursive: true });
  const lavfi = async (src: string, out: string, extra: string[] = ['-frames:v', '1']) =>
    mediaExec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', src, ...extra, path.join(root, out)]);
  await lavfi('testsrc=size=360x640:rate=10:duration=2', 'uploads/reference.mp4', ['-pix_fmt', 'yuv420p']);
  await lavfi('color=c=pink:size=400x600', 'uploads/model.jpg');
  await lavfi('color=c=gold:size=500x500', 'uploads/product.png');
  const task = {
    id, project_id: id, createdAt: 'now', updatedAt: 'now', requirement: 'fixture', taskType: 'fashion',
    assets: [
      { kind: 'reference', file: 'uploads/reference.mp4', name: 'reference.mp4', mime: 'video/mp4' },
      { kind: 'model', file: 'uploads/model.jpg', name: 'model.jpg', mime: 'image/jpeg' },
      { kind: 'product', file: 'uploads/product.png', name: 'product.png', mime: 'image/png' },
    ],
    appMode: 'full', director: 'deepseek', provider: 'minimax', status: 'PLANNING', logs: [], results: [],
  } as unknown as Task;
  await saveTask(task);
  return task;
}

async function composedPng(root: string) {
  const file = path.join(root, 'fake-output.png');
  await mediaExec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:size=1088x1920', '-frames:v', '1', file]);
  return readFile(file);
}

function fakeDashScope(png: Buffer) {
  const bodies: any[] = [];
  const transport = (async (url: string, init?: RequestInit) => {
    if (url.includes('multimodal-generation')) { bodies.push(JSON.parse(String(init?.body))); return okEditResponse(); }
    if (url === RESULT_URL) return new Response(new Uint8Array(png), { status: 200 });
    throw new Error(`unexpected URL ${url}`);
  }) as unknown as typeof fetch;
  return { transport, bodies };
}

function fakeGate(verdict: 'match' | 'mismatch'): JsonCompletionClient {
  return { chat: { completions: { async create() {
    const content = JSON.stringify({ product: { verdict, description: verdict === 'match' ? 'same gold product' : 'product recolored' }, person: { verdict: 'match', description: 'same person' }, composition: { verdict: 'match', description: 'same framing' }, issues: [] });
    return { id: 'gate-1', model: 'fake', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] } as unknown as OpenAI.Chat.Completions.ChatCompletion;
  } } } };
}

test('needsComposedFirstFrame requires reference, model and product and no first frame', async () => {
  const task = await fixtureTask();
  assert.equal(needsComposedFirstFrame(task), true);
  assert.equal(needsComposedFirstFrame({ ...task, assets: task.assets.filter(a => a.kind !== 'model') }), false);
  assert.equal(needsComposedFirstFrame({ ...task, assets: [...task.assets, { kind: 'first_frame', file: 'x', name: 'x', mime: 'image/jpeg' }] }), false);
});

test('composeFirstFrame adds a gated 9:16 first_frame asset', async () => {
  const task = await fixtureTask();
  const root = projectDir(task.id);
  const { transport, bodies } = fakeDashScope(await composedPng(root));
  const asset = await composeFirstFrame(task, { env, transport, gateClient: fakeGate('match') });
  assert.equal(asset.kind, 'first_frame');
  assert.equal(asset.metadata?.auto_composed, true);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].input.messages[0].content.length, 4);
  assert.match(bodies[0].input.messages[0].content[3].text, /Image 1 is the target model/);
  const { stdout } = await mediaExec(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', path.join(root, asset.file)]);
  const stream = JSON.parse(stdout).streams[0];
  assert.deepEqual([stream.width, stream.height], [1080, 1920]);
  const report = JSON.parse(await readFile(path.join(root, 'production/compose/compose-report.json'), 'utf8'));
  assert.equal(report.gate.passed, true);
  assert.equal((await readTask(task.id)).assets.filter(a => a.kind === 'first_frame').length, 1);
  // Idempotent: a second call reuses the asset without another paid edit.
  await composeFirstFrame(task, { env, transport, gateClient: fakeGate('match') });
  assert.equal(bodies.length, 1);
});

test('a frame that fails the gate is never added as a first frame', async () => {
  const task = await fixtureTask();
  const root = projectDir(task.id);
  const { transport } = fakeDashScope(await composedPng(root));
  await assert.rejects(composeFirstFrame(task, { env, transport, gateClient: fakeGate('mismatch') }), /未通过一致性检查.*product recolored/);
  assert.equal(task.assets.some(a => a.kind === 'first_frame'), false);
  assert.equal((await readTask(task.id)).assets.some(a => a.kind === 'first_frame'), false);
  const report = JSON.parse(await readFile(path.join(root, 'production/compose/compose-report.json'), 'utf8'));
  assert.equal(report.gate.passed, false);
  await stat(path.join(root, 'production/compose/composed.png'));
});

test('full-mode scheduler stops before any paid submission when no first frame can be made', async () => {
  const { WorkflowScheduler } = await import('../packages/orchestrator/scheduler');
  const { WorkflowStateManager } = await import('../packages/orchestrator/state');
  const task = await fixtureTask();
  task.assets = task.assets.filter(a => a.kind !== 'model'); // cannot compose without the target model
  const variant = (id: 'V1' | 'V2' | 'V3') => ({ id, name: id, creative_direction: 'x', timeline: [{ start_state: 'a', end_state: 'b', transition: 't', duration: 4 }, { start_state: 'b', end_state: 'c', transition: 't', duration: 4 }], performance: {}, product_showcase: [] });
  task.plan = { variants: [variant('V1'), variant('V2'), variant('V3')] } as unknown as Task['plan'];
  task.selectedVariants = ['V1'];
  task.results = [{ id: 'V1', name: 'V1', status: 'waiting' }];
  await saveTask(task);
  let submissions = 0;
  const provider = { name: 'minimax', capabilities: { modes: ['image-to-video'], durations: [6], resolution: '1080P', aspectRatio: '9:16', maxPrompt: 2000 }, async createTask() { submissions++; return { id: 'x' }; }, async getTaskStatus() { return 'COMPLETED'; }, async getResult() { return { url: 'https://x', fileId: 'x' }; } };
  const state = new WorkflowStateManager(task.id, 'full');
  state.transition('ANALYZING', 'director', 'a');
  state.transition('PLANNING', 'director', 'p');
  await assert.rejects(
    new WorkflowScheduler().run(task, state, { skipPi: true, providerOverride: provider as never, env: { ...env, APP_MODE: 'full', MINIMAX_API_KEY: 'k' } }),
    /首帧/,
  );
  assert.equal(submissions, 0);
  await assert.rejects(stat(path.join(projectDir(task.id), 'generation-tasks.json')), /ENOENT/);
});
