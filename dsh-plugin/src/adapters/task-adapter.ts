import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { projectDir, readTask, dataRoot } from '../../../packages/shared/storage';
import { WorkflowStateManager, type AgentRunLog } from '../../../packages/orchestrator/state';
import type { Task } from '../../../packages/shared/types';

/**
 * Task adapter: the only place where Harness tools touch the AI Video Director
 * packages.
 *
 * It owns task lookup, id normalization, state hydration, and result shaping.
 * Tools stay thin and delegate here, so every guard has a single implementation
 * shared with the Next.js API routes.
 *
 * Task *creation* and asset upload deliberately stay with the existing HTTP
 * routes: this plugin operates on tasks that already exist, rather than
 * reimplementing the upload/validation/persistence path a second time.
 */

const TASK_ID = /^[a-f0-9-]{36}$/;

/** Raised for a malformed tool argument. Never a transport or provider error. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

/** Reject anything that is not a well-formed task id before touching disk. */
export function assertTaskId(value: unknown): string {
  if (typeof value !== 'string' || !TASK_ID.test(value.trim())) {
    throw new ToolInputError('taskId 必须是合法的任务 ID（UUID）');
  }
  return value.trim();
}

/** Non-empty string argument with a bounded length. */
export function requireString(value: unknown, field: string, maxLength = 5000): string {
  if (typeof value !== 'string' || !value.trim()) throw new ToolInputError(`${field} 不能为空`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new ToolInputError(`${field} 长度不能超过 ${maxLength}`);
  return trimmed;
}

/** Bounded integer argument. */
export function optionalInteger(value: unknown, field: string, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ToolInputError(`${field} 必须是 ${min}–${max} 之间的整数`);
  }
  return value;
}

/** Most recently updated task id, so a CLI can address `latest`. */
export async function resolveLatestTaskId(): Promise<string> {
  let entries;
  try {
    entries = await readdir(dataRoot, { withFileTypes: true });
  } catch {
    throw new ToolInputError('尚未创建任何任务');
  }
  const ids = entries.filter(entry => entry.isDirectory() && TASK_ID.test(entry.name)).map(entry => entry.name);
  const stamped = await Promise.all(ids.map(async taskId => {
    try {
      return { id: taskId, mtime: (await stat(path.join(dataRoot, taskId, 'task.json'))).mtimeMs };
    } catch {
      return null;
    }
  }));
  const newest = stamped
    .filter((entry): entry is { id: string; mtime: number } => entry !== null)
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (!newest) throw new ToolInputError('尚未创建任何任务');
  return newest.id;
}

/** Resolve a task, accepting `latest` as a convenience alias. */
export async function loadTask(taskId: unknown): Promise<Task> {
  const id = typeof taskId === 'string' && taskId.trim() === 'latest'
    ? await resolveLatestTaskId()
    : assertTaskId(taskId);
  try {
    return await readTask(id);
  } catch {
    throw new ToolInputError(`任务不存在：${id}`);
  }
}

/** Hydrate the durable workflow state for a task. */
export function loadState(task: Task): Promise<WorkflowStateManager> {
  return WorkflowStateManager.load(task.id, task.appMode);
}

/** Project-relative output path of a finished variant, when a real file exists. */
export async function finalOutputPath(task: Task, variant: 'V1' | 'V2' | 'V3'): Promise<string | undefined> {
  const relative = `results/${variant}.mp4`;
  try {
    const info = await stat(path.join(projectDir(task.id), relative));
    return info.isFile() && info.size > 0 ? relative : undefined;
  } catch {
    return undefined;
  }
}

export interface InspectVariant {
  variant: 'V1' | 'V2' | 'V3';
  status: string;
  provider?: string;
  model?: string;
  generationStatus: string;
  attempts: number;
  qualityReports: Array<{
    attempt: number;
    evaluationMode: string;
    overallScore: number;
    passed: boolean;
    issues: string[];
    referenceSimilarity?: number;
  }>;
  retryHistory: Array<{ attempt: number; strategy: string; issues: string[]; timestamp: string }>;
  outputPath?: string;
  error?: string;
}

export interface InspectResult {
  taskId: string;
  appMode: string;
  taskStatus: Task['status'];
  workflowStatus: string;
  currentAgent: string;
  taskType?: string;
  selectedVariants: Array<'V1' | 'V2' | 'V3'>;
  provider?: string;
  model?: string;
  requiresManualVerification: boolean;
  variants: InspectVariant[];
  finalRecommendation?: AgentRunLog['final_recommendation'];
  planReady: boolean;
  directorOutputAvailable: boolean;
  logs: Array<{ time: string; message: string }>;
  error?: string;
}

/** Build the read-only task report used by `video_inspect`. */
export async function inspectTask(task: Task, state: WorkflowStateManager): Promise<InspectResult> {
  const log = state.currentLog;
  const selected = (task.selectedVariants?.length ? task.selectedVariants : ['V1']) as Array<'V1' | 'V2' | 'V3'>;
  const variants = await Promise.all(selected.map(async (variant): Promise<InspectVariant> => {
    const result = task.results.find(item => item.id === variant);
    const jobs = (task.generationTasks ?? []).filter(job => job.variantId === variant);
    const current = jobs.at(-1);
    const reports = (log.quality_reports[variant] ?? []).map(report => ({
      attempt: report.attempt,
      evaluationMode: report.evaluation_mode,
      overallScore: report.overall_score,
      passed: report.passed,
      issues: report.issues,
      ...(typeof report.reference_similarity_score === 'number' ? { referenceSimilarity: report.reference_similarity_score } : {}),
    }));
    const outputPath = await finalOutputPath(task, variant);
    return {
      variant,
      status: result?.status ?? 'not_selected',
      ...(current?.provider ? { provider: current.provider } : {}),
      ...(current?.model ? { model: current.model } : {}),
      generationStatus: current?.status ?? 'NOT_STARTED',
      attempts: jobs.length,
      qualityReports: reports,
      retryHistory: log.retry_history
        .filter(record => record.variantId === variant)
        .map(record => ({ attempt: record.attempt, strategy: record.strategy, issues: record.issues, timestamp: record.timestamp })),
      ...(outputPath ? { outputPath } : {}),
      ...(result?.error ? { error: result.error } : {}),
    };
  }));

  const directorOutputAvailable = await stat(path.join(projectDir(task.id), 'director-output.json'))
    .then(info => info.isFile())
    .catch(() => false);

  const effectiveProvider = log.provider ?? task.provider;
  return {
    taskId: task.id,
    appMode: task.appMode,
    taskStatus: task.status,
    workflowStatus: log.status,
    currentAgent: log.current_agent,
    ...(task.taskType ? { taskType: task.taskType } : {}),
    selectedVariants: selected,
    ...(effectiveProvider ? { provider: effectiveProvider } : {}),
    ...(log.model ? { model: log.model } : {}),
    requiresManualVerification: (task.generationTasks ?? []).some(job => job.status === 'MANUAL_VERIFICATION_REQUIRED'),
    variants,
    ...(log.final_recommendation ? { finalRecommendation: log.final_recommendation } : {}),
    planReady: Boolean(task.plan),
    directorOutputAvailable,
    // Bounded tail: an inspect call must not stream an unbounded audit log back
    // into the model context.
    logs: task.logs.slice(-20),
    ...(task.error ? { error: task.error } : {}),
  };
}
