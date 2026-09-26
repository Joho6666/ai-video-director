import { videoReferenceTool } from './tools/reference';
import { videoAnalyzeTool } from './tools/director';
import { videoProduceTool } from './tools/production';
import { videoInspectTool } from './tools/inspect';
import type { VideoDirectorTool } from './tools/contract';

/**
 * DSH-free plugin metadata.
 *
 * The Harness loader reads `name`, `inject`, and `Config` from the plugin module
 * and then calls `apply(ctx, config)`. Only `apply` needs the Harness runtime, so
 * the identity and the tool inventory live here where they can be imported and
 * asserted without a Harness installation.
 *
 * @see ./index.ts for the `apply` wiring.
 */

/** Stable loader identity for this plugin. */
export const name = 'ai-video-director';

/**
 * Services this plugin needs. `tools` is the only hard requirement: the plugin
 * registers tools and nothing else, so it can load in the narrowest profile.
 */
export const inject = ['tools'];

/** Every tool this plugin registers, in registration order. */
export const tools: ReadonlyArray<VideoDirectorTool<unknown, unknown>> = [
  videoReferenceTool as unknown as VideoDirectorTool<unknown, unknown>,
  videoAnalyzeTool as unknown as VideoDirectorTool<unknown, unknown>,
  videoProduceTool as unknown as VideoDirectorTool<unknown, unknown>,
  videoInspectTool as unknown as VideoDirectorTool<unknown, unknown>,
];

/** Tool names in registration order, for cheap assertions and diagnostics. */
export const toolNames: readonly string[] = tools.map(tool => tool.name);
