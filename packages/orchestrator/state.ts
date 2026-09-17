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
    };
  }

  static async load(taskId: string, appMode: string): Promise<WorkflowStateManager> {
    const root = projectDir(taskId);
    try {
      const raw = await readFile(path.join(root, 'agent-run.json'), 'utf8');
      const parsed = JSON.parse(raw) as AgentRunLog;
      return new WorkflowStateManager(taskId, appMode, parsed);
    } catch {
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

  setFinalRecommendation(rec: FinalRecommendation): void {
    this.log.final_recommendation = rec;
  }

  setError(err: string): void {
    this.log.error = err;
    this.transition('FAILED', 'orchestrator', `任务执行失败: ${err}`);
  }

  async persist(): Promise<void> {
    await jsonWrite(path.join(this.rootPath, 'agent-run.json'), this.log);
  }
}
