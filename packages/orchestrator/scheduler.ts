import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Task } from '../shared/types';
import { projectDir, jsonWrite, saveTask } from '../shared/storage';
import { createExportPackage } from '../shared/exports';
import { providerForSavedRoute, routeProvider, resolveVideoRoute } from '../video-provider/router';
import type { VideoGenerationProvider, VideoGenerationRequest } from '../video-provider/types';
import { selectionSchema, productionPrompt, prepareFirstFrame, loadGenerationTasks } from '../agent/production';
import {
  DirectorAgent,
  ProducerAgent,
  GeneratorAgent,
  QualityAgent,
  RetryAgent,
  type AgentContext,
} from './agents';
import { WorkflowStateManager, type FinalRecommendation } from './state';
import { normalizeDimensionName } from '../skills/quality';

export interface SchedulerOptions {
  providerOverride?: VideoGenerationProvider;
  env?: Record<string, string | undefined>;
  qualityOptions?: AgentContext['qualityOptions'];
  maxRetries?: number;
  /** Internal Pi tool flags; the public workflow still enters through VideoProductionWorkflow. */
  skipPi?: boolean;
  skipDirector?: boolean;
  skipProducer?: boolean;
}

/**
 * A downloaded video is not a completed deliverable until the current
 * immutable generation attempt has a persisted quality decision. Checking
 * both the run log and the on-disk report prevents a crash between those two
 * writes from turning an unreviewed video into a completed task.
 */
export async function hasCurrentQualityReport(
  task: Task,
  stateManager: WorkflowStateManager,
  job: { variantId: 'V1' | 'V2' | 'V3'; attempt?: number },
): Promise<boolean> {
  const attempt = job.attempt ?? 0;
  const expectedMode = task.appMode === 'mock' ? 'mock' : 'visual';
  const reports = stateManager.currentLog.quality_reports[job.variantId] ?? [];
  const logged = reports.some(report =>
    report.variant_id === job.variantId &&
    report.attempt === attempt &&
    report.evaluation_mode === expectedMode,
  );
  if (!logged) return false;

  // Mock QC is deliberately in-memory/deterministic and historically does
  // not write a report file. Real modes must have the immutable report file.
  if (expectedMode === 'mock') return true;
  const reportPath = path.join(projectDir(task.id), 'quality', job.variantId, `attempt-${attempt}`, 'quality-report.json');
  try {
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as Record<string, unknown>;
    return report.variant_id === job.variantId &&
      report.attempt === attempt &&
      report.evaluation_mode === 'visual';
  } catch {
    return false;
  }
}

/** Return true when a completed production task must be reopened for QC. */
export async function needsQualityRecovery(task: Task, stateManager: WorkflowStateManager): Promise<boolean> {
  if (task.appMode !== 'full' || task.status !== 'COMPLETED') return false;
  const selected = task.selectedVariants?.length ? task.selectedVariants : ['V1'];
  if (!task.generationTasks?.length) return false;
  for (const variantId of selected) {
    const job = task.generationTasks.filter(item => item.variantId === variantId).at(-1);
    const result = task.results.find(item => item.id === variantId);
    if (!job || job.status !== 'COMPLETED' || result?.status !== 'completed') return true;
    const outputPath = path.join(projectDir(task.id), 'results', `${variantId}.mp4`);
    try {
      if (!(await stat(outputPath)).isFile()) return true;
    } catch {
      return true;
    }
    if (!(await hasCurrentQualityReport(task, stateManager, job))) return true;
  }
  return false;
}

export class WorkflowScheduler {
  private readonly director = new DirectorAgent();
  private readonly producer = new ProducerAgent();
  private readonly generator = new GeneratorAgent();
  private readonly quality = new QualityAgent();
  private readonly retry = new RetryAgent();

