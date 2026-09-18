import nodePath from 'node:path';
import {copyFile,mkdir} from 'node:fs/promises';
import type { Task } from '../shared/types';
import { projectDir, jsonWrite, saveTask, mediaUrl } from '../shared/storage';
import { preprocess } from '../video-analysis';
import { MockAgentAdapter } from '../agent/adapter';
import { DeepSeekDirectorAdapter } from '../agent/deepseek';
import { createExportPackage } from '../shared/exports';
import { resolveAppConfig } from '../shared/config';
import { evaluateProducerSkill, type ProducerDecision } from '../skills/producer';
import { evaluateQualitySkill, type QualityReport, type QualityEvaluationOptions } from '../skills/quality';
import { evaluateRetrySkill, type RetryEvaluationResult } from '../skills/retry';
import type { VideoGenerationProvider, GenerationTask } from '../video-provider/types';
import { executeGeneration, downloadVideo, validateVideo, productionPrompt } from '../agent/production';
import { WorkflowStateManager } from './state';

export interface AgentContext {
  task: Task;
  stateManager: WorkflowStateManager;
  env?: Record<string, string | undefined>;
  providerOverride?: VideoGenerationProvider;
  qualityOptions?: Record<string, QualityEvaluationOptions>;
}

export class DirectorAgent {
  readonly name = 'director';

  async run(ctx: AgentContext): Promise<void> {
    const { task, stateManager } = ctx;
    const root = projectDir(task.id);

    if (task.plan) {
      return;
    }

    stateManager.transition('ANALYZING', 'director', 'Director Agent 开始分析参考视频时空序列');
    task.status = 'ANALYZING';
    task.logs.push({ time: new Date().toISOString(), message: '正在读取视频元数据并动态抽取参考帧' });
    await saveTask(task);

    const refAsset = task.assets.find(a => a.kind === 'reference');
    if (!refAsset) throw new Error('缺少参考视频素材');
    task.metadata = await preprocess(nodePath.join(root, refAsset.file), nodePath.join(root, 'reference'));

    const config = resolveAppConfig(ctx.env);
    await jsonWrite(nodePath.join(root, 'runtime.json'), {
      version: '1.3.0',
      app_mode: task.appMode,
      director: task.director,
      video_provider: task.provider,
      deepseek_model: task.director === 'deepseek' ? config.deepseekModel : null,
      minimax_model: task.provider === 'minimax' ? (process.env.MINIMAX_MODEL || 'MiniMax-Hailuo-2.3') : null,
      wan_model: task.provider === 'wan' ? (process.env.WAN_MODEL || 'wanx2.1-i2v-plus') : null,
      frame_count: task.metadata.frameCount,
    });

    stateManager.transition('PLANNING', 'director', 'Director Agent 提取 Shot DNA 并规划三套商业方案');
    task.status = 'PLANNING';
    task.logs.push({
      time: new Date().toISOString(),
      message: task.director === 'mock' ? '读取 Director Skill 离线分析' : 'DeepSeek 正在识别人物动作并提取 Shot DNA',
    });
    await saveTask(task);

    const adapter = task.director === 'mock' ? new MockAgentAdapter() : new DeepSeekDirectorAdapter();
    const result = await adapter.plan(task);
    const { plan, treatment } = result;

    const unknown = { status: 'Unknown', description: 'Mock mode does not perform visual analysis', frame_ids: [] };
    const mockEvidence = Object.fromEntries(
      ['scene','shot_size','camera_height','camera_angle','camera_motion','subject_trajectory','action_sequence','gaze','head_movement','shoulder_movement','arm_motion','hand_action','body_weight','facial_expression','product_interaction','motion_continuity','lighting','rhythm','product_display_logic'].map(k => [k, unknown])
    );
    const evidence = 'evidence' in result ? result.evidence : mockEvidence;

    task.plan = plan;
    await jsonWrite(nodePath.join(root, 'director-output.json'), treatment);
    await jsonWrite(nodePath.join(root, 'reference-evidence.json'), evidence);
    if ('requestMeta' in result) {
      await jsonWrite(nodePath.join(root, 'deepseek-request.json'), result.requestMeta);
    }
    await jsonWrite(nodePath.join(root, 'generation-plan.json'), plan);
    await createExportPackage(task, root, { reference_evidence: evidence });
    await saveTask(task);
  }
}

export class ProducerAgent {
  readonly name = 'producer';

