import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { active, runTask } from '@/packages/agent/runner';
import { promoteDirectorTask } from '@/packages/agent/promote';
import { hydrateEnvironment } from '@/packages/server/secrets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Promote a finished Director plan into production. Submission itself stays with WorkflowScheduler. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (active.has(id)) return NextResponse.json({ error: '任务正在处理中，请勿重复提交' }, { status: 409 });
  try {
    await hydrateEnvironment();
    const body = await req.json().catch(() => ({})) as { selectedVariants?: unknown };
    const task = await promoteDirectorTask(id, { selectedVariants: body.selectedVariants });
    active.add(id);
    after(() => runTask(task));
    return NextResponse.json({ ok: true, id, selectedVariants: task.selectedVariants, provider: task.provider, message: '已转入生产，将按导演方案生成视频' }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '无法转入生产' }, { status: 409 });
  }
}
