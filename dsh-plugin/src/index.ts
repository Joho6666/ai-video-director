import { defineTool } from '@deepseek-ai/dsh-tools';
import type { ToolExecContext } from '@deepseek-ai/dsh-tools';
import { name, inject, tools } from './plugin-meta';
import { videoReferenceTool } from './tools/reference';
import { videoAnalyzeTool } from './tools/director';
import { videoProduceTool } from './tools/production';
import { videoInspectTool } from './tools/inspect';

/**
 * DeepSeek Harness plugin entry: AI Video Director.
 *
 * This file is deliberately thin — it is the only module in the plugin that
 * imports the Harness runtime. Everything it registers delegates to existing
 * `packages/*` implementations, so there is exactly one version of the Director,
 * reference, quality, retry, and payment-safety code in the project.
 *
 * Division of responsibility:
 *  - the Harness owns the agent loop, session, context, tool calling, and skill
 *    loading (see `plugin-meta.ts` and `cordis.patch.yml`);
 *  - AI Video Director owns reference sourcing, FFmpeg, Shot/Motion DNA, the
 *    Director, the prompt compiler, the provider router, video generation,
 *    quality, retry, payment safety, and task state.
 *
 * The Harness can never reach a paid provider API from here: `video_produce`
 * only ever hands a task to the existing deterministic scheduler.
 *
 * The pure tool descriptors live in `./tools/*`; the identity and inventory live
 * in `./plugin-meta.ts`. Both are Harness-free and unit-tested in this repo.
 */

interface PluginContext {
  tools: {
    register(definition: unknown): unknown;
  };
}

/**
 * Register the AI Video Director tools on the Harness tool registry.
 * @param ctx - the agent-scoped Harness context.
 */
export function apply(ctx: PluginContext): void {
  for (const tool of tools) {
    ctx.tools.register(defineTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      output: {
        schema: tool.output.schema,
        render: (args: unknown, value: unknown) => tool.output.render(args, value),
      },
      execute: (args: unknown, exec: ToolExecContext) => tool.execute(args, exec),
    }));
  }
}

export { name, inject, tools };
export { videoReferenceTool, videoAnalyzeTool, videoProduceTool, videoInspectTool };
