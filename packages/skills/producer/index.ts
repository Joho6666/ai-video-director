import type { Plan, AppMode } from '../../shared/types';
import { resolveVideoRoute } from '../../video-provider/router';

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

  // The Router is the single source of truth for provider, model, duration,
  // resolution and aspect ratio. Producer only adds a human-readable reason.
  let route: ReturnType<typeof resolveVideoRoute>;
  try {
    route = resolveVideoRoute('full', taskType, env);
  } catch (error) {
    // Legacy providers remain display-only compatibility paths. They are not
    // selected by the current Router and never participate in live demo mode.
    const target = env.VIDEO_PROVIDER;
    if (target === 'seedance' && env.SEEDANCE_API_KEY && env.SEEDANCE_MODEL) return { provider: 'seedance', model: env.SEEDANCE_MODEL, duration: 8, resolution: '1080P', aspect_ratio: '9:16', rationale: 'Legacy Seedance configuration (not routed in v1.3 demo)' };
    if (target === 'veo' && (env.VEO_API_KEY || env.GOOGLE_API_KEY)) return { provider: 'veo', model: env.VEO_MODEL || 'veo-2.0-generate-001', duration: 8, resolution: '1080P', aspect_ratio: '9:16', rationale: 'Legacy Veo configuration (not routed in v1.3 demo)' };
    if (!target && env.SEEDANCE_API_KEY && env.SEEDANCE_MODEL && !env.WAN_API_KEY && !env.DASHSCOPE_API_KEY && !env.MINIMAX_API_KEY) return { provider: 'seedance', model: env.SEEDANCE_MODEL, duration: 8, resolution: '1080P', aspect_ratio: '9:16', rationale: 'Legacy Seedance configuration (not routed in v1.3 demo)' };
    throw error;
  }
  if (!route) throw new Error('Provider unavailable: no production route');
  return {
    provider: route.provider,
    model: route.model,
    duration: route.duration,
    resolution: route.resolution,
    aspect_ratio: route.aspect_ratio,
    rationale: `Router resolved ${route.provider} ${route.model} for ${taskType} (${route.duration}s ${route.resolution})`,
  };
}
