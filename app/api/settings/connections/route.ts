import { NextRequest, NextResponse } from 'next/server';
import { listConnectionStatuses, setSecret, deleteSecret, type ProviderId } from '@/packages/server/secrets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const connections = await listConnectionStatuses();
    return NextResponse.json({ connections }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '无法获取服务连接状态' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { provider?: unknown; key?: unknown; baseUrl?: unknown; model?: unknown };
    const provider = String(body.provider || '').toLowerCase() as ProviderId;
    if (!['deepseek', 'wan', 'minimax', 'seedance'].includes(provider)) {
      return NextResponse.json({ error: '无效的服务提供商' }, { status: 400 });
    }
    const key = typeof body.key === 'string' ? body.key.trim() : undefined;
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : undefined;
    const model = typeof body.model === 'string' ? body.model.trim() : undefined;

    await setSecret(provider, { key, baseUrl, model });
    const connections = await listConnectionStatuses();
    return NextResponse.json({ success: true, connections }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新服务连接失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let provider = searchParams.get('provider') as ProviderId | null;
    if (!provider) {
      try {
        const body = await req.json() as { provider?: unknown };
        provider = String(body.provider || '').toLowerCase() as ProviderId;
      } catch {}
    }
    if (!provider || !['deepseek', 'wan', 'minimax', 'seedance'].includes(provider)) {
      return NextResponse.json({ error: '无效的服务提供商' }, { status: 400 });
    }

    await deleteSecret(provider);
    const connections = await listConnectionStatuses();
    return NextResponse.json({ success: true, connections }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除配置失败' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
