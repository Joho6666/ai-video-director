import type { ReferencePlatform } from './types';
export function detectPlatform(input: string): ReferencePlatform {
  const url = new URL(input); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持网页链接');
  const host = url.hostname.toLowerCase();
  const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (matches('douyin.com') || matches('iesdouyin.com')) return 'douyin';
  if (matches('instagram.com')) return 'instagram';
  if (matches('tiktok.com')) return 'tiktok';
  throw new Error('仅支持 TikTok、Instagram 和抖音链接');
}
