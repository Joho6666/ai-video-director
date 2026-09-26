import path from 'node:path';
import { TikHubProvider, scoreViral, stageReferenceImport } from '../../../packages/reference-source';
import type { ReferenceVideo } from '../../../packages/reference-source';
import { dataRoot } from '../../../packages/shared/storage';
import { defineVideoDirectorTool, renderJson } from './contract';
import { optionalInteger, requireString, ToolInputError } from '../adapters/task-adapter';

/**
 * `video_reference` — discover, resolve, and stage commercial reference videos.
 *
 * Thin wrapper over `packages/reference-source`, which owns the TikHub client,
 * the viral scorer, the SSRF-guarded downloader, and the staging store. There is
 * no second TikHub implementation here: the Next.js routes use the same package.
 *
 * This tool never submits a paid video generation request. `import` only stages
 * a downloaded clip and returns the `importId` that the task API consumes.
 */

export type ReferenceAction = 'search' | 'resolve' | 'import';

export interface ReferenceToolArgs {
  action: ReferenceAction;
  keyword?: string;
  /** Share link for resolve, or the fallback source for import. */
  url?: string;
  platform?: 'douyin' | 'tiktok';
  limit?: number;
  sort?: 'relevance' | 'viral' | 'latest';
  publishTime?: string;
  /** The reference to stage; usually a candidate returned by search/resolve. */
  reference?: ReferenceVideo;
}

export interface ProjectedReference {
  id: string;
  platform: string;
  provider: string;
  sourceUrl: string;
  videoUrl?: string;
  caption?: string;
  hashtags: string[];
  duration?: number;
  author?: string;
  followers?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  favorites?: number;
  publishedAt?: string;
  viralScore?: number;
  viralReasons: string[];
}

export interface ReferenceToolResult {
  action: ReferenceAction;
  unavailable?: boolean;
  reason?: string;
  candidates?: ProjectedReference[];
  candidate?: ProjectedReference;
  importId?: string;
  staged?: ProjectedReference;
}

/** Bounded, secret-free projection for the transcript. */
function project(reference: ReferenceVideo): ProjectedReference {
  const m = reference.metrics ?? {};
  return {
    id: reference.id,
    platform: reference.platform,
    provider: reference.provider,
    sourceUrl: reference.sourceUrl,
    ...(reference.videoUrl ? { videoUrl: reference.videoUrl } : {}),
    ...(reference.caption ? { caption: reference.caption } : {}),
    hashtags: reference.hashtags ?? [],
    ...(reference.duration !== undefined ? { duration: reference.duration } : {}),
    ...(reference.author?.nickname ? { author: reference.author.nickname } : {}),
    ...(reference.author?.followers !== undefined ? { followers: reference.author.followers } : {}),
    ...(m.likes !== undefined ? { likes: m.likes } : {}),
    ...(m.comments !== undefined ? { comments: m.comments } : {}),
    ...(m.shares !== undefined ? { shares: m.shares } : {}),
    ...(m.favorites !== undefined ? { favorites: m.favorites } : {}),
    ...(reference.publishedAt ? { publishedAt: reference.publishedAt } : {}),
    ...(reference.viralScore !== undefined ? { viralScore: reference.viralScore } : {}),
    viralReasons: reference.viralReasons ?? [],
  };
}

const REFERENCE_PROPERTIES = {
  id: { type: 'string', required: true },
  platform: { type: 'string', required: true },
  provider: { type: 'string', required: true },
  sourceUrl: { type: 'string', required: true },
  videoUrl: { type: 'string' },
  caption: { type: 'string' },
  hashtags: { type: 'array', required: true, items: { type: 'string' } },
  duration: { type: 'number' },
  author: { type: 'string' },
  followers: { type: 'integer' },
  likes: { type: 'integer' },
  comments: { type: 'integer' },
  shares: { type: 'integer' },
  favorites: { type: 'integer' },
  publishedAt: { type: 'string' },
  viralScore: { type: 'number' },
  viralReasons: { type: 'array', required: true, items: { type: 'string' } },
} as const;

