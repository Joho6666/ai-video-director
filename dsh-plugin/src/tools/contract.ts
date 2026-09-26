import type {
  ToolContentBlock,
  ToolExecContext,
  ToolParameters,
  ToolSchemaSpec,
} from '@deepseek-ai/dsh-tools';

/**
 * The contract every AI Video Director Harness tool implements.
 *
 * A tool is a plain descriptor — it carries no DSH runtime import — so the
 * whole tool layer is unit-testable inside this repository without the Harness
 * installed. `dsh-plugin/src/index.ts` is the only place that hands these
 * descriptors to `defineTool` and `ctx.tools.register`.
 *
 * Rules every tool must follow:
 *  - validate its own arguments and fail closed, because argument validation is
 *    a safety boundary for a pipeline that can spend real money;
 *  - never call a video provider directly — paid work only ever reaches
 *    `packages/orchestrator`, which owns submission, retry, and QC gates;
 *  - return a bounded, JSON-serializable result with no secrets, no base64
 *    payloads, and no absolute filesystem paths.
 */
export interface VideoDirectorTool<Args, Result> {
  /** Harness tool name, e.g. `video_reference`. */
  readonly name: string;
  readonly description: string;
  /** Per-property parameter spec passed straight to `defineTool`. */
  readonly parameters: ToolParameters;
  readonly output: {
    schema: ToolSchemaSpec;
    render(args: unknown, value: Result): ToolContentBlock[];
  };
  execute(args: unknown, exec: ToolExecContext): Promise<Result>;
}

/** Convenience helper so each tool reads as a single object literal. */
export function defineVideoDirectorTool<Args, Result>(
  tool: VideoDirectorTool<Args, Result>,
): VideoDirectorTool<Args, Result> {
  return tool;
}

/** Render a compact JSON block for the conversation transcript. */
export function renderJson(label: string, value: unknown): ToolContentBlock[] {
  return [{ type: 'text', text: `${label}\n${JSON.stringify(value, null, 2)}` }];
}
