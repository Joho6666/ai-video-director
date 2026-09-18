import { NextResponse } from 'next/server';
import { readTask } from '@/packages/shared/storage';
import { WorkflowStateManager } from '@/packages/orchestrator/state';
import type { PiEventRecord } from '@/packages/orchestrator/state';

export const dynamic = 'force-dynamic';

/**
 * Customer-facing Pi orchestration trace.
 *
 * Reads the durable agent-run.json (which is never served raw) and returns a
 * strict whitelist of orchestration metadata. Tool result payloads are parsed
 * and reduced to status fields so no raw model text, provider body, prompt,
 * absolute path, or credential can reach the browser.
 */

/** Reduce a stored resultSummary to its status fields only. */
function sanitizeResultSummary(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A non-JSON summary is opaque text; never forward it verbatim.
    return undefined;
  }
  // The runtime wraps tool output as {content:[{type:'text',text:'<json>'}],details,terminate}.
  const candidate = (() => {
    if (parsed && typeof parsed === 'object' && 'content' in parsed) {
      const content = (parsed as { content?: unknown }).content;
      if (Array.isArray(content)) {
        const text = content.find(part => part && typeof part === 'object' && (part as { type?: string }).type === 'text');
        const value = (text as { text?: unknown } | undefined)?.text;
        if (typeof value === 'string') {
          try { return JSON.parse(value) as unknown; } catch { return undefined; }
        }
      }
      return undefined;
    }
    return parsed;
  })();

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;

  const source = candidate as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  // Explicit allowlist of business status fields. Everything else is dropped.
  const allowed = ['status', 'plan_ready', 'variants', 'provider', 'model', 'duration', 'reports', 'passed', 'missing_reports', 'repairable', 'attempts', 'task_status', 'results'] as const;
  for (const key of allowed) {
    if (!(key in source)) continue;
    const value = source[key];
    if (key === 'variants' && Array.isArray(value)) {
      output.variants = value.filter(item => typeof item === 'string').slice(0, 3);
      continue;
    }
    if (key === 'missing_reports' && Array.isArray(value)) {
      output.missing_reports = value.filter(item => typeof item === 'string').slice(0, 3);
      continue;
    }
    if (key === 'results' && Array.isArray(value)) {
      output.results = value.slice(0, 3).map(item => {
        const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        return { id: typeof entry.id === 'string' ? entry.id : '', status: typeof entry.status === 'string' ? entry.status : '' };
      });
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') output[key] = value;
  }
  return Object.keys(output).length ? output : undefined;
}

function sanitizeEvent(event: PiEventRecord) {
  return {
    type: typeof event.type === 'string' ? event.type : 'unknown',
    turn: Number.isFinite(event.turn) ? event.turn : 0,
    ...(event.toolName ? { toolName: event.toolName } : {}),
    ...(event.model ? { model: event.model } : {}),
    ...(event.provider ? { provider: event.provider } : {}),
    ...(typeof event.isError === 'boolean' ? { isError: event.isError } : {}),
    ...(typeof event.timestamp === 'string' ? { timestamp: event.timestamp } : {}),
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  let task;
  try {
    task = await readTask(id);
  } catch {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  }

  try {
    const stateManager = await WorkflowStateManager.load(id, task.appMode);
    const log = stateManager.currentLog;

    const piEvents = (log.pi_events ?? []).map(event => ({
      ...sanitizeEvent(event),
      ...(sanitizeResultSummary(event.resultSummary) ? { result: sanitizeResultSummary(event.resultSummary) } : {}),
    }));

    const qualityReports = Object.fromEntries(
      Object.entries(log.quality_reports ?? {}).map(([variantId, reports]) => [
        variantId,
        (reports ?? []).map(report => ({
          attempt: typeof report.attempt === 'number' ? report.attempt : 0,
          overall_score: typeof report.overall_score === 'number' ? report.overall_score : 0,
          passed: Boolean(report.passed),
          evaluation_mode: typeof report.evaluation_mode === 'string' ? report.evaluation_mode : 'unknown',
          retry_required: Boolean(report.retry_required),
          reference_similarity_score: typeof report.reference_similarity_score === 'number' ? report.reference_similarity_score : undefined,
          dimensions: report.dimensions && typeof report.dimensions === 'object'
            ? Object.fromEntries(
                Object.entries(report.dimensions as Record<string, unknown>)
                  .filter(([, value]) => typeof value === 'number')
                  .slice(0, 8),
              )
            : undefined,
          issue_count: Array.isArray(report.issues) ? report.issues.length : 0,
        })),
      ]),
    );

    const producerDecision = log.producer_decision
      ? {
          provider: log.producer_decision.provider,
          model: log.producer_decision.model,
          duration: log.producer_decision.duration,
          resolution: log.producer_decision.resolution,
          rationale: log.producer_decision.rationale,
        }
      : undefined;

    return NextResponse.json(
      {
        taskId: id,
        appMode: task.appMode,
        status: log.status,
        currentAgent: log.current_agent,
        model: log.model,
        provider: log.provider,
        retryCount: log.retry_count,
        timestamps: log.timestamps,
        piEvents,
        transitions: (log.transitions ?? []).map(item => ({
          from: item.from,
          to: item.to,
          agent: item.agent,
          timestamp: item.timestamp,
          message: item.message,
        })),
        qualityReports,
        ...(producerDecision ? { producerDecision } : {}),
        retryHistory: (log.retry_history ?? []).map(item => ({
          variantId: item.variantId,
          attempt: item.attempt,
          strategy: item.strategy,
          timestamp: item.timestamp,
        })),
        ...(log.final_recommendation ? { finalRecommendation: log.final_recommendation } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: '编排追踪数据暂时不可用' }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
