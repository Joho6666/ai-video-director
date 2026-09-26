import { inspectTask, loadState, loadTask } from '../adapters/task-adapter';
import { defineVideoDirectorTool, renderJson } from './contract';

/**
 * `video_inspect` — read-only audit of a task.
 *
 * This tool is strictly observational. It opens no task lock, mutates no
 * ledger, calls no provider, and never triggers a new paid submission no matter
 * how many times it runs. It is safe to call at any point in a workflow,
 * including while production is in flight.
 */

export interface InspectToolArgs {
  taskId: string;
}

export const videoInspectTool = defineVideoDirectorTool<InspectToolArgs, Awaited<ReturnType<typeof inspectTask>>>({
  name: 'video_inspect',
  description: [
    '只读查询任务状态：工作流状态、Provider、生成状态、质量报告、重试历史与最终成片路径。',
    '本工具绝不会触发新的付费任务、不会修改任务状态、也不会占用任务锁；可以安全地反复调用。',
  ].join('\n'),
  parameters: {
    taskId: { type: 'string', required: true, description: '任务 ID，或使用 latest 指向最近任务' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string', required: true },
        appMode: { type: 'string', required: true },
        taskStatus: { type: 'string', required: true },
        workflowStatus: { type: 'string', required: true },
        currentAgent: { type: 'string', required: true },
        taskType: { type: 'string' },
        selectedVariants: { type: 'array', required: true, items: { type: 'string' } },
        provider: { type: 'string' },
        model: { type: 'string' },
        requiresManualVerification: { type: 'boolean', required: true },
        planReady: { type: 'boolean', required: true },
        directorOutputAvailable: { type: 'boolean', required: true },
        finalRecommendation: { type: 'object', additionalProperties: true, description: '确定性终选建议（若已生成）' },
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
        logs: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              time: { type: 'string', required: true },
              message: { type: 'string', required: true },
            },
          },
        },
        error: { type: 'string' },
      },
    },
    render: (_args, value) => renderJson(`video_inspect(${value.taskId})`, value),
  },
  async execute(rawArgs) {
    const args = (rawArgs ?? {}) as InspectToolArgs;
    const task = await loadTask(args.taskId);
    const state = await loadState(task);
    return inspectTask(task, state);
  },
});
