import { NextResponse } from 'next/server';
import path from 'node:path';
import { statfs, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dataRoot } from '@/packages/shared/storage';
import { ffmpeg, ffprobe } from '@/packages/video-analysis';
import { listConnectionStatuses } from '@/packages/server/secrets';

export const dynamic = 'force-dynamic';

const exec = promisify(execFile);

async function checkCommand(binary: string) {
  try {
    const { stdout } = await exec(binary, ['-version'], { timeout: 10_000, windowsHide: true });
    const firstLine = stdout.split('\n')[0] || '';
    return { ok: true, version: firstLine.slice(0, 60) };
  } catch {
    return { ok: false, version: 'unavailable' };
  }
}

export async function GET() {
  const root = process.cwd();
  const nodeVersion = process.versions.node;
  const ffmpegInfo = await checkCommand(ffmpeg);
  const ffprobeInfo = await checkCommand(ffprobe);

  let diskFreeGb: number | null = null;
  let diskTotalGb: number | null = null;
  try {
    const fs = await statfs(root);
    diskFreeGb = Math.round((Number(fs.bavail) * Number(fs.bsize)) / (1024 ** 3));
    diskTotalGb = Math.round((Number(fs.blocks) * Number(fs.bsize)) / (1024 ** 3));
  } catch {}

  let dataProjectCount = 0;
  try {
    const entries = await readdir(path.join(dataRoot, 'projects'), { withFileTypes: true });
    dataProjectCount = entries.filter(e => e.isDirectory()).length;
  } catch {}

  let connections: unknown[] = [];
  try {
    connections = await listConnectionStatuses();
  } catch {}

  let gitSha = 'unavailable';
  try {
    const { stdout } = await exec('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, timeout: 5000, windowsHide: true });
    gitSha = stdout.trim();
  } catch {}

  return NextResponse.json({
    appVersion: '1.3.1',
    gitSha,
    node: { version: nodeVersion, ok: Number(nodeVersion.split('.')[0]) >= 20 },
    ffmpeg: { binary: path.basename(ffmpeg), ...ffmpegInfo },
    ffprobe: { binary: path.basename(ffprobe), ...ffprobeInfo },
    storage: {
      dataRoot,
      dataProjectCount,
      diskFreeGb,
      diskTotalGb,
    },
    server: {
      port: 3080,
      host: '127.0.0.1',
      environment: process.env.NODE_ENV || 'production',
    },
    connections,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
