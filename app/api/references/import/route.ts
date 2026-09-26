import { NextRequest, NextResponse } from 'next/server';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { downloadReferenceVideo, stageReferenceImport } from '@/packages/reference-source';
import type { ReferenceVideo } from '@/packages/reference-source';
import { dataRoot, projectDir, readTask, saveTask } from '@/packages/shared/storage';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { reference?: ReferenceVideo; taskId?: string };
    const reference = body.reference; if (!reference?.videoUrl || !reference.sourceUrl) return NextResponse.json({ error: '参考视频缺少可下载地址' }, { status: 400 });
    const taskId = body.taskId; const directory = taskId && /^[a-f0-9-]{36}$/.test(taskId) ? path.join(projectDir(taskId), 'uploads') : path.join(dataRoot, 'reference-imports');
    if (!taskId) return NextResponse.json(await stageReferenceImport(reference, directory));
    await mkdir(directory, { recursive: true }); const downloaded = await downloadReferenceVideo(reference.videoUrl, directory);
    if (taskId && /^[a-f0-9-]{36}$/.test(taskId)) { const task = await readTask(taskId); const relative = path.relative(projectDir(taskId), downloaded.file).split(path.sep).join('/'); task.assets = [...task.assets.filter(item => item.kind !== 'reference'), { name: 'reference.mp4', file: relative, mime: 'video/mp4', kind: 'reference', sourceUrl: reference.sourceUrl, sourceProvider: reference.provider, metadata: reference as unknown as Record<string, unknown> }]; task.logs.push({ time: new Date().toISOString(), message: `参考视频已导入 · ${reference.platform} · ${reference.provider}` }); await saveTask(task); return NextResponse.json({ task, asset: task.assets.at(-1) }); }
    return NextResponse.json({ reference: { ...reference, localFile: path.basename(downloaded.file) } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '导入参考视频失败' }, { status: 400 }); }
}
