import { NextRequest, NextResponse } from 'next/server';
import { testConnection, type ProviderId } from '@/packages/server/secrets';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { provider?: unknown; key?: unknown; baseUrl?: unknown };
    const provider = String(body.provider || '').toLowerCase() as ProviderId;
    if (!['deepseek', 'wan', 'minimax', 'seedance', 'tikhub', 'redfox'].includes(provider)) {
      return NextResponse.json({ error: '无效的服务提供商' }, { status: 400 });
    }
    const key = typeof body.key === 'string' ? body.key.trim() : undefined;
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : undefined;

    const result = await testConnection(provider, { key, baseUrl });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : '连接测试异常' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
