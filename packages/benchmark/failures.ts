import path from 'node:path';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import type { FailureCategory, FailureRecord, FailureStats } from './types';

export const ALL_FAILURE_CATEGORIES: FailureCategory[] = [
  'sliding_feet',
  'robotic_arm',
  'finger_distortion',
  'product_morph',
  'unnatural_turn',
  'camera_jump',
  'other',
];

export function classifyFailureCategory(issueDescription: string): FailureCategory {
  const lower = issueDescription.toLowerCase();
  if (/滑步|脚下打滑|脚步悬空|步态错乱|漂移|sliding|feet slip|foot slide|floating feet/i.test(lower)) {
    return 'sliding_feet';
  }
  if (/机械摆臂|手臂僵硬|僵硬摆臂|双臂同动|机械手|robotic arm|rigid arm|stiff arm|synchronous arm/i.test(lower)) {
    return 'robotic_arm';
  }
  if (/手指|手部变形|缺指|多指|关节扭曲|指节|finger|hand anatomy|knuckle|finger glitch/i.test(lower)) {
    return 'finger_distortion';
  }
  if (/商品变形|材质突变|版型漂移|穿模|图案闪烁|消融|product morph|disappearance|texture flicker|morphing/i.test(lower)) {
    return 'product_morph';
  }
  if (/转身突兀|转体僵硬|瞬移|同轴转动|僵硬回头|unnatural turn|abrupt turn|rigid turn/i.test(lower)) {
    return 'unnatural_turn';
  }
  if (/镜头跳变|画面跳跃|运镜断裂|镜头抖动|camera jump|framing jump|jitter/i.test(lower)) {
    return 'camera_jump';
  }
  return 'other';
}

export async function recordFailure(
  failuresDir: string,
  failure: FailureRecord
): Promise<string> {
  await mkdir(failuresDir, { recursive: true });
  const filename = `${failure.failure_id}.json`;
  const filePath = path.join(failuresDir, filename);
  await writeFile(filePath, JSON.stringify(failure, null, 2), 'utf8');
  return filePath;
}

export async function loadFailures(failuresDir: string): Promise<FailureRecord[]> {
  try {
    const files = (await readdir(failuresDir)).filter(f => f.endsWith('.json'));
    const records: FailureRecord[] = [];
    for (const file of files) {
      const content = await readFile(path.join(failuresDir, file), 'utf8');
      records.push(JSON.parse(content) as FailureRecord);
    }
    return records;
  } catch {
    return [];
  }
}

export function calculateFailureStats(failures: FailureRecord[]): FailureStats {
  const counts: Record<FailureCategory, number> = {
    sliding_feet: 0,
    robotic_arm: 0,
    finger_distortion: 0,
    product_morph: 0,
    unnatural_turn: 0,
    camera_jump: 0,
    other: 0,
  };

  let totalIssues = 0;
  for (const f of failures) {
    for (const issue of f.issues) {
      counts[issue.category] = (counts[issue.category] || 0) + 1;
      totalIssues++;
    }
  }

  const byCategory = {} as Record<FailureCategory, { count: number; percentage: number }>;
  for (const cat of ALL_FAILURE_CATEGORIES) {
    const count = counts[cat] || 0;
    const percentage = totalIssues > 0 ? Number(((count / totalIssues) * 100).toFixed(1)) : 0;
    byCategory[cat] = { count, percentage };
  }

  return {
    total_failures: failures.length,
    by_category: byCategory,
  };
}
