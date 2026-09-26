/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReferenceVideo, ReferencePlatform } from './types';

const first = (...values: unknown[]) => values.find(v => v !== undefined && v !== null && v !== '');
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(Number(v)) ? Number(v) : undefined;
const array = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

export function normalizeTikHub(raw: unknown, sourceUrl: string, platform: ReferencePlatform): ReferenceVideo {
  const root = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const envelope = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, any>;
  const data = (envelope.aweme_detail || envelope.item_info?.item_list?.[0] || envelope) as Record<string, any>;
  const author = (first(data.author, data.user, data.owner) || {}) as Record<string, any>;
  const stats = (first(data.stats, data.statistics, data.video?.stats) || {}) as Record<string, any>;
  const video = (first(data.video, data.aweme_detail?.video, data.media, {}) || {}) as Record<string, any>;
  const id = String(first(data.id, data.aweme_id, data.aweme_detail?.aweme_id, data.pk, data.code) || `reference-${Date.now()}`);
  const videoUrl = first(video.play_addr?.url_list?.[0], video.download_addr?.url_list?.[0], video.url, data.video_url, data.play_url);
  return {
    id, rawProviderId: id, platform, provider: 'tikhub', sourceUrl,
    videoUrl: typeof videoUrl === 'string' ? videoUrl : undefined,
    coverUrl: typeof first(video.cover?.url_list?.[0], video.cover_url, data.cover, data.thumbnail_url) === 'string' ? String(first(video.cover?.url_list?.[0], video.cover_url, data.cover, data.thumbnail_url)) : undefined,
    caption: typeof first(data.desc, data.caption, data.title) === 'string' ? first(data.desc, data.caption, data.title) as string : undefined,
    hashtags: array(data.hashtags || data.text_extra?.map((x: any) => x.hashtag_name)),
    duration: num(first(video.duration, data.duration)) ? (num(first(video.duration, data.duration))! > 1000 ? num(first(video.duration, data.duration))! / 1000 : num(first(video.duration, data.duration))) : undefined,
    author: { id: typeof first(author.id, author.uid, author.sec_uid) === 'string' ? first(author.id, author.uid, author.sec_uid) as string : undefined, username: author.unique_id || author.username, nickname: author.nickname || author.name, avatarUrl: typeof first(author.avatar, author.avatar_url, author.avatar_larger?.url_list?.[0]) === 'string' ? String(first(author.avatar, author.avatar_url, author.avatar_larger?.url_list?.[0])) : undefined, followers: num(first(author.follower_count, author.followers)) },
    metrics: { views: num(first(stats.play_count, stats.views, data.views)), likes: num(first(stats.digg_count, stats.likes, data.likes)), comments: num(first(stats.comment_count, stats.comments, data.comments)), shares: num(first(stats.share_count, stats.shares, data.shares)), favorites: num(first(stats.collect_count, stats.favorites, data.favorites)) },
    publishedAt: typeof first(data.create_time, data.published_at, data.timestamp) === 'number' ? new Date(Number(first(data.create_time, data.published_at, data.timestamp)) * 1000).toISOString() : typeof first(data.create_time, data.published_at, data.timestamp) === 'string' ? first(data.create_time, data.published_at, data.timestamp) as string : undefined,
  };
}
