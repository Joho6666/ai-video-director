import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { readTask } from '@/packages/shared/storage';
import { active, runTask } from '@/packages/agent/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Re-run visual QC against an already downloaded attempt. Never submits video. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const task = await readTask(id);
    const hasDownloadedAttempt = task.generationTasks?.some(job =>
      job.status === 'COMPLETED' && Boolean(job.result_url)
    );
    if (!hasDownloadedAttempt) {
      return NextResponse.json({ error: '没有可重新审核的已下载成片' }, { status: 409 });
    }
    if (active.has(id)) return NextResponse.json({ error: '任务正在处理中，请勿重复提交' }, { status: 409 });
    active.add(id);
    after(() => runTask(task));
    return NextResponse.json({ ok: true, id, message: '已开始重新执行质量审核，不会重新生成视频' }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '无法重新执行质量审核' }, { status: 404 });
  }
}