export const videoReferenceTool = defineVideoDirectorTool<ReferenceToolArgs, ReferenceToolResult>({
  name: 'video_reference',
  description: [
    '查找、解析并导入抖音 / TikTok / Instagram 商业参考视频。',
    'action=search：按关键词搜索，并用确定性爆款分排序（缺播放量时按加权互动量估算，会写明）。',
    'action=resolve：把分享链接解析为单条参考视频。',
    'action=import：下载参考视频到暂存区，返回 importId 供创建任务使用。',
    '本工具只获取参考素材，不会发起任何付费视频生成。',
  ].join('\n'),
  parameters: {
    action: { type: 'string', required: true, description: 'search | resolve | import', enum: ['search', 'resolve', 'import'] },
    keyword: { type: 'string', description: 'search 使用的关键词，例如「女装」' },
    url: { type: 'string', description: 'resolve 使用的分享链接；import 时可作为回退来源' },
    platform: { type: 'string', description: 'douyin（默认）或 tiktok', enum: ['douyin', 'tiktok'] },
    limit: { type: 'integer', description: 'search 返回条数，1–30，默认 10' },
    sort: { type: 'string', description: '排序方式', enum: ['relevance', 'viral', 'latest'] },
    publishTime: { type: 'string', description: '发布时间过滤（透传给 TikHub）' },
    reference: { type: 'object', additionalProperties: true, description: 'import 时直接提供的参考对象（通常取自 search/resolve 结果）' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', required: true },
        unavailable: { type: 'boolean' },
        reason: { type: 'string' },
        candidates: { type: 'array', items: { type: 'object', additionalProperties: false, properties: REFERENCE_PROPERTIES } },
        candidate: { type: 'object', additionalProperties: false, properties: REFERENCE_PROPERTIES },
        importId: { type: 'string' },
        staged: { type: 'object', additionalProperties: false, properties: REFERENCE_PROPERTIES },
      },
    },
    render: (args, value) => renderJson(`video_reference(${(args as ReferenceToolArgs)?.action ?? 'unknown'})`, value),
  },
  async execute(rawArgs) {
    const args = (rawArgs ?? {}) as ReferenceToolArgs;
    const action = args.action;
    if (action !== 'search' && action !== 'resolve' && action !== 'import') {
      throw new ToolInputError('action 必须为 search、resolve 或 import');
    }
    const platform = args.platform === 'tiktok' ? 'tiktok' as const : 'douyin' as const;

    if (action === 'search') {
      const keyword = requireString(args.keyword, 'keyword', 200);
      const limit = optionalInteger(args.limit, 'limit', 1, 30, 10);
      const sort = args.sort === 'latest' || args.sort === 'relevance' ? args.sort : 'viral';
      try {
        const items = await new TikHubProvider().search({
          platform,
          keyword,
          sort,
          limit,
          ...(args.publishTime ? { publishTime: args.publishTime } : {}),
        });
        // Deterministic scoring is applied here, exactly as the HTTP route does.
        return { action, candidates: items.map(item => project({ ...item, ...scoreViral(item) })) };
      } catch (error) {
        // An unreachable or unconfigured provider is reported, never replaced
        // with invented candidates.
        return { action, unavailable: true, reason: error instanceof Error ? error.message : '参考来源暂不可用', candidates: [] };
      }
    }

    if (action === 'resolve') {
      const url = requireString(args.url, 'url', 2048);
      const item = await new TikHubProvider().resolve(url);
      return { action, candidate: project({ ...item, ...scoreViral(item) }) };
    }

    // import: stage the clip so a task can reference it by importId.
    if (args.reference === undefined && !args.url) {
      throw new ToolInputError('import 需要 reference（搜索/解析结果）或 url');
    }
    const reference = args.reference ?? await new TikHubProvider().resolve(requireString(args.url, 'url', 2048));
    if (!reference.videoUrl) throw new ToolInputError('该参考视频没有可直接下载的 HTTPS 地址');
    const staged = await stageReferenceImport(reference, path.join(dataRoot, 'reference-imports'));
    return {
      action,
      importId: staged.importId,
      staged: project({ ...staged.reference, ...scoreViral(staged.reference) }),
    };
  },
});
