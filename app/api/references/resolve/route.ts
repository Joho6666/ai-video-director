import { NextRequest, NextResponse } from 'next/server';
import { TikHubProvider } from '@/packages/reference-source';
import { scoreViral } from '@/packages/reference-source';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try { const body = await req.json() as { url?: unknown }; const url = typeof body.url === 'string' ? body.url.trim() : ''; if (!url) return NextResponse.json({ error: '请输入参考视频链接' }, { status: 400 }); const reference = await new TikHubProvider().resolve(url); const scored = scoreViral(reference); return NextResponse.json({ ...reference, ...scored }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '解析参考视频失败' }, { status: 400 }); }
}
