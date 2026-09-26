/**
 * Ambient declarations for the DeepSeek Harness host modules this plugin binds
 * to.
 *
 * These are NOT guesses. They were transcribed from the installed runtime of
 * `@deepseek-ai/dsh-tools@0.1.7-rc.2` (desktop app bundle: `lib/index.js`,
 * `defineTool`, `ToolsService.register`) and from the reference plugin
 * `@deepseek-ai/dsh-tool-present@0.1.7-rc.2` (`lib/index.js`), then checked
 * against `@deepseek-ai/dsh-tools@0.1.0-rc.6`, whose full `.d.ts` ships with the
 * globally installed `dsh` CLI.
 *
 * The desktop app bundle ships runtime `.js` with no `.d.ts`, so this file lets
 * the plugin typecheck inside this repository. Where the real module is
 * resolvable (as in the CLI install) the real types win and this declaration is
 * ignored.
 *
 * Verified contract points (both versions agree):
 *  - a tool plugin exports `name`, `inject`, optional `Config`, and `apply(ctx, config)`;
 *  - `defineTool({ name, description, parameters, output, timeoutMs?, execute })`
 *    returns a registry-ready definition;
 *  - `parameters` is a per-property map of `{ type, required?, description?, ... }`;
 *  - `output` must declare `{ schema, render }` and `render` returns content blocks;
 *  - `execute(args, exec)` receives the validated arguments and an exec context
 *    carrying `signal` (and `agent` when a Session exists).
 *
 * Difference the type side cannot express, but 0.1.0-rc.6 enforces at runtime:
 * every `type: 'object'` node must declare `additionalProperties` explicitly
 * (`true` or `false`). Omitting it throws `JsonSchemaError` when the tool is
 * registered. See `docs/` in the plugin README for the full note.
 */

declare module '@deepseek-ai/dsh-tools' {
  /** A single content block returned by a tool's `render`. */
  export interface ToolTextBlock {
    type: 'text';
    text: string;
  }

  export type ToolContentBlock = ToolTextBlock;

  /**
   * Author-facing value schema node, used for BOTH a tool's `parameters`
   * property map and its `output.schema`.
   *
   * Verified against the host compiler (`runSchemaCompiler`, `kind: "value"`):
   * `required` is a per-property author shorthand that the host hoists into the
   * raw JSON Schema `required: string[]` array, so it is a boolean here and only
   * `true` is accepted. Supported author keys are type/oneOf/properties/required/
   * additionalProperties/items/enum/const plus annotations (title/description).
   */
  export interface ToolSchemaSpec {
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
    description?: string;
    title?: string;
    /** Author shorthand: the host hoists `true` into the parent's required list. */
    required?: boolean;
    enum?: readonly unknown[];
    const?: unknown;
    items?: ToolSchemaSpec;
    properties?: Record<string, ToolSchemaSpec>;
    additionalProperties?: boolean;
    oneOf?: readonly ToolSchemaSpec[];
  }

  /** The implicit open parameter object of a tool. */
  export type ToolParameters = Record<string, ToolSchemaSpec>;

  export interface ToolOutputSpec<Value> {
    schema: ToolSchemaSpec;
    render(args: unknown, value: Value): ToolContentBlock[];
    presentationMeta?(args: unknown, value: Value): unknown;
  }

  /** Execution context handed to a tool's `execute`. */
  export interface ToolExecContext {
    signal?: AbortSignal;
    /** Present when the call runs inside an agent Session. */
    agent?: { session?: { header?: { cwd?: string } } };
    callId?: string;
  }

  export interface ToolDefinitionOptions<Args, Value> {
    name: string;
    description: string;
    parameters: ToolParameters;
    output: ToolOutputSpec<Value>;
    timeoutMs?: number;
    execute(args: Args, exec: ToolExecContext): Value | Promise<Value>;
  }

  export interface ToolDefinition<Args = unknown, Value = unknown> extends ToolDefinitionOptions<Args, Value> {
    readonly __tool?: never;
  }

  /** Build a registry-ready, strictly validated tool definition. */
  export function defineTool<Args, Value>(options: ToolDefinitionOptions<Args, Value>): ToolDefinition<Args, Value>;

  export function validateArgs(spec: ToolParameters, args: unknown): string[];
}

declare module '@deepseek-ai/schemastery' {
  interface Schema<T> { (value: unknown): T }
  const z: {
    object(shape: Record<string, unknown>): Schema<Record<string, unknown>>;
    string(): { default(value: string): unknown; min(n: number): unknown };
    number(): { default(value: number): { min(n: number): unknown } & unknown; min(n: number): unknown };
    boolean(): { default(value: boolean): unknown };
    array(inner: unknown): { default(value: unknown[]): unknown };
  };
  export default z;
}
