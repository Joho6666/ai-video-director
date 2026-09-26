import { getProviderConfig } from '../../server/secrets';
import { detectPlatform } from '../router';
import { normalizeTikHub } from '../normalizer';
import type { ReferenceSearchInput, ReferenceSourceProvider, ReferenceVideo } from '../types';

/**
 * Extract the video cards from a Douyin search response.
 *
 * TikHub returns search hits as `data.business_data[]`, where each entry is a
 * card carrying its own `type`: `1` is a video card whose payload sits in
 * `data.aweme_info`, while other types (e.g. `66668`) are non-video blocks that
 * must be dropped rather than normalized into empty references. Older flat
 * shapes are still accepted as fallbacks so a TikHub route change cannot
 * silently turn every search into zero results again.
 *
 * @param raw decoded TikHub response body.
 * @returns the video payloads, ready for {@link normalizeTikHub}.
 */
export function extractDouyinSearchItems(raw: unknown): unknown[] {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const data = (body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
  const cards = data.business_data;
  if (Array.isArray(cards)) {
    const videos = cards
      .filter(card => card && typeof card === 'object' && (card as Record<string, unknown>).type === 1)
      .map(card => (card as Record<string, unknown>).data)
      .filter((payload): payload is Record<string, unknown> => Boolean(payload) && typeof payload === 'object')
      .map(payload => payload.aweme_info)
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
    if (videos.length) return videos;
  }
  for (const candidate of [data.data, data.aweme_list, data.items, body.items]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export class TikHubProvider implements ReferenceSourceProvider {
  private async request(path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'GET') {
    const config = await getProviderConfig('tikhub');
    if (!config.key) throw new Error('TikHub API Key 未配置');
    const url = new URL(`${config.baseUrl}${path}`);
    let body: string | undefined;
    if (method === 'GET') Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v)); else body = JSON.stringify(params);
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${config.key}`, 'X-API-KEY': config.key, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`TikHub HTTP ${response.status}`);
    return response.json();
  }
  async resolve(sourceUrl: string): Promise<ReferenceVideo> {
    const platform = detectPlatform(sourceUrl);
    const endpoint = platform === 'tiktok' ? '/api/v1/tiktok/app/v3/fetch_one_video_by_share_url' : platform === 'douyin' ? '/api/v1/douyin/app/v3/fetch_one_video_by_share_url' : '/api/v1/instagram/v3/get_post_info';
    return normalizeTikHub(await this.request(endpoint, platform === 'instagram' ? { url: sourceUrl } : { share_url: sourceUrl }), sourceUrl, platform);
  }
  async search(input: ReferenceSearchInput): Promise<ReferenceVideo[]> {
    if (input.platform !== 'douyin') throw new Error('TikHub 搜索第一阶段仅支持抖音');
    const raw = await this.request('/api/v1/douyin/search/fetch_video_search_v2', { keyword: input.keyword, cursor: '0', search_id: '', sort_type: input.sort === 'latest' ? '1' : input.sort === 'viral' ? '2' : '0', publish_time: input.publishTime || '0', limit: String(Math.min(input.limit || 20, 50)) }, 'POST');
    const items = extractDouyinSearchItems(raw);
    return items.map(item => { const value = item && typeof item === 'object' ? item as Record<string, unknown> : {}; return normalizeTikHub(item, String(value.share_url || value.url || ''), 'douyin'); });
  }
}
