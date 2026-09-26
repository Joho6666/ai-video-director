import { NextRequest, NextResponse } from 'next/server';
import { TikHubProvider, scoreViral, type ReferenceSearchInput } from '@/packages/reference-source';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try { const body = await req.json() as Partial<ReferenceSearchInput>; if (!body.keyword || body.platform !== 'douyin') return NextResponse.json({ error: '第一阶段爆款搜索需要抖音平台和关键词' }, { status: 400 }); const items = await new TikHubProvider().search({ platform: body.platform, keyword: body.keyword, sort: body.sort, publishTime: body.publishTime, limit: body.limit }); return NextResponse.json({ results: items.map(item => ({ ...item, ...scoreViral(item) })) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '搜索爆款失败' }, { status: 400 }); }
}
