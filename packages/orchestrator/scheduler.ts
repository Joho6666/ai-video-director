import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Task } from '../shared/types';
import { projectDir, jsonWrite, saveTask } from '../shared/storage';
import { createExportPackage } from '../shared/exports';
import { routeProvider, resolveVideoRoute } from '../video-provider/router';
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

export class WorkflowScheduler {
  private readonly director = new DirectorAgent();
  private readonly producer = new ProducerAgent();
  private readonly generator = new GeneratorAgent();
  private readonly quality = new QualityAgent();
  private readonly retry = new RetryAgent();

  async run(task: Task, stateManager: WorkflowStateManager, options: SchedulerOptions = {}): Promise<void> {
    const root = projectDir(task.id);
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
    const route = options.providerOverride
      ? { provider: options.providerOverride.name, model: 'custom', duration: 8, resolution: '1080P', aspect_ratio: '9:16' as const }
      : resolveVideoRoute(task.appMode, task.taskType, options.env);

    if (!route) throw new Error('Director-only mode cannot produce video');
    const producerDecision = options.skipProducer
      ? stateManager.currentLog.producer_decision || this.producer.run(ctx)
      : this.producer.run(ctx);
    const provider = options.providerOverride || routeProvider(task.appMode, task.taskType, options.env);
    task.provider = route.provider;

    const selected = selectionSchema.parse(task.selectedVariants || ['V1']);
    task.selectedVariants = selected;

    task.generationTasks = await loadGenerationTasks(task);
    if(task.generationTasks.length && stateManager.currentStatus==='FAILED')stateManager.resumeProduction();

    const firstFrame = task.appMode === 'full' && !task.generationTasks.length ? await prepareFirstFrame(task) : undefined;

    for (const id of selected) {
      if (task.generationTasks.some(j => j.variantId === id)) continue;
      const variant = task.plan!.variants.find(v => v.id === id);
      if (!variant) throw new Error('Selected variant missing');

      const request: VideoGenerationRequest = {
        taskId: task.id,
        variantId: id,
        model: producerDecision.model,
        mode: 'image-to-video',
        prompt: productionPrompt(variant, producerDecision.duration).prompt,
        duration: producerDecision.duration,
        aspect_ratio: '9:16',
        quality: 'high',
        resolution: producerDecision.resolution,
        firstFrame,
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
      if (job.status === 'COMPLETED' && result.status === 'completed') {
        continue;
      }

      let retryCount = job.attempt ?? stateManager.currentLog.retry_history.filter(r=>r.variantId===job.variantId).length;
      if (!Number.isInteger(retryCount) || retryCount < 0 || retryCount > 2) {
        throw new Error(`Invalid persisted retry attempt for ${job.variantId}; refusing to spend outside budget`);
      }
      const maxRetries=Math.min(2,Math.max(0,options.maxRetries??2));
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

        const qualityReport = await this.quality.evaluate(ctx, job.variantId, finalVideoPath, retryCount);
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
        if (qualityReport.retry_required !== true) {
          result.status = 'failed';
          result.error = 'Visual quality did not pass; no evidence-backed repair is eligible for retry';
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
    const evidenceRaw = await readFile(path.join(root, 'reference-evidence.json'), 'utf8');
    const evidence = JSON.parse(evidenceRaw);
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
