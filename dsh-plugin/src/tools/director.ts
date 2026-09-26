import { saveTask } from '../../../packages/shared/storage';
import { DirectorAgent } from '../../../packages/orchestrator/agents';
import { defineVideoDirectorTool, renderJson } from './contract';
import { loadState, loadTask, ToolInputError } from '../adapters/task-adapter';
import { resolveAppConfig } from '../../../packages/shared/config';

/**
 * `video_analyze` — run the deterministic Director analysis on a reference.
 *
 * Reuses the existing Director stack end to end: FFmpeg preprocessing
 * (`packages/video-analysis`), the Director Skill (`packages/director`), the
 * DeepSeek adapter (`packages/agent/deepseek`), and `DirectorAgent`
 * (`packages/orchestrator/agents`). Nothing about analysis is reimplemented, and
 * the reference / model / product assets are the ones already attached to the
 * task by the normal upload path.
 *
 * The remix mode is intentionally narrow. The deterministic prompt compiler in
 * `packages/director#compileTreatment` accepts exactly one treatment mode
 * (INSPIRE), so this tool accepts the INSPIRE family and refuses every other
 * label rather than silently producing a plan the compiler would reject.
 */

export type RemixMode = 'structure' | 'inspire';

export interface AnalyzeToolArgs {
  taskId: string;
  /** Structure remix is the default and maps to the INSPIRE treatment. */
  remixMode?: RemixMode;
  /** Replacement creative requirement for this analysis. */
  requirement?: string;
}

export interface AnalyzeVariant {
  id: 'V1' | 'V2' | 'V3';
  name: string;
  creativeDirection: string;
  structure: Record<string, string>;
  timeline: Array<{
    startState: string;
    endState: string;
    transition: string;
    duration: number;
  }>;
  productShowcaseCount: number;
}

export interface AnalyzeToolResult {
  taskId: string;
  appMode: string;
  director: string;
  remixMode: RemixMode;
  planReady: boolean;
  referenceAnalysis: Array<{
    scene: string;
    shotSize: string;
    cameraHeight: string;
    cameraAngle: string;
    cameraMotion: string;
    subjectTrajectory: string;
    actionSequence: string;
    lighting: string;
    rhythm: string;
  }>;
  shotDna: { keep: string[]; mutate: string[] };
  motionDna: Record<string, unknown>;
  limitations: string[];
  variants: AnalyzeVariant[];
  skillSha256: string;
}

/** Project the Director reference analysis into a bounded, schema-stable shape. */
function projectReferenceAnalysis(referenceAnalysis: unknown): AnalyzeToolResult['referenceAnalysis'] {
  if (!Array.isArray(referenceAnalysis)) return [];
  const text = (value: unknown): string => (typeof value === 'string' ? value : 'Unknown');
  return (referenceAnalysis as Array<Record<string, unknown>>).slice(0, 8).map(entry => ({
    scene: text(entry.scene),
    shotSize: text(entry.shot_size),
    cameraHeight: text(entry.camera_height),
    cameraAngle: text(entry.camera_angle),
    cameraMotion: text(entry.camera_motion),
    subjectTrajectory: text(entry.subject_trajectory),
    actionSequence: text(entry.actions ?? entry.action_sequence),
    lighting: text(entry.lighting),
    rhythm: text(entry.rhythm),
  }));
}

