import { saveTask } from '../../../packages/shared/storage';
import { selectionSchema } from '../../../packages/agent/production';
import { resolveVideoRoute } from '../../../packages/video-provider/router';
import { VideoProductionWorkflow } from '../../../packages/orchestrator/workflow';
import { inspectTask, loadState, loadTask, ToolInputError, type InspectVariant } from '../adapters/task-adapter';
import { defineVideoDirectorTool, renderJson } from './contract';

/**
 * `video_produce` — run the guarded production workflow for a task.
 *
 * This tool is a *request*, never an executor. It never talks to Wan, MiniMax,
 * Seedance, or any provider. It hands the task to
 * `VideoProductionWorkflow` with `skipPi: true` because the Harness now owns the
 * agent loop; every paid, stateful decision stays inside
 * `packages/orchestrator`, which continues to own:
 *
 *  - the generation ledger, so an already-submitted attempt is polled and never
 *    resubmitted (`packages/agent/production#executeGeneration`);
 *  - the retry budget, capped at 1 for Wan and 2 otherwise, and only spendable
 *    with real QC evidence (`packages/skills/retry`);
 *  - the QC gate, which refuses to call a downloaded video complete without a
 *    persisted quality report for the current attempt;
 *  - the provider router, which stays authoritative for provider/model/duration
 *    (a requested provider is validated against it, never substituted for it).
 */

export interface ProduceToolArgs {
  taskId: string;
  /** One to three unique variants. Defaults to the task's current selection. */
  variants?: Array<'V1' | 'V2' | 'V3'>;
  /** Optional provider preference; must match the deterministic router. */
  provider?: 'mock' | 'wan' | 'minimax';
  /** Hard cap on retries per variant; lowered, never raised, by the workflow. */
  maxRetries?: number;
}

export interface ProduceToolResult {
  taskId: string;
  acceptedProvider: string;
  model: string;
  duration: number;
  resolution: string;
  variants: InspectVariant[];
  taskStatus: string;
  workflowStatus: string;
  requiresManualVerification: boolean;
  outputs: Array<{ variant: string; outputPath?: string; passed: boolean; score?: number }>;
  error?: string;
}

/** Providers this tool may name. Seedance/Veo are deliberately excluded. */
const REQUESTABLE = ['mock', 'wan', 'minimax'] as const;

