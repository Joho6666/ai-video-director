const technicalPatterns = [
  /ECONNRESET/i,
  /UND_ERR_CONNECT_TIMEOUT/i,
  /connect timeout/i,
  /socket hang up/i,
  /fetch failed/i,
  /JSON parse|Unexpected token/i,
  /\bHTTP \d{3}\b/i,
  /stack trace/i,
];

/** Convert implementation/provider details into safe text for the customer UI. */
export function customerErrorMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? '');
  if (/Pi model request failed|DeepSeek|Director.*unavailable/i.test(raw)) return '导演分析服务暂时不可用';
  if (/Pi attempted an invalid tool sequence/i.test(raw)) return '工作流暂时无法继续，请稍后恢复';
  if (/manual.?verification|submission outcome unknown|no resubmission/i.test(raw)) {
    return '提交状态不确定，请人工确认，系统不会重复扣费';
  }
  if (/quality|visual qc|审核/i.test(raw)) return '质量审核暂时不可用';
  if (/polling|queue|processing|remote task|云端|task.?id/i.test(raw)) {
    return '视频仍在云端生成，可稍后恢复';
  }
  if (/provider|wan|minimax|video generation|download|network|timeout|connect/i.test(raw) || technicalPatterns.some(pattern => pattern.test(raw))) {
    return '视频生成服务暂时无法连接';
  }
  return raw || '任务执行失败，请稍后重试';
}

export function customerizeTask<T extends { error?: string; logs?: Array<{ time: string; message: string }> }>(task: T): T {
  return {
    ...task,
    error: task.error ? customerErrorMessage(task.error) : task.error,
    logs: task.logs?.map(log => ({ ...log, message: customerErrorMessage(log.message) })),
  };
}
