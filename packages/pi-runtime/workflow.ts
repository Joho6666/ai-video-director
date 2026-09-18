import { Type } from '@earendil-works/pi-ai';
import { z } from 'zod';
import { runPiAgent, type PiRuntimeEvent, type RuntimeTool } from './index';
import { DirectorAgent, ProducerAgent } from '../orchestrator/agents';
import { WorkflowScheduler, type SchedulerOptions } from '../orchestrator/scheduler';
import { WorkflowStateManager } from '../orchestrator/state';
import type { Task } from '../shared/types';
import { saveTask } from '../shared/storage';

/**
 * Pi is the decision layer. The existing scheduler remains the guarded execution
 * layer and is entered only by the generate_video tool after the plan/provider
 * checkpoints have been persisted.
 */
export async function runPiProduction(task: Task, stateManager: WorkflowStateManager, options: SchedulerOptions = {}) {
  // A resumed task with a persisted generation ledger starts at generation;
  // replaying Director or provider selection could otherwise be rejected by
  // the server and leave recovery dependent on the model's guess.
  let stage: 'analyze'|'plan'|'provider'|'generate'|'review'|'refine'|'finalize' = task.plan ? (task.generationTasks?.length ? 'generate' : 'provider') : 'analyze';
  let finalized = false;
  let generationError: string | undefined;
  const ctx = { task, stateManager, env: options.env, providerOverride: options.providerOverride, qualityOptions: options.qualityOptions };
  const empty = { parameters: Type.Object({}), input: z.object({}).strict() };
  const statusOutput = z.object({ status: z.string().min(1) }).passthrough();
  const resultOutput = z.object({ status: z.string().min(1), results: z.array(z.object({ id: z.string(), status: z.string() }).strict()).optional() }).passthrough();
  const record = async (event: PiRuntimeEvent) => {
    stateManager.recordPiEvent(event);
    // Persist every sanitized lifecycle event so a crash cannot erase the
    // last model turn or tool call from the audit trail.
    await stateManager.persist();
    await saveTask(task);
    if (event.type === 'tool_execution_end' && event.toolName) {
      const suffix = event.isError ? '失败' : '完成';
      task.logs.push({ time: new Date().toISOString(), message: `Pi Tool ${event.toolName} ${suffix}` });
      await stateManager.persist();
      await saveTask(task);
    }
  };
  const tools: RuntimeTool[] = [
    { name: 'analyze_reference', description: '读取参考视频，调用 FFmpeg 与 Director Skill 建立参考分析。', ...empty, output: statusOutput,
      execute: async () => { if (stage !== 'analyze') throw new Error('analyze_reference is out of order'); await new DirectorAgent().run(ctx); stage = 'plan'; return { status: 'analyzed', plan_ready: Boolean(task.plan) }; } },
    { name: 'build_director_plan', description: '确认 Director Skill 校验后的 generation plan 与 Evidence 已持久化。', ...empty, output: statusOutput,
      execute: async () => { if (stage !== 'plan' || !task.plan) throw new Error('director plan is not ready'); stage = 'provider'; return { status: 'planned', variants: task.plan.variants.map(v => v.id) }; } },
    { name: 'select_video_provider', description: '根据任务类型、配置与能力表选择一个已配置 Provider。', ...empty, output: statusOutput,
      execute: async () => { if (stage !== 'provider') throw new Error('provider selection is out of order'); const decision = new ProducerAgent().run(ctx); stage = 'generate'; return { status: 'selected', provider: decision.provider, model: decision.model, duration: decision.duration }; } },
    { name: 'generate_video', description: '执行已持久化的 V1 生产任务，远程 ID 与提交保护由安全 scheduler 负责。', ...empty, output: resultOutput,
      execute: async () => {
        if (stage !== 'generate') throw new Error('generation is out of order');
        try {
          await new WorkflowScheduler().run(task, stateManager, { ...options, skipPi: true, skipDirector: true, skipProducer: true, maxRetries: options.maxRetries ?? 1 });
          const failedResult = task.results.find(result => result.status === 'failed');
          if (failedResult) {
            generationError = failedResult.error || 'Video generation or visual QC failed';
            task.error = generationError;
            await stateManager.persist();
            await saveTask(task);
          }
          stage = 'review';
          return { status: 'generated', results: task.results.map(r => ({ id: r.id, status: r.status })) };
        } catch (error) {
          // A provider/QC transport failure must still leave a durable Pi
          // audit trail. The review and finalization tools record the failed
          // outcome; they never turn the task into a success.
          generationError = error instanceof Error ? error.message : 'Generation workflow failed';
          task.status = 'FAILED';
          task.error = generationError;
          await stateManager.persist();
          await saveTask(task);
          stage = 'review';
          return { status: 'failed', results: task.results.map(r => ({ id: r.id, status: r.status })) };
        }
      } },
    { name: 'review_video', description: '确认每个选中版本已有真实 Quality Agent 报告；不接受模型文本自报。', ...empty, output: statusOutput,
      execute: async () => {
        if (stage !== 'review') throw new Error('review is out of order');
        const required = task.selectedVariants?.length ? task.selectedVariants : ['V1'];
        const visualReports = Object.fromEntries(Object.entries(stateManager.currentLog.quality_reports).map(([id, reports]) => [id, reports.filter(report => report.evaluation_mode === 'visual')]));
        const missing = required.filter(id => !visualReports[id]?.length);
        const reports = Object.values(visualReports).flat();
        // A failed QC with usable evidence may still be repaired by the guarded
        // scheduler, which owns the retry budget. Route to refine so the model
        // can acknowledge the repair step; without evidence we cannot refine
        // and must go straight to finalization to keep the failure on record.
        const repairable = Boolean(generationError) && reports.length > 0 && reports.some(report => !report.passed);
        stage = repairable ? 'refine' : 'finalize';
        return { status: generationError || missing.length ? 'incomplete' : 'reviewed', reports: reports.length, passed: reports.filter(r => r.passed).length, missing_reports: missing, repairable };
      } },
    { name: 'refine_generation', description: '确认靶向修正已由安全 scheduler 在预算内执行；本工具只做审计确认，不单独发起付费重试。', ...empty, output: statusOutput,
      execute: async () => {
        if (stage !== 'refine') throw new Error('refine is not required or is out of order');
        // The guarded scheduler already owns retry execution and its budget.
        // This tool exists so the model's audit trail records the repair
        // decision; it must never submit an independent paid retry.
        const retryUsed = task.generationTasks?.some(job => (job.attempt ?? 0) > 0) ?? false;
        stage = 'finalize';
        return { status: retryUsed ? 'refined' : 'refine_not_required', attempts: task.generationTasks?.length ?? 0 };
      } },
    { name: 'finalize_delivery', description: '确认导出与最终状态，保留失败报告并禁止无证据推荐。', ...empty, output: resultOutput,
      execute: async () => { if (stage !== 'finalize') throw new Error('finalize is out of order'); finalized = true; return { status: 'finalized', task_status: task.status, results: task.results.map(r => ({ id: r.id, status: r.status })) }; } },
  ];
  try {
   const result = await runPiAgent({
    systemPrompt: `You are Pi Video Agent orchestrator. Resume at the ${stage} stage and call exactly one allowed tool per turn. The normal order is analyze_reference, build_director_plan, select_video_provider, generate_video, review_video, then finalize_delivery. If review_video reports repairable=true, call refine_generation before finalize_delivery; otherwise call finalize_delivery directly. Never claim completion without calling the tools. Never invent a tool name or call one out of order — the server rejects it. The server enforces state and payment safety; the guarded scheduler alone owns any paid retry.`,
    prompt: `Run the production workflow for this task from the ${stage} stage. Use one tool per turn and stop only after finalize_delivery.`,
    tools,
    canExecute: async (name) => {
      const allowed: Record<typeof stage, string[]> = { analyze:['analyze_reference'], plan:['build_director_plan'], provider:['select_video_provider'], generate:['generate_video'], review:['review_video'], refine:['refine_generation'], finalize:['finalize_delivery'] };
      return allowed[stage].includes(name);
    },
    // Reaching the finalize stage is only a precondition. The model must call
    // finalize_delivery so the audit log proves the final tool actually ran,
    // even when the provider or QC failed earlier.
    isComplete: () => finalized && task.status !== 'GENERATING' && task.status !== 'REVIEWING' && task.status !== 'RETRYING',
    onEvent: record,
    env: options.env,
    maxTurns: 24,
    timeoutMs: 30 * 60_000,
   });
   return result;
  } catch (error) {
   // If the guarded scheduler already persisted a provider or QC failure,
   // preserve that actionable reason. A model suggesting a repair tool after
   // the workflow entered its terminal review state must not replace it with
   // the generic "invalid tool sequence" message.
   if (task.status === 'FAILED' && (generationError || task.error)) {
    task.error = generationError || task.error;
    await stateManager.persist();
    await saveTask(task);
    return { turns: 0, model: process.env.DEEPSEEK_MODEL || 'deepseek-flash' };
   }
   throw error;
  }
}
