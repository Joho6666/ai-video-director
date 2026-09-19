const technicalPatterns = [
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /UND_ERR_CONNECT_TIMEOUT/i,
  /connect timeout/i,
  /socket hang up/i,
  /fetch failed/i,
  /JSON parse|Unexpected token/i,
  /\bHTTP \d{3}\b/i,
  /stack trace/i,
  /\b(?:ENOENT|EACCES|EPERM|ETIMEDOUT|EAI_AGAIN)\b/,
  /^\s*(?:Error|TypeError|RangeError|ReferenceError|SyntaxError|AggregateError)\b/,
  /^\s*at\s+\S+\s*\(/m,
];

/** Provider/transport failure wording. Only meaningful together with a real
 *  failure signal, never on its own — see `customerErrorMessage` below. */
const transportFailure = /network|timeout|timed out|connect|refus|unavailable|denied|unreachable/i;

/**
 * True when a string looks like a raw runtime/provider error rather than text
 * already written for the customer.
 *
 * Log messages are authored in the customer's language ("DeepSeek 正在识别人物
 * 动作并提取 Shot DNA", "Producer Agent 生产决策：WAN (...)"). Running the
 * prose-matching `customerErrorMessage` over them rewrites a perfectly healthy
 * run into a wall of "服务暂时不可用"-style messages, because those patterns
 * only look for a product or vendor name (DeepSeek / WAN / quality / provider).
 * Only strings carrying an actual technical signature may be masked.
 */
export function isTechnicalMessage(value: unknown): boolean {
  const raw = value instanceof Error ? value.message : String(value ?? '');
  if (!raw) return false;
  return technicalPatterns.some(pattern => pattern.test(raw));
}

/** Convert implementation/provider details into safe text for the customer UI. */
export function customerErrorMessage(value: unknown): string {
  const raw = (value instanceof Error ? value.message : String(value ?? '')).trim();
  if (!raw) return '任务执行失败，请稍后重试';

  // A vendor name alone proves nothing: every line mentioning DeepSeek, WAN or
  // "quality" is not an outage. Require an explicit failure signal alongside it.
  if (/Pi model request failed/i.test(raw)) return '导演分析服务暂时不可用';
  if (/DeepSeek/i.test(raw) && /fail|error|unavailable|timeout|refus|\bHTTP \d{3}\b|ECONN|fetch failed/i.test(raw)) {
    return '导演分析服务暂时不可用';
  }
  if (/Director.*unavailable/i.test(raw)) return '导演分析服务暂时不可用';
  if (/Pi attempted an invalid tool sequence/i.test(raw)) return '工作流暂时无法继续，请稍后恢复';
  if (/manual.?verification|submission outcome unknown|no resubmission/i.test(raw)) {
    return '提交状态不确定，请人工确认，系统不会重复扣费';
  }
  if (/visual quality did not pass|quality did not pass|quality.*not pass|审核未通过|质量审核失败/i.test(raw)) {
    return '质量审核未通过，已保留成片供查看';
  }
  if (/quality|visual qc|审核/i.test(raw)) return '质量审核暂时不可用';
  if (/polling|queue|processing|remote task|云端|task.?id/i.test(raw)) {
    return '视频仍在云端生成，可稍后恢复';
  }
  if (/video generation|download/i.test(raw)) {
    return '视频生成服务暂时无法连接';
  }
  if (/(?:minimax|wan|seedance|veo|provider)\b/i.test(raw) && (transportFailure.test(raw) || isTechnicalMessage(raw))) {
    return '视频生成服务暂时无法连接';
  }
  if (transportFailure.test(raw) || isTechnicalMessage(raw)) {
    return '视频生成服务暂时无法连接';
  }
  return raw;
}

export function customerizeTask<T extends { error?: string; logs?: Array<{ time: string; message: string }> }>(task: T): T {
  const output = {
    ...task,
    error: task.error ? customerErrorMessage(task.error) : task.error,
    // Progress logs are already customer-facing prose. Masking them would
    // report failures that never happened, so only raw technical lines are
    // sanitized here.
    logs: task.logs?.map(log => ({
      ...log,
      message: isTechnicalMessage(log.message) ? customerErrorMessage(log.message) : log.message,
    })),
  } as T & {
    results?: Array<{ error?: string; [key: string]: unknown }>;
    generationTasks?: Array<{ error?: string; [key: string]: unknown }>;
  };
  if (Array.isArray(output.results)) output.results = output.results.map(result => ({ ...result, error: result.error ? customerErrorMessage(result.error) : result.error }));
  if (Array.isArray(output.generationTasks)) output.generationTasks = output.generationTasks.map(job => ({ ...job, error: job.error ? customerErrorMessage(job.error) : job.error }));
  return output as T;
}
