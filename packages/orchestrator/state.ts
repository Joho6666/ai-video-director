import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { projectDir, jsonWrite } from '../shared/storage';
import type { QualityReport } from '../skills/quality';
import type { ProducerDecision } from '../skills/producer';

export type WorkflowStatus =
  | 'CREATED'
  | 'ANALYZING'
  | 'PLANNING'
  | 'GENERATING'
  | 'REVIEWING'
  | 'RETRYING'
  | 'COMPLETED'
  | 'FAILED';

export type AgentName =
  | 'orchestrator'
  | 'director'
  | 'producer'
  | 'generator'
  | 'quality'
  | 'retry';

export interface StateTransition {
  from: WorkflowStatus;
  to: WorkflowStatus;
  agent: AgentName;
  timestamp: string;
  message: string;
}

export interface RetryRecord {
  variantId: 'V1' | 'V2' | 'V3';
  attempt: number;
  issues: string[];
  previousPrompt: string;
  refinedPrompt: string;
  strategy: string;
  timestamp: string;
}

export interface FinalRecommendation {
  recommended_variant: 'V1' | 'V2' | 'V3';
  score: number;
  rationale: string;
}

export interface PiEventRecord {
  type: string;
  turn: number;
  toolName?: string;
  toolCallId?: string;
  model?: string;
  provider?: string;
  responseId?: string;
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number };
  isError?: boolean;
  resultSummary?: string;
  timestamp: string;
}

export interface AgentRunLog {
  workflow_id: string;
  task_id: string;
  app_mode: string;
  current_agent: AgentName;
  status: WorkflowStatus;
  provider?: string;
  model?: string;
  retry_count: number;
  timestamps: {
    created_at: string;
    analyzing_at?: string;
    planning_at?: string;
    generating_at?: string;
    reviewing_at?: string;
    retrying_at?: string;
    completed_at?: string;
    failed_at?: string;
  };
  transitions: StateTransition[];
  producer_decision?: ProducerDecision;
  quality_reports: Record<string, QualityReport[]>;
  retry_history: RetryRecord[];
  pi_events?: PiEventRecord[];
  final_recommendation?: FinalRecommendation;
  error?: string;
}

export function isValidTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  if (from === to) return true;
  if (to === 'FAILED') return true;

  const validMap: Record<WorkflowStatus, WorkflowStatus[]> = {
    CREATED: ['ANALYZING', 'FAILED'],
    ANALYZING: ['PLANNING', 'FAILED'],
    PLANNING: ['GENERATING', 'COMPLETED', 'FAILED'],
    GENERATING: ['REVIEWING', 'FAILED'],
    REVIEWING: ['RETRYING', 'GENERATING', 'COMPLETED', 'FAILED'],
    RETRYING: ['GENERATING', 'FAILED'],
    COMPLETED: [],
    FAILED: [],
  };

  return validMap[from]?.includes(to) ?? false;
}

export class WorkflowStateManager {
  private log: AgentRunLog;
  private readonly rootPath: string;

  constructor(taskId: string, appMode: string, initialLog?: AgentRunLog) {
    this.rootPath = projectDir(taskId);
    const now = new Date().toISOString();
    this.log = initialLog || {
      workflow_id: 'wf_' + taskId,
      task_id: taskId,
      app_mode: appMode,
      current_agent: 'orchestrator',
      status: 'CREATED',
      retry_count: 0,
      timestamps: {
        created_at: now,
      },
      transitions: [],
      quality_reports: {},
      retry_history: [],
      pi_events: [],
    };
  }

  static async load(taskId: string, appMode: string): Promise<WorkflowStateManager> {
    const root = projectDir(taskId);
    try {
      const raw = await readFile(path.join(root, 'agent-run.json'), 'utf8');
      const parsed = JSON.parse(raw) as AgentRunLog;
      if(parsed.task_id!==taskId || !['CREATED','ANALYZING','PLANNING','GENERATING','REVIEWING','RETRYING','COMPLETED','FAILED'].includes(parsed.status) || !Array.isArray(parsed.transitions) || !Array.isArray(parsed.retry_history) || !parsed.quality_reports || typeof parsed.quality_reports!=='object' || (parsed.pi_events!==undefined&&!Array.isArray(parsed.pi_events)))throw new Error('Invalid persisted agent-run state; refusing to reset');
      parsed.pi_events ??= [];
      return new WorkflowStateManager(taskId, appMode, parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return new WorkflowStateManager(taskId, appMode);
    }
  }

  get currentStatus(): WorkflowStatus {
    return this.log.status;
  }

  get currentAgent(): AgentName {
    return this.log.current_agent;
  }

  get currentLog(): Readonly<AgentRunLog> {
    return this.log;
  }

  transition(to: WorkflowStatus, agent: AgentName, message: string): void {
    if (!isValidTransition(this.log.status, to)) {
      throw new Error(`Invalid workflow transition from ${this.log.status} to ${to}`);
    }
    const timestamp = new Date().toISOString();
    this.log.transitions.push({
      from: this.log.status,
      to,
      agent,
      timestamp,
      message,
    });
    this.log.status = to;
    this.log.current_agent = agent;

    if (to === 'ANALYZING' && !this.log.timestamps.analyzing_at) this.log.timestamps.analyzing_at = timestamp;
    if (to === 'PLANNING' && !this.log.timestamps.planning_at) this.log.timestamps.planning_at = timestamp;
    if (to === 'GENERATING' && !this.log.timestamps.generating_at) this.log.timestamps.generating_at = timestamp;
    if (to === 'REVIEWING' && !this.log.timestamps.reviewing_at) this.log.timestamps.reviewing_at = timestamp;
    if (to === 'RETRYING') this.log.timestamps.retrying_at = timestamp;
    if (to === 'COMPLETED') this.log.timestamps.completed_at = timestamp;
    if (to === 'FAILED') this.log.timestamps.failed_at = timestamp;
  }

  setProducerDecision(decision: ProducerDecision): void {
    this.log.producer_decision = decision;
    this.log.provider = decision.provider;
    this.log.model = decision.model;
  }

  recordQualityReport(variantId: string, report: QualityReport): void {
    if (!this.log.quality_reports[variantId]) {
      this.log.quality_reports[variantId] = [];
    }
    this.log.quality_reports[variantId].push(report);
  }

  recordRetry(record: RetryRecord): void {
    this.log.retry_history.push(record);
    this.log.retry_count = this.log.retry_history.length;
  }

  recordPiEvent(event: Omit<PiEventRecord, 'timestamp'>): void {
    this.log.pi_events ??= [];
    this.log.pi_events.push({ ...event, timestamp: new Date().toISOString() });
    // Keep persisted audit data bounded even if a model repeatedly emits
    // lifecycle events before the workflow fails.
    if (this.log.pi_events.length > 256) this.log.pi_events.splice(0, this.log.pi_events.length - 256);
  }

  setFinalRecommendation(rec: FinalRecommendation): void {
    this.log.final_recommendation = rec;
  }

  setError(err: string): void {
    this.log.error = err;
    this.transition('FAILED', 'orchestrator', `任务执行失败: ${err}`);
  }

  resumeProduction(): void {
    if(this.log.status!=='FAILED')return;
    this.log.transitions.push({from:'FAILED',to:'GENERATING',agent:'orchestrator',timestamp:new Date().toISOString(),message:'显式恢复持久任务；只继续既有提交或已分配尝试'});
    this.log.status='GENERATING';
    delete this.log.error;
  }

  async persist(): Promise<void> {
    await jsonWrite(path.join(this.rootPath, 'agent-run.json'), this.log);
  }
}