export const videoProduceTool = defineVideoDirectorTool<ProduceToolArgs, ProduceToolResult>({
  name: 'video_produce',
  description: [
    '执行任务的受控视频生产流程，生成指定版本并完成质量审核与预算内重试。',
    '本工具不直接调用任何视频 Provider：付费提交、去重、预算、QC 证据门禁与恢复逻辑全部由现有确定性调度器负责。',
    'provider 只是偏好，必须与当前配置解析出的 Provider 一致，否则会被拒绝，不会改道。',
    '若已有提交结果不确定的尝试，本工具会拒绝执行并要求人工确认，绝不允许重复扣费。',
  ].join('\n'),
  parameters: {
    taskId: { type: 'string', required: true, description: '任务 ID，或使用 latest 指向最近任务' },
    variants: {
      type: 'array',
      description: '要生成的版本，1–3 个且不可重复，默认沿用任务当前选择',
      items: { type: 'string', enum: ['V1', 'V2', 'V3'] },
    },
    provider: { type: 'string', description: '可选 Provider 偏好', enum: ['mock', 'wan', 'minimax'] },
    maxRetries: { type: 'integer', description: '每个版本的最大重试次数上限（0–2）' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string', required: true },
        acceptedProvider: { type: 'string', required: true },
        model: { type: 'string', required: true },
        duration: { type: 'number', required: true },
        resolution: { type: 'string', required: true },
        taskStatus: { type: 'string', required: true },
        workflowStatus: { type: 'string', required: true },
        requiresManualVerification: { type: 'boolean', required: true },
        variants: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              variant: { type: 'string', required: true },
              status: { type: 'string', required: true },
              provider: { type: 'string' },
              model: { type: 'string' },
              generationStatus: { type: 'string', required: true },
              attempts: { type: 'integer', required: true },
              qualityReports: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    attempt: { type: 'integer', required: true },
                    evaluationMode: { type: 'string', required: true },
                    overallScore: { type: 'number', required: true },
                    passed: { type: 'boolean', required: true },
                    issues: { type: 'array', required: true, items: { type: 'string' } },
                    referenceSimilarity: { type: 'number' },
                  },
                },
              },
              retryHistory: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    attempt: { type: 'integer', required: true },
                    strategy: { type: 'string', required: true },
                    issues: { type: 'array', required: true, items: { type: 'string' } },
                    timestamp: { type: 'string', required: true },
                  },
                },
              },
              outputPath: { type: 'string' },
              error: { type: 'string' },
            },
          },
        },
        outputs: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              variant: { type: 'string', required: true },
              outputPath: { type: 'string' },
              passed: { type: 'boolean', required: true },
              score: { type: 'number' },
            },
          },
        },
        error: { type: 'string' },
      },
    },
    render: (_args, value) => renderJson(`video_produce(${value.taskId})`, value),
  },
  async execute(rawArgs) {
    const args = (rawArgs ?? {}) as ProduceToolArgs;

    // Cheap argument validation runs first so a malformed call is rejected on its
    // own merits, before any task or configuration is read. The retry ceiling is
    // the hard limit the deterministic RetryAgent enforces.
    if (args.maxRetries !== undefined && (!Number.isInteger(args.maxRetries) || args.maxRetries < 0 || args.maxRetries > 2)) {
      throw new ToolInputError('maxRetries 必须是 0–2 之间的整数');
    }
    if (args.provider !== undefined && !REQUESTABLE.includes(args.provider)) {
      throw new ToolInputError(`不支持的 Provider：${String(args.provider)}`);
    }
    let requestedVariants: Array<'V1' | 'V2' | 'V3'> | undefined;
    if (args.variants !== undefined) {
      const parsed = selectionSchema.safeParse(args.variants);
      if (!parsed.success) throw new ToolInputError('variants 必须是 1–3 个不重复的 V1 / V2 / V3');
      requestedVariants = parsed.data;
    }

    const task = await loadTask(args.taskId);

    if (!task.plan) {
      throw new ToolInputError('任务尚未完成导演分析；请先调用 video_analyze 生成 V1/V2/V3 方案');
    }

    // An ambiguous submission must never be retried by a model decision.
    if ((task.generationTasks ?? []).some(job => job.status === 'MANUAL_VERIFICATION_REQUIRED')) {
      throw new ToolInputError('存在提交结果不确定的生成尝试，需人工核对后才能继续；本工具不会重复提交付费任务');
    }

    // Validate the requested provider against the deterministic router. The
    // router stays authoritative: a mismatch is refused, never rerouted.
    const env = process.env;
    let route: { provider: string; model: string; duration: number; resolution: string } | null = null;
    try {
      route = resolveVideoRoute(task.appMode, task.taskType, env);
    } catch (error) {
      throw new ToolInputError(error instanceof Error ? error.message : '当前配置无法解析视频 Provider 路线');
    }
    if (!route) throw new ToolInputError('当前 APP_MODE 无法生成视频（director 模式只产出导演方案）');
    if (args.provider !== undefined && args.provider !== route.provider) {
      throw new ToolInputError(`请求的 Provider（${args.provider}）与当前配置解析结果（${route.provider}）不一致；已拒绝改道`);
    }

    if (requestedVariants) {
      task.selectedVariants = requestedVariants;
      await saveTask(task);
    }

    // The guarded workflow is the only execution path. `skipPi` is set because
    // the Harness owns the agent loop; skipDirector is NOT set, so the Director
    // still runs (and reuses the persisted plan instead of re-charging a model
    // call).
    const state = await loadState(task);
    await VideoProductionWorkflow.run(task, {
      skipPi: true,
      ...(args.maxRetries !== undefined ? { maxRetries: args.maxRetries } : {}),
    });

    // Report from a fresh read so the result reflects what was persisted.
    const finalTask = await loadTask(task.id);
    const finalState = await loadState(finalTask);
    const inspected = await inspectTask(finalTask, finalState);
    return {
      taskId: inspected.taskId,
      acceptedProvider: route.provider,
      model: inspected.model ?? route.model,
      duration: route.duration,
      resolution: route.resolution,
      variants: inspected.variants,
      taskStatus: inspected.taskStatus,
      workflowStatus: inspected.workflowStatus,
      requiresManualVerification: inspected.requiresManualVerification,
      outputs: inspected.variants.map(variant => {
        const latest = variant.qualityReports.at(-1);
        return {
          variant: variant.variant,
          ...(variant.outputPath ? { outputPath: variant.outputPath } : {}),
          passed: latest?.passed ?? false,
          ...(latest ? { score: latest.overallScore } : {}),
        };
      }),
      ...(inspected.error ? { error: inspected.error } : {}),
    };
  },
});