  run(ctx: AgentContext): ProducerDecision {
    const { task, stateManager, env } = ctx;
    const decision = evaluateProducerSkill(task.plan, task.taskType, task.appMode, env);
    stateManager.setProducerDecision(decision);
    if (decision.provider !== 'none') {
      task.provider = decision.provider as Task['provider'];
    }
    task.logs.push({
      time: new Date().toISOString(),
      message: `Producer Agent 生产决策：${decision.provider.toUpperCase()} (${decision.model}) · ${decision.duration}s · ${decision.rationale}`,
    });
    return decision;
  }
}

export class GeneratorAgent {
  readonly name = 'generator';

  async runVariant(
    ctx: AgentContext,
    job: GenerationTask,
    provider: VideoGenerationProvider,
    onProgress?: () => Promise<void>
  ): Promise<string> {
    const { task } = ctx;
    const root = projectDir(task.id);
    const result = task.results.find(r => r.id === job.variantId)!;

    await executeGeneration(
      job,
      provider,
      async () => {
        job.updated_at = new Date().toISOString();
        result.providerTaskId = job.task_id;
        if (onProgress) await onProgress();
      },
      async (url: string) => {
        const file = `results/${job.variantId}.mp4`;
        const localPath = nodePath.join(root, file);
        if (provider.name === 'mock') {
          await validateVideo(localPath, job.request.duration);
        } else {
          await downloadVideo(url, localPath, job.request.duration);
        }
        return mediaUrl(task.id, file);
      }
    );

    const archive=nodePath.join(root,'attempts',job.id);
    await mkdir(archive,{recursive:true});
    const archiveFile=nodePath.join(archive,'video.mp4');
    await copyFile(nodePath.join(root, `results/${job.variantId}.mp4`),archiveFile);
    return archiveFile;
  }
}

export class QualityAgent {
  readonly name = 'quality';

  async evaluate(
    ctx: AgentContext,
    variantId: 'V1' | 'V2' | 'V3',
    filePath: string,
    attempt: number
  ): Promise<QualityReport> {
    const { task, stateManager, qualityOptions } = ctx;
    const variant = task.plan!.variants.find(v => v.id === variantId)!;
    const opt = qualityOptions?.[variantId];
    const report = await evaluateQualitySkill(filePath, variant, attempt, {
      ...opt,
      task,
      // A retry is a new immutable GenerationTask. QC must describe the exact
      // prompt and duration used for the current attempt, never the first
      // attempt returned by Array.find().
      actualRequest: (() => {
        const current = task.generationTasks?.filter(j => j.variantId === variantId).at(-1);
        const duration = current?.request.duration || 8;
        const compiled = productionPrompt(variant, duration);
        return { prompt: current?.request.prompt || compiled.prompt, duration, timeline: compiled.timeline };
      })(),
      env: ctx.env,
      mode: task.appMode === 'mock' ? 'mock' : 'visual',
    });
    stateManager.recordQualityReport(variantId, report);

    task.logs.push({
      time: new Date().toISOString(),
      message: `Quality Agent 审核 ${variantId}：得分 ${report.overall_score}/100 [${report.passed ? '通过' : '未通过'}]` +
        (report.issues.length ? ` · 缺陷: ${report.issues.join('; ')}` : ''),
    });

    return report;
  }
}

export class RetryAgent {
  readonly name = 'retry';

  refine(
    ctx: AgentContext,
    report: QualityReport,
    job: GenerationTask,
    currentRetries: number
  ): RetryEvaluationResult {
    const { task, stateManager } = ctx;
    const previousPrompt = job.request.prompt;
    const result = evaluateRetrySkill(report, job.request, currentRetries);

    if (result.can_retry) {
      job.request.prompt = result.refined_prompt;
      job.status = 'PENDING';
      delete job.task_id;
      delete job.submission_started_at;
      delete job.error;

      stateManager.recordRetry({
        variantId: job.variantId,
        attempt: result.attempt,
        issues: report.issues,
        previousPrompt,
        refinedPrompt: result.refined_prompt,
        strategy: result.strategy,
        timestamp: new Date().toISOString(),
      });

      task.logs.push({
        time: new Date().toISOString(),
        message: `Retry Agent 为 ${job.variantId} 优化提示词 (第 ${result.attempt} 次重试)：${result.strategy}`,
      });
    }

    return result;
  }
}
