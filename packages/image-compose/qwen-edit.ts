import { z } from 'zod';

// Verified against help.aliyun.com/zh/model-studio/qwen-image-edit-api on 2026-09-26:
// synchronous POST /api/v1/services/aigc/multimodal-generation/generation,
// one user message with 1-3 {image} items then exactly one {text}; output
// aspect ratio follows the LAST image; size "W*H" with W,H in [512,2048];
// result URLs expire after 24h. dashscope.aliyuncs.com remains valid.
export const QWEN_EDIT_MODELS = ['qwen-image-edit-plus', 'qwen-image-edit-max'] as const;
export type QwenEditModel = typeof QWEN_EDIT_MODELS[number];
export const QWEN_EDIT_DEFAULT_MODEL: QwenEditModel = 'qwen-image-edit-plus';
const OFFICIAL_BASES = ['https://dashscope.aliyuncs.com', 'https://dashscope-intl.aliyuncs.com'];
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 30 * 1024 * 1024;

export interface EditImageInput { data: Buffer; mime: 'image/jpeg' | 'image/png' }
export interface EditRequest {
  images: EditImageInput[];
  prompt: string;
  negativePrompt?: string;
  size: `${number}*${number}`;
  seed?: number;
}
export interface EditResult { url: string; requestId: string; width?: number; height?: number }

const responseSchema = z.object({
  request_id: z.string().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
  output: z.object({
    choices: z.array(z.object({
      message: z.object({ content: z.array(z.object({ image: z.string().optional() }).passthrough()) }).passthrough(),
    }).passthrough()).min(1),
  }).passthrough().optional(),
  usage: z.object({ width: z.number().optional(), height: z.number().optional() }).passthrough().optional(),
}).passthrough();

export function resolveQwenEditConfig(env: Record<string, string | undefined>) {
  const key = env.WAN_API_KEY || env.DASHSCOPE_API_KEY || '';
  if (!key) throw new Error('UNAVAILABLE: 自动合成首帧需要 WAN_API_KEY / DASHSCOPE_API_KEY');
  const base = (env.WAN_BASE_URL || 'https://dashscope.aliyuncs.com').replace(/\/$/, '');
  if (!OFFICIAL_BASES.includes(base)) throw new Error('DashScope base URL must be an official HTTPS endpoint');
  const model = (env.IMAGE_COMPOSE_MODEL || QWEN_EDIT_DEFAULT_MODEL) as QwenEditModel;
  if (!QWEN_EDIT_MODELS.includes(model)) throw new Error(`图像编辑模型未验证：${model}`);
  return { key, base, model };
}

/** Only DashScope result storage may be fetched (the URL comes from a paid response, never from user input). */
export function isTrustedResultUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && /(^|\.)aliyuncs\.com$/.test(parsed.hostname);
  } catch {
    return false;
  }
}

export class QwenImageEditClient {
  constructor(
    private readonly config: { key: string; base: string; model: QwenEditModel },
    private readonly transport: typeof fetch = fetch,
  ) {}

  get model() { return this.config.model; }

  /** Single-shot paid call: never retried automatically. */
  async edit(input: EditRequest): Promise<EditResult> {
    if (input.images.length < 1 || input.images.length > 3) throw new Error('Qwen image edit accepts 1-3 images');
    if (input.images.some(image => !image.data.length || image.data.length > MAX_INPUT_BYTES)) throw new Error('Qwen image edit input must be 1 byte to 10 MB');
    if (!input.prompt.trim()) throw new Error('Qwen image edit prompt is empty');
    const [w, h] = input.size.split('*').map(Number);
    if (![w, h].every(v => Number.isInteger(v) && v >= 512 && v <= 2048)) throw new Error('Qwen image edit size must be within 512-2048');

    const body = {
      model: this.config.model,
      input: {
        messages: [{
          role: 'user',
          content: [
            ...input.images.map(image => ({ image: `data:${image.mime};base64,${image.data.toString('base64')}` })),
            { text: input.prompt },
          ],
        }],
      },
      parameters: {
        n: 1,
        size: input.size,
        prompt_extend: false,
        watermark: false,
        ...(input.negativePrompt ? { negative_prompt: input.negativePrompt.slice(0, 500) } : {}),
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      },
    };

    let response: Response;
    try {
      response = await this.transport(`${this.config.base}/api/v1/services/aigc/multimodal-generation/generation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
        redirect: 'error',
      });
    } catch (error) {
      throw new Error(`Qwen image edit request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const data = responseSchema.parse(await response.json().catch(() => ({})));
    if (!response.ok || data.code) throw new Error(`Qwen image edit error ${data.code || `HTTP ${response.status}`}: ${data.message || 'unknown'}`);
    const url = data.output?.choices[0].message.content.find(item => item.image)?.image;
    if (!url || !isTrustedResultUrl(url)) throw new Error('Qwen image edit returned no trusted image URL');
    return { url, requestId: data.request_id || '', width: data.usage?.width, height: data.usage?.height };
  }

  /** Result URLs expire in 24h, so download immediately. */
  async download(url: string): Promise<Buffer> {
    if (!isTrustedResultUrl(url)) throw new Error('Refusing to download an untrusted image URL');
    const response = await this.transport(url, { signal: AbortSignal.timeout(120_000), redirect: 'error' });
    if (!response.ok) throw new Error(`Composed image download HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) throw new Error('Composed image download size invalid');
    return bytes;
  }
}
