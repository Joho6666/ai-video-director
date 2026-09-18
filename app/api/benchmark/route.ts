import { NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { calculateFailureStats, loadFailures } from '@/packages/benchmark/failures';

export const dynamic = 'force-dynamic';

export async function GET() {
  const root = path.join(process.cwd(), 'benchmark', 'runs');
  const runs: Array<Record<string, unknown>> = [];
  try {
    for (const name of (await readdir(root, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 20)) {
      try { runs.push(JSON.parse(await readFile(path.join(root, name.name, 'manifest.json'), 'utf8'))); } catch { /* incomplete run */ }
    }
  } catch { /* no real runs yet */ }
  const failures = await loadFailures(path.join(process.cwd(), 'benchmark', 'failures'));
  return NextResponse.json({ runs, failureStats: calculateFailureStats(failures) });
}
