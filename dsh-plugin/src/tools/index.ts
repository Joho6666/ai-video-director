/**
 * Tool barrel for the AI Video Director Harness plugin.
 *
 * Exported separately from `src/index.ts` so tests and other adapters can
 * consume the tool descriptors without pulling in the DSH runtime import.
 */
export { videoReferenceTool, type ReferenceAction, type ReferenceToolArgs, type ReferenceToolResult, type ProjectedReference } from './reference';
export { videoAnalyzeTool, type AnalyzeToolArgs, type AnalyzeToolResult, type AnalyzeVariant, type RemixMode } from './director';
export { videoProduceTool, type ProduceToolArgs, type ProduceToolResult } from './production';
export { videoInspectTool, type InspectToolArgs } from './inspect';
export { defineVideoDirectorTool, renderJson, type VideoDirectorTool } from './contract';