  async run(task: Task, stateManager: WorkflowStateManager, options: SchedulerOptions = {}): Promise<void> {
    const root = projectDir(task.id);
    // A task's selected route is immutable for its lifetime.  The preference
    // is converted to the router's single source of truth only for a brand
    // new task; saved attempts always take precedence below.
    const routeEnv = { ...(options.env || process.env), ...(task.providerPreference && task.providerPreference !== 'auto' ? { VIDEO_PROVIDER: task.providerPreference } : {}) };
    const ctx: AgentContext = {
      task,
      stateManager,
      env: options.env,
      providerOverride: options.providerOverride,
      qualityOptions: options.qualityOptions,
    };

    const persistState = async () => {
      await stateManager.persist();
      await saveTask(task);
    };

    // 1. Director Agent Phase
    if (!options.skipDirector) await this.director.run(ctx);
    if(stateManager.currentStatus==='CREATED' && task.plan){stateManager.transition('ANALYZING','director','恢复已保存的导演方案');stateManager.transition('PLANNING','director','复用已完成的导演方案');}
    await persistState();

    // If running in agent/director mode, complete after planning
    if (task.appMode === 'agent' || task.appMode === 'director') {
      const decision = this.producer.run(ctx);
      stateManager.transition('COMPLETED', 'orchestrator', '商业导演规划已就绪 (Agent 模式)');
      task.status = 'COMPLETED';
      task.logs.push({ time: new Date().toISOString(), message: `导演规划完毕，建议生产路线：${decision.provider} (${decision.model})` });
      await persistState();
      return;
    }

    // 2. Producer Agent Phase
    const selected = selectionSchema.parse(task.selectedVariants || ['V1']);
    task.selectedVariants = selected;
    task.generationTasks = await loadGenerationTasks(task);
    const savedJob = task.generationTasks.find(job => selected.includes(job.variantId));
    const savedRoute = savedJob ? {
      provider: savedJob.provider,
      model: savedJob.model,
      duration: savedJob.request.duration,
      resolution: savedJob.request.resolution,
      aspect_ratio: savedJob.request.aspect_ratio,
    } : null;
    if (savedRoute && task.generationTasks.some(job => job.provider !== savedRoute.provider || job.model !== savedRoute.model)) {
      throw new Error('Saved generation attempts use different providers or models; refusing recovery');
    }
    const resolvedRoute = options.providerOverride || savedRoute
      ? null
      : resolveVideoRoute(task.appMode, task.taskType, routeEnv);
    if (!options.providerOverride && !savedRoute && !resolvedRoute) throw new Error('Director-only mode cannot produce video');
    const producerDecision = savedRoute
      ? stateManager.currentLog.producer_decision || {
        provider: savedRoute.provider,
        model: savedRoute.model,
        duration: savedRoute.duration,
        resolution: savedRoute.resolution,
        aspect_ratio: savedRoute.aspect_ratio,
        rationale: '复用已持久化的 Provider 路线继续任务',
      }
      : options.skipProducer
        ? stateManager.currentLog.producer_decision || this.producer.run(ctx)
        : this.producer.run(ctx);
    // The Router is the only source of live provider parameters. Producer
    // output remains useful for audit text, but a stale persisted decision
    // cannot change the provider, model, duration, resolution, or aspect ratio
    // used for a new task or for recovery of an existing task.
    const route = savedRoute || (options.providerOverride
      ? { provider: options.providerOverride.name, model: producerDecision.model, duration: producerDecision.duration, resolution: producerDecision.resolution, aspect_ratio: producerDecision.aspect_ratio }
      : resolvedRoute!);
    if (!route) throw new Error('Director-only mode cannot produce video');
    if (!options.providerOverride && !savedRoute && options.skipProducer && (
      producerDecision.provider !== route.provider ||
      producerDecision.model !== route.model ||
      producerDecision.duration !== route.duration ||
      producerDecision.resolution !== route.resolution ||
      producerDecision.aspect_ratio !== route.aspect_ratio
    )) {
      throw new Error('Saved provider route differs from current configuration; refusing to reroute');
    }
    const provider = options.providerOverride || (savedRoute
      ? providerForSavedRoute(savedRoute.provider, savedRoute.model, options.env)
      : routeProvider(task.appMode, task.taskType, routeEnv));
    task.provider = route.provider;

    if(task.generationTasks.length && stateManager.currentStatus==='FAILED')stateManager.resumeProduction();

    const hasPersistedFirstFrame = task.generationTasks.some(job => Boolean(job.request.firstFrame));
    if (route.provider === 'wan' && !task.assets.some(asset => asset.kind === 'first_frame') && !hasPersistedFirstFrame) {
      throw new Error('Wan 高保真生成必须上传已包含目标模特与商品的成片首帧图');
    }
    const persistedFirstFrame = task.generationTasks.find(job => job.request.firstFrame)?.request.firstFrame;
    const firstFrame = persistedFirstFrame || (task.appMode === 'full' && !task.generationTasks.length ? await prepareFirstFrame(task) : undefined);

    for (const id of selected) {
      if (task.generationTasks.some(j => j.variantId === id)) continue;
      const variant = task.plan!.variants.find(v => v.id === id);
      if (!variant) throw new Error('Selected variant missing');

      const modelIds = task.assets.filter(asset => asset.kind === 'model').map(asset => asset.file);
      const productIds = task.assets.filter(asset => asset.kind === 'product').map(asset => asset.file);
      const request: VideoGenerationRequest = {
        taskId: task.id,
        variantId: id,
        model: route.model,
        mode: 'image-to-video',
        prompt: productionPrompt(variant, route.duration, task.plan).prompt,
        duration: route.duration,
        aspect_ratio: route.aspect_ratio,
        quality: 'high',
        resolution: route.resolution,
        firstFrame,
        input_manifest: {
          analysis_reference_ids: [...modelIds, ...productIds],
          qc_reference_ids: [...modelIds, ...productIds],
          provider_reference_ids: firstFrame ? [firstFrame.id] : [],
        },
      };

      task.generationTasks.push({
        id: randomUUID(),
        variantId: id,
        provider: route.provider,
        model: producerDecision.model,
        status: 'PENDING',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        request,
      });
    }

    task.results = selected.map(id => task.results.find(r => r.id === id) || {
      id,
      name: task.plan!.variants.find(v => v.id === id)!.name,
      status: 'waiting',
    });

    const persistTasks = async () => {
      await jsonWrite(path.join(root, 'generation-tasks.json'), task.generationTasks);
      await persistState();
    };
    await persistTasks();

    // 3. Generation & Quality Review Loop for each selected variant
    for (const selectedId of selected) {
      let job = task.generationTasks.filter(j=>j.variantId===selectedId).at(-1)!;
      if(job.provider!==provider.name || (!options.providerOverride && job.model!==route.model))throw new Error('Saved provider/model differs; refusing to reroute');
      const result = task.results.find(r => r.id === job.variantId)!;
      const persistedVideoPath = path.join(root, 'results', `${job.variantId}.mp4`);
      let hasPersistedVideo = false;
      try { hasPersistedVideo = (await stat(persistedVideoPath)).isFile(); } catch { hasPersistedVideo = false; }
      // A downloaded MP4 is the strongest paid-work checkpoint. Even when a
      // prior QC response was malformed, resume must review that file instead
      // of creating another provider attempt.
      if (hasPersistedVideo && job.status !== 'COMPLETED') {
        job.status = 'COMPLETED';
        job.result_url = job.result_url || `/api/media/${task.id}/results/${job.variantId}.mp4`;
        result.url = job.result_url;
        await persistTasks();
      }
      if (job.status === 'COMPLETED' && (result.status === 'completed' || result.status === 'failed')) {
        if (await hasCurrentQualityReport(task, stateManager, job)) continue;
        // A crash can leave the video and task marked completed after the
        // quality write was interrupted. Reopen only the review gate and let
        // GeneratorAgent reuse the existing remote ID/video without charging
        // another generation request.
        if (stateManager.currentStatus === 'COMPLETED') {
          stateManager.transition('REVIEWING', 'quality', `${job.variantId}: 恢复未完成的质量审核`);
          task.status = 'REVIEWING';
          await persistTasks();
        }
      }

      let retryCount = job.attempt ?? stateManager.currentLog.retry_history.filter(r=>r.variantId===job.variantId).length;
      if (!Number.isInteger(retryCount) || retryCount < 0 || retryCount > 2) {
        throw new Error(`Invalid persisted retry attempt for ${job.variantId}; refusing to spend outside budget`);
      }
      const maxRetries=Math.min(provider.name==='wan'?1:2,Math.max(0,options.maxRetries??(provider.name==='wan'?1:2)));
      let passed = false;
      let finalVideoPath = '';

      while (!passed && retryCount <= maxRetries) {
        stateManager.transition('GENERATING', 'generator', `${job.variantId} (轮次 ${retryCount}): 调用 ${provider.name} 视频生成`);
        task.status = 'GENERATING';
        result.status = 'generating';
        await persistTasks();

        try {
          finalVideoPath = await this.generator.runVariant(ctx, job, provider, async () => {
            await persistTasks();
          });
          result.url = job.result_url;
        } catch (error) {
          if(job.status!=='MANUAL_VERIFICATION_REQUIRED')job.status = 'FAILED';
          job.error = error instanceof Error ? error.message : 'Generation failed';
          result.status = 'failed';
          result.error = job.error;
          await persistTasks();
          break; // Hard generator failure breaks out to next variant
        }

        // 4. Quality Agent Phase
        stateManager.transition('REVIEWING', 'quality', `${job.variantId}: Quality Agent 审核`);
        task.status = 'REVIEWING';
        await persistTasks();

        let qualityReport;
        try {
          qualityReport = await this.quality.evaluate(ctx, job.variantId, finalVideoPath, retryCount);
        } catch (error) {
          // The video has already been downloaded, so retain its URL while
          // making the QC transport/schema failure explicit. A failed QC must
          // never leave the card looking as if generation is still running.
          result.status = 'failed';
          result.error = error instanceof Error ? `质量审核失败：${error.message}` : '质量审核失败';
          await persistTasks();
          break;
        }
        job.quality_passed=qualityReport.passed;
        result.qualityScore = qualityReport.overall_score;
        result.qualityFeedback = qualityReport.issues.length ? qualityReport.issues : ['质量审核通过'];
        if (qualityReport.passed) {
          passed = true;
          result.status = 'completed';
          delete result.error;
          await persistTasks();
          break;
        }

        // Only an evidence-backed, repairable visual defect may enter the
        // paid retry path. Uncertainty and QC transport/schema failures never
        // reach this branch (they throw), while a valid report with
        // retry_required=false must stop and preserve the downloaded video.
        const wanProductDefect = provider.name !== 'wan' || qualityReport.evidence.some(e =>
          normalizeDimensionName(e.dimension) === 'product_consistency' &&
          e.status === 'observed' && e.confidence !== 'low' &&
          (e.severity === 'medium' || e.severity === 'high') && e.frame_ids.length > 0 &&
          e.reference_ids.some(id => /^product_\d{2}$/.test(id))
        );
        if (qualityReport.retry_required !== true || !wanProductDefect) {
          result.status = 'failed';
          result.error = provider.name === 'wan' && !wanProductDefect
            ? '商品质量问题没有满足可修复证据门槛，已保留成片且不重复扣费'
            : 'Visual quality did not pass; no evidence-backed repair is eligible for retry';
          await persistTasks();
          break;
        }

        // 5. Retry Agent Phase if failed
        if (retryCount < maxRetries) {
          stateManager.transition('RETRYING', 'retry', `${job.variantId}: 质量未达标 (${qualityReport.overall_score}分)，Retry Agent 调优提示词`);
          task.status = 'RETRYING';
          await persistTasks();

          const nextJob={...job,id:randomUUID(),attempt:retryCount+1,previous_attempt_id:job.id,request:{...job.request},created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
          const retryResult = this.retry.refine(ctx, qualityReport, nextJob, retryCount);
          if (retryResult.can_retry) {
            delete nextJob.result_url;delete nextJob.quality_passed;
            task.generationTasks.push(nextJob);job=nextJob;
            retryCount = retryResult.attempt;
            await persistTasks();
          } else {
            break;
          }
        } else {
          // Reached max retries, mark as completed with quality notes or failed
          result.status = 'failed';
          result.error='Visual quality did not pass within retry budget';
          break;
        }
      }
    }

    // 6. Formulate Final Recommendation based on Quality Reports
    let bestVariant: 'V1' | 'V2' | 'V3' = selected[0];
    let highestScore = -1;
    let rationale = '基于商业镜头表现力选出最优版本';

    const log = stateManager.currentLog;
    for (const [vId, reports] of Object.entries(log.quality_reports)) {
      const lastReport = reports[reports.length - 1];
      if (lastReport?.passed && task.results.some(r=>r.id===vId&&r.status==='completed') && lastReport.overall_score > highestScore) {
        highestScore = lastReport.overall_score;
        bestVariant = vId as 'V1' | 'V2' | 'V3';
        rationale = `综合评分最高 (${highestScore}分)，` + (lastReport.recommendations[0] || '表现力均衡');
      }
    }

    const finalRec: FinalRecommendation = {
      recommended_variant: bestVariant,
      score: highestScore,
      rationale,
    };
    if(highestScore>=0){stateManager.setFinalRecommendation(finalRec);task.finalRecommendation = finalRec;}
    else delete task.finalRecommendation;

    // 7. Finalize & Export
    // A resume pass may skip the Director Agent, which is the only writer of
    // reference-evidence.json. Fall back to the export package copy (or an
    // explicit empty evidence map) instead of failing an otherwise complete
    // production run on a file the skipped stage never produced.
    let evidence: unknown = {};
    try {
      evidence = JSON.parse(await readFile(path.join(root, 'reference-evidence.json'), 'utf8'));
    } catch {
      try {
        evidence = JSON.parse(await readFile(path.join(root, 'exports', 'reference-evidence.json'), 'utf8'));
      } catch {
        task.logs.push({
          time: new Date().toISOString(),
          message: 'reference-evidence.json 缺失（恢复流程跳过导演阶段），导出使用空证据链',
        });
      }
    }
    await createExportPackage(task, root, { reference_evidence: evidence });

    if (task.results.some(r => r.status === 'failed')) {
      stateManager.transition('FAILED', 'orchestrator', '存在未通过的视频；已保留成功结果与审核记录');
      task.status = 'FAILED';
    } else {
      stateManager.transition('COMPLETED', 'orchestrator', `全流程视频生产与审核已完成，最终推荐 ${bestVariant}`);
      task.status = 'COMPLETED';
    }

    task.logs.push({
      time: new Date().toISOString(),
      message: highestScore>=0?`生产完成，推荐 ${bestVariant} (${rationale})`:'没有通过审核的推荐视频',
    });
    await persistTasks();
  }
}