export const videoAnalyzeTool = defineVideoDirectorTool<AnalyzeToolArgs, AnalyzeToolResult>({
  name: 'video_analyze',
  description: [
    '对任务中的参考视频执行确定性的导演分析，产出参考分析、Shot DNA、Motion DNA 与 V1/V2/V3 导演方案。',
    '复用现有 FFmpeg 预处理、Director Skill、DeepSeek 适配器与 DirectorAgent，不重新实现分析逻辑。',
    '任务须已存在并已关联参考视频、模特图与商品图素材（由常规上传路径完成）。',
    'remixMode 目前只支持 structure（等价 inspire）：确定性 Prompt 编译器当前只接受 INSPIRE 处理模式。',
    '本工具只做分析规划，不会发起任何付费视频生成。',
  ].join('\n'),
  parameters: {
    taskId: { type: 'string', required: true, description: '任务 ID，或使用 latest 指向最近任务' },
    remixMode: { type: 'string', description: 'structure（默认）或 inspire', enum: ['structure', 'inspire'] },
    requirement: { type: 'string', description: '替换任务当前的创作要求' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string', required: true },
        appMode: { type: 'string', required: true },
        director: { type: 'string', required: true },
        remixMode: { type: 'string', required: true, enum: ['structure', 'inspire'] },
        planReady: { type: 'boolean', required: true },
        referenceAnalysis: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              scene: { type: 'string', required: true },
              shotSize: { type: 'string', required: true },
              cameraHeight: { type: 'string', required: true },
              cameraAngle: { type: 'string', required: true },
              cameraMotion: { type: 'string', required: true },
              subjectTrajectory: { type: 'string', required: true },
              actionSequence: { type: 'string', required: true },
              lighting: { type: 'string', required: true },
              rhythm: { type: 'string', required: true },
            },
          },
        },
        shotDna: {
          type: 'object',
          required: true,
          additionalProperties: false,
          properties: {
            keep: { type: 'array', required: true, items: { type: 'string' } },
            mutate: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
        motionDna: { type: 'object', required: true, additionalProperties: true, description: 'Motion DNA 结构化数据' },
        limitations: { type: 'array', required: true, items: { type: 'string' } },
        variants: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true, enum: ['V1', 'V2', 'V3'] },
              name: { type: 'string', required: true },
              creativeDirection: { type: 'string', required: true },
              structure: { type: 'object', required: true, additionalProperties: true, description: '结构差异字段' },
              timeline: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    startState: { type: 'string', required: true },
                    endState: { type: 'string', required: true },
                    transition: { type: 'string', required: true },
                    duration: { type: 'number', required: true },
                  },
                },
              },
              productShowcaseCount: { type: 'integer', required: true },
            },
          },
        },
        skillSha256: { type: 'string', required: true },
      },
    },
    render: (_args, value) => renderJson(`video_analyze(${value.taskId})`, value),
  },
  async execute(rawArgs) {
    const args = (rawArgs ?? {}) as AnalyzeToolArgs;
    const remixMode: RemixMode = args.remixMode === undefined || args.remixMode === 'structure'
      ? 'structure'
      : args.remixMode === 'inspire'
        ? 'inspire'
        : (() => { throw new ToolInputError('remixMode 目前只支持 structure 或 inspire（确定性编译器只接受 INSPIRE 处理模式）'); })();

    const task = await loadTask(args.taskId);
    const state = await loadState(task);

    if (!task.assets.some(asset => asset.kind === 'reference')) {
      throw new ToolInputError('任务缺少参考视频素材；请先通过常规上传路径导入参考视频');
    }

    if (typeof args.requirement === 'string' && args.requirement.trim()) {
      task.requirement = args.requirement.trim().slice(0, 5000);
      task.logs.push({ time: new Date().toISOString(), message: `创作要求已更新：${task.requirement.slice(0, 80)}` });
      await saveTask(task);
    }

    // Analysis is only legal from a fresh workflow state or when a plan already
    // exists (in which case the Director is a no-op and no second model call is
    // made). A FAILED task with no plan cannot re-enter ANALYZING under the
    // existing state machine, so fail closed with an actionable message instead
    // of corrupting the audit trail.
    if (!task.plan && state.currentStatus !== 'CREATED') {
      throw new ToolInputError(
        `任务工作流状态为 ${state.currentStatus}，无法重新开始导演分析；请创建新任务后重试。`,
      );
    }

    const config = resolveAppConfig();
    await new DirectorAgent().run({ task, stateManager: state, env: process.env });
    // Persist the durable checkpoint so a crash right after analysis resumes from
    // the persisted plan instead of replaying it, and so the agent-run audit
    // trail records the analysis even if production never starts.
    await state.persist();

    const planned = await loadTask(task.id);
    if (!planned.plan) throw new ToolInputError('导演分析未产出可用方案');
    const plan = planned.plan;

    return {
      taskId: planned.id,
      appMode: planned.appMode,
      director: planned.director ?? config.director,
      remixMode,
      planReady: true,
      referenceAnalysis: projectReferenceAnalysis(plan.reference_analysis),
      shotDna: { keep: plan.shot_dna.keep, mutate: plan.shot_dna.mutate },
      motionDna: (plan.motion_dna ?? {}) as Record<string, unknown>,
      limitations: plan.limitations,
      variants: plan.variants.map(variant => ({
        id: variant.id,
        name: variant.name,
        creativeDirection: variant.creative_direction,
        structure: variant.structure as Record<string, string>,
        timeline: variant.timeline.map(segment => ({
          startState: segment.start_state,
          endState: segment.end_state,
          transition: segment.transition,
          duration: segment.duration,
        })),
        productShowcaseCount: variant.product_showcase.length,
      })),
      skillSha256: plan.skill_sha256,
    };
  },
});
