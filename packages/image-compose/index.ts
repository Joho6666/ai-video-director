import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Asset, Task } from '../shared/types';
import { jsonWrite, projectDir, saveTask } from '../shared/storage';
import { ffmpeg, mediaExec } from '../video-analysis';
import { QwenImageEditClient, resolveQwenEditConfig } from './qwen-edit';
import { checkComposedFrame, type ComposeGateReport } from './gate';
import type { JsonCompletionClient } from '../shared/llm-json-repair';

export { QwenImageEditClient, resolveQwenEditConfig } from './qwen-edit';
export { checkComposedFrame, composeGatePassed } from './gate';

type Env = Record<string, string | undefined>;
const COMPOSE_DIR = 'production/compose';
const OUTPUT_FILE = 'uploads/auto-first-frame.jpg';

export function autoComposeEnabled(env: Env) {
  return env.AUTO_COMPOSE_FIRST_FRAME !== 'off';
}

/** A task can have its first frame composed when it has none yet and supplies all three inputs. */
export function needsComposedFirstFrame(task: Task) {
  if (task.assets.some(asset => asset.kind === 'first_frame')) return false;
  return ['reference', 'model', 'product'].every(kind => task.assets.some(asset => asset.kind === kind));
}

export function composePrompt(task: Task) {
  const wear = task.taskType === 'fashion' ? 'wearing' : 'wearing or holding';
  return [
    'Image 1 is the target model. Image 2 is the target product. Image 3 is a frame from a reference commercial video.',
    `Recreate Image 3 with the person from Image 1 ${wear} the product from Image 2, replacing the original person and product completely.`,
    "Keep Image 3's scene, camera angle, framing, pose, lighting and color grading.",
    "Preserve the product from Image 2 exactly: same silhouette, color, pattern, print, logo and proportions. Keep the face, hair and skin tone of Image 1.",
    'Photorealistic single frame, no text, no watermark, no split screen.',
  ].join(' ');
}

const NEGATIVE = 'different product, recolored product, altered pattern, extra logo, text, watermark, split screen, collage, deformed hands, extra fingers, blurry, low quality';

async function toJpeg(source: string, target: string, filter: string, seek?: number) {
  await mkdir(path.dirname(target), { recursive: true });
  await mediaExec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...(seek !== undefined ? ['-ss', String(seek)] : []), '-i', source, '-vf', filter, '-frames:v', '1', '-q:v', '2', target]);
  return readFile(target);
}

/**
 * Compose "target model + target product in the reference shot" as the video
 * first frame, then gate it before any video is paid for. On success a
 * `first_frame` asset is added, so the existing prepareFirstFrame / provider
 * path is unchanged. Throws (and adds nothing) when the frame fails the gate.
 * Idempotent: an existing first_frame asset is never recomposed.
 */
export async function composeFirstFrame(task: Task, options: {
  env?: Env;
  transport?: typeof fetch;
  gateClient?: JsonCompletionClient;
} = {}): Promise<Asset> {
  const existing = task.assets.find(asset => asset.kind === 'first_frame');
  if (existing) return existing;
  const env = options.env ?? process.env;
  const find = (kind: Asset['kind']) => {
    const asset = task.assets.find(a => a.kind === kind);
    if (!asset) throw new Error(`自动合成首帧缺少${({ reference: '参考视频', model: '模特图', product: '商品图' } as Record<string, string>)[kind] || kind}`);
    return asset;
  };
  const root = projectDir(task.id);
  const dir = path.join(root, COMPOSE_DIR);
  const reference = find('reference');
  const model = find('model');
  const product = find('product');

  const client = new QwenImageEditClient(resolveQwenEditConfig(env), options.transport);
  const fit = (edge: number) => `scale=${edge}:${edge}:force_original_aspect_ratio=decrease`;
  const modelJpg = await toJpeg(path.join(root, model.file), path.join(dir, 'input-model.jpg'), fit(1536));
  const productJpg = await toJpeg(path.join(root, product.file), path.join(dir, 'input-product.jpg'), fit(1536));
  // Skip the very first frame (often black or a transition). The last image
  // decides the output aspect ratio, so the 9:16 reference frame goes last.
  const referenceJpg = await toJpeg(path.join(root, reference.file), path.join(dir, 'input-reference.jpg'),
    'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2', 0.3);

  const edit = await client.edit({
    images: [{ data: modelJpg, mime: 'image/jpeg' }, { data: productJpg, mime: 'image/jpeg' }, { data: referenceJpg, mime: 'image/jpeg' }],
    prompt: composePrompt(task),
    negativePrompt: NEGATIVE,
    size: '1080*1920',
  });
  const composedRaw = await client.download(edit.url);
  await writeFile(path.join(dir, 'composed.png'), composedRaw);
  const composedJpg = await toJpeg(path.join(dir, 'composed.png'), path.join(root, OUTPUT_FILE),
    'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2');

  let gate: ComposeGateReport;
  try {
    gate = await checkComposedFrame({ images: { model: modelJpg, product: productJpg, reference: referenceJpg, composed: composedJpg }, env, client: options.gateClient });
  } catch (error) {
    await jsonWrite(path.join(dir, 'compose-report.json'), { model: client.model, request_id: edit.requestId, gate_error: error instanceof Error ? error.message : String(error) });
    throw new Error(`自动合成首帧检查失败，未提交视频：${error instanceof Error ? error.message : String(error)}`);
  }
  const report = { model: client.model, request_id: edit.requestId, prompt: composePrompt(task), output: OUTPUT_FILE, gate, created_at: new Date().toISOString() };
  await jsonWrite(path.join(dir, 'compose-report.json'), report);
  if (!gate.passed) {
    const reasons = [gate.product, gate.person, gate.composition].filter(item => item.verdict !== 'match').map(item => item.description);
    throw new Error(`自动合成首帧未通过一致性检查，未提交视频（可改为手动上传首帧）：${[...reasons, ...gate.issues].join('；') || '商品未确认一致'}`);
  }

  const asset: Asset = {
    name: 'auto-first-frame.jpg', file: OUTPUT_FILE, mime: 'image/jpeg', kind: 'first_frame',
    metadata: { auto_composed: true, compose_model: client.model, compose_request_id: edit.requestId, gate: { product: gate.product.verdict, person: gate.person.verdict, composition: gate.composition.verdict } },
  };
  task.assets.push(asset);
  task.logs.push({ time: new Date().toISOString(), message: `已自动合成首帧（${client.model}），商品/人物一致性检查通过` });
  await saveTask(task);
  return asset;
}
