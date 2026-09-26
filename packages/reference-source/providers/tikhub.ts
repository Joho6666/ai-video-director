import { getProviderConfig } from '../../server/secrets';
import { detectPlatform } from '../router';
import { normalizeTikHub } from '../normalizer';
import type { ReferenceSearchInput, ReferenceSourceProvider, ReferenceVideo } from '../types';

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
    const raw = await this.request('/api/v1/douyin/search/fetch_video_search_v2', { keyword: input.keyword, cursor: '0', search_id: '', sort_type: input.sort === 'latest' ? '1' : input.sort === 'viral' ? '2' : '0', publish_time: input.publishTime || '0', limit: String(Math.min(input.limit || 20, 50)) }, 'POST') as { data?: { data?: unknown[]; aweme_list?: unknown[]; items?: unknown[] }; items?: unknown[] };
    const items = raw?.data?.data || raw?.data?.aweme_list || raw?.data?.items || raw?.items || [];
    return Array.isArray(items) ? items.map(item => { const value = item && typeof item === 'object' ? item as Record<string, unknown> : {}; return normalizeTikHub(item, String(value.share_url || value.url || ''), 'douyin'); }) : [];
  }
}
