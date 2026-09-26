import type { Asset } from '../shared/types';

export type ReferencePlatform = 'tiktok' | 'instagram' | 'douyin' | 'local';
export type ReferenceProvider = 'tikhub' | 'redfox' | 'local';
export type ReferenceMetrics = { views?: number; likes?: number; comments?: number; shares?: number; favorites?: number };
export type ReferenceVideo = {
  id: string;
  platform: ReferencePlatform;
  provider: ReferenceProvider;
  sourceUrl: string;
  videoUrl?: string;
  coverUrl?: string;
  caption?: string;
  hashtags?: string[];
  duration?: number;
  author?: { id?: string; username?: string; nickname?: string; avatarUrl?: string; followers?: number };
  metrics?: ReferenceMetrics;
  publishedAt?: string;
  localFile?: string;
  rawProviderId?: string;
  viralScore?: number;
  viralReasons?: string[];
};

export type ReferenceSearchInput = { platform: 'douyin' | 'tiktok' | 'instagram'; keyword: string; sort?: 'relevance' | 'viral' | 'latest'; publishTime?: string; limit?: number };
export interface ReferenceSourceProvider {
  resolve(url: string): Promise<ReferenceVideo>;
  search?(input: ReferenceSearchInput): Promise<ReferenceVideo[]>;
}
export type ImportedReference = ReferenceVideo & { asset: Asset; metadata?: Record<string, unknown> };
