import type { Plan, AppMode } from '../../shared/types';
import { MINIMAX_MODEL, MINIMAX_CAPABILITIES } from '../../video-provider/providers/minimax';
import { WAN_MODEL, WAN_CAPABILITIES } from '../../video-provider/providers/wan';
import { nearestDuration } from '../../video-provider/router';

export interface ProducerDecision {
  provider: 'mock' | 'minimax' | 'wan' | 'seedance' | 'veo' | 'none';
  model: string;
  duration: number;
  resolution: string;
  aspect_ratio: '9:16';
  rationale: string;
}

export function evaluateProducerSkill(
  plan?: Plan | null,
  taskType: 'fashion' | 'ecommerce' = 'ecommerce',
  appMode: AppMode = 'mock',
  env: Record<string, string | undefined> = process.env
): ProducerDecision {
  if (appMode === 'director') {
    return {
      provider: 'none',
      model: 'none',
      duration: 8,
      resolution: '1080P',
      aspect_ratio: '9:16',
      rationale: 'Director 模式仅生成商业导演方案与提示词，不调度视频生成',
    };
  }

  if (appMode === 'mock') {
    return {
      provider: 'mock',
      model: 'demo-only',
      duration: 8,
      resolution: '640P',
      aspect_ratio: '9:16',
      rationale: 'Mock 模式使用本地 FFmpeg 视频管道进行无成本演练',
    };
  }

  if (appMode !== 'full' && (appMode as string) !== 'agent') {
    throw new Error('Unsupported app mode: ' + appMode);
  }

  // Check explicit provider override
  const targetProvider = env.VIDEO_PROVIDER;
  if (targetProvider === 'wan') {
    const key = env.WAN_API_KEY || env.DASHSCOPE_API_KEY;
    if (!key) throw new Error('Provider unavailable: WAN_API_KEY missing');
    const model = env.WAN_MODEL || WAN_MODEL;
    return {
      provider: 'wan',
      model,
      duration: nearestDuration(8, WAN_CAPABILITIES.durations),
      resolution: WAN_CAPABILITIES.resolution,
      aspect_ratio: '9:16',
      rationale: '按指令使用阿里 Wan2.1 极速版，高性价比生成 720P 竖屏视频',
    };
  }

  if (targetProvider === 'minimax') {
    if (!env.MINIMAX_API_KEY) throw new Error('Provider unavailable: MINIMAX_API_KEY missing');
    const model = env.MINIMAX_MODEL || MINIMAX_MODEL;
    return {
      provider: 'minimax',
      model,
      duration: nearestDuration(8, MINIMAX_CAPABILITIES.durations),
      resolution: MINIMAX_CAPABILITIES.resolution,
      aspect_ratio: '9:16',
      rationale: '按指令使用 MiniMax-Hailuo-2.3 高清版，生成稳定织物与人物动态',
    };
  }

  if (targetProvider === 'seedance') {
    if (!env.SEEDANCE_API_KEY || !env.SEEDANCE_MODEL) throw new Error('Provider unavailable: SEEDANCE_API_KEY or SEEDANCE_MODEL missing');
    return {
      provider: 'seedance',
      model: env.SEEDANCE_MODEL,
      duration: 8,
      resolution: '1080P',
      aspect_ratio: '9:16',
      rationale: '按指令使用火山方舟 Seedance 生成原生 8 秒高拟真动态',
    };
  }

  if (targetProvider === 'veo') {
    if (!env.VEO_API_KEY && !env.GOOGLE_API_KEY) throw new Error('Provider unavailable: VEO_API_KEY missing');
    return {
      provider: 'veo',
      model: env.VEO_MODEL || 'veo-2.0-generate-001',
      duration: 8,
      resolution: '1080P',
      aspect_ratio: '9:16',
      rationale: '按指令使用 Google Veo 电影级模型生成顶级视觉画面',
    };
  }

  // Automatic routing based on business criteria
  if (env.MINIMAX_API_KEY && (taskType === 'fashion' || taskType === 'ecommerce')) {
    return {
      provider: 'minimax',
      model: env.MINIMAX_MODEL || MINIMAX_MODEL,
      duration: nearestDuration(8, MINIMAX_CAPABILITIES.durations),
      resolution: MINIMAX_CAPABILITIES.resolution,
      aspect_ratio: '9:16',
      rationale: '电商与时尚穿搭场景自动选用 MiniMax，人物形变与衣物展示稳定性最优',
    };
  }

  if (env.WAN_API_KEY || env.DASHSCOPE_API_KEY) {
    return {
      provider: 'wan',
      model: env.WAN_MODEL || WAN_MODEL,
      duration: nearestDuration(8, WAN_CAPABILITIES.durations),
      resolution: WAN_CAPABILITIES.resolution,
      aspect_ratio: '9:16',
      rationale: '高性价比策略自动选用阿里 Wan2.1，高效输出 9:16 竖屏视频',
    };
  }

  if (env.SEEDANCE_API_KEY && env.SEEDANCE_MODEL) {
    return {
      provider: 'seedance',
      model: env.SEEDANCE_MODEL,
      duration: 8,
      resolution: '1080P',
      aspect_ratio: '9:16',
      rationale: '动作复刻场景自动选用火山 Seedance 原生 8 秒模型',
    };
  }

  throw new Error('Provider unavailable: no valid video generation provider configured in environment');
}
