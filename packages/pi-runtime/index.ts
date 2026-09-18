import type { AgentEvent, AgentTool, StreamFn } from '@earendil-works/pi-agent-core';
import type { Api, Model, TSchema } from '@earendil-works/pi-ai';
import { z } from 'zod';

export const MAX_PI_TURNS = 24;

export interface RuntimeTool {
  name: string;
  description: string;
  parameters: TSchema;
  input: z.ZodTypeAny;
  output?: z.ZodTypeAny;
  execute: (input: unknown, signal?: AbortSignal) => Promise<unknown>;
}

/** Business events deliberately omit raw model messages, arguments and tool payloads. */
export interface PiRuntimeEvent {
  type: AgentEvent['type'];
  turn: number;
  toolName?: string;
  toolCallId?: string;
  model?: string;
  provider?: string;
  responseId?: string;
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number };
  isError?: boolean;
  /** A bounded, redacted summary of a tool result for the audit log. */
  resultSummary?: string;
}

export interface PiRuntimeOptions {
  systemPrompt: string;
  prompt: string;
  tools: RuntimeTool[];
  canExecute: (name: string, input: unknown) => boolean | Promise<boolean>;
  isComplete: () => boolean;
  onEvent?: (event: PiRuntimeEvent) => void | Promise<void>;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
  maxTurns?: number;
  timeoutMs?: number;
  /** In-memory protocol tests only; the application must not expose these over HTTP. */
  transport?: { model: Model<Api>; streamFn: StreamFn };
}

export async function runPiAgent(options: PiRuntimeOptions): Promise<{ turns: number; model: string }> {
  const env = options.env ?? process.env;
  if (!options.transport && !env.DEEPSEEK_API_KEY?.trim()) throw new Error('UNAVAILABLE: DEEPSEEK_API_KEY missing');
  const limit = options.maxTurns ?? MAX_PI_TURNS;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PI_TURNS) throw new Error('Pi turn limit must be between 1 and 24');
  options.signal?.throwIfAborted();
  const [{ Agent }, { createModels, createProvider, envApiKeyAuth }] = await Promise.all([
    import('@earendil-works/pi-agent-core'), import('@earendil-works/pi-ai'),
  ]);
  let transport = options.transport;
  if (!transport) {
    const { openAICompletionsApi } = await import('@earendil-works/pi-ai/api/openai-completions.lazy');
    // This orchestrator receives text summaries. Vision remains the Director tool's responsibility.
    const model: Model<'openai-completions'> = {
      id: env.DEEPSEEK_MODEL || 'deepseek-flash', name: 'Configured DeepSeek orchestrator',
      api: 'openai-completions', provider: 'deepseek', baseUrl: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens', thinkingFormat: 'deepseek' },
    };
    const models = createModels();
    models.setProvider(createProvider({
      id: 'deepseek', models: [model], api: openAICompletionsApi(),
      auth: { apiKey: envApiKeyAuth('DeepSeek API key', ['DEEPSEEK_API_KEY']) },
    }));
    transport = { model, streamFn: models.streamSimple.bind(models) };
  }
  const selectedTransport = transport;
  let turns = 0;
  let blocked = false;
  const tools: AgentTool[] = options.tools.map(tool => ({
    name: tool.name, label: tool.name, description: tool.description, parameters: tool.parameters,
    executionMode: 'sequential', replay: 'never',
    execute: async (_id, raw, signal) => {
      signal?.throwIfAborted();
      const input = tool.input.parse(raw);
      if (options.isComplete() || !await options.canExecute(tool.name, input)) {
        blocked = true;
        throw new Error('Tool not allowed in the current workflow state');
      }
      let result: unknown;
      try {
        result = await tool.execute(input, signal);
      } catch (error) {
        // A failed business tool is terminal for this model run. Returning the
        // error to Pi and allowing it to guess a retry can repeat a paid or
        // stateful action out of order. Recovery is handled by the durable
        // workflow on the next run, never by an untrusted model retry.
        blocked = true;
        throw error;
      }
      const checked = tool.output ? tool.output.parse(result) : result;
      return { content: [{ type: 'text', text: JSON.stringify(checked ?? null) }], details: {}, terminate: options.isComplete() };
    },
  }));
  const agent = new Agent({
    initialState: { systemPrompt: options.systemPrompt, model: selectedTransport.model, tools, thinkingLevel: 'off' },
    toolExecution: 'sequential',
    streamFn: (model, context, streamOptions) => selectedTransport.streamFn(model, context, {
      ...streamOptions, apiKey: options.transport ? undefined : env.DEEPSEEK_API_KEY,
      maxRetries: 0, timeoutMs: 180000, maxTokens: 4096, reasoning: undefined,
    }),
    beforeToolCall: async ({ assistantMessage, toolCall, args }) => {
      const batch = assistantMessage.content.filter(part => part.type === 'toolCall');
      if (blocked || batch.length !== 1 || options.isComplete() || !await options.canExecute(toolCall.name, args)) {
        blocked = true;
        return { block: true, reason: 'Only one allowed workflow action per turn', terminate: true };
      }
      return undefined;
    },
    shouldStopAfterTurn: () => blocked || options.isComplete() || turns >= limit,
  });
  agent.subscribe(async event => {
    if (event.type === 'turn_start') turns++;
    if (event.type === 'message_update') return;
    const eventResult = 'result' in event ? (event as { result?: unknown }).result : undefined;
    const message = 'message' in event ? event.message : undefined;
    const assistant = message && message.role === 'assistant' ? message : undefined;
    const usage = assistant?.usage && [assistant.usage.input, assistant.usage.output, assistant.usage.cacheRead, assistant.usage.cacheWrite, assistant.usage.totalTokens].every(Number.isFinite)
      ? { input: assistant.usage.input, output: assistant.usage.output, cacheRead: assistant.usage.cacheRead, cacheWrite: assistant.usage.cacheWrite, totalTokens: assistant.usage.totalTokens }
      : undefined;
    await options.onEvent?.({
      type: event.type, turn: turns,
      ...('toolName' in event ? { toolName: event.toolName, toolCallId: event.toolCallId } : {}),
      ...(assistant ? { model: assistant.model, provider: assistant.provider, ...(assistant.responseId ? { responseId: assistant.responseId } : {}) } : {}),
      ...(usage ? { usage } : {}),
      ...('isError' in event ? { isError: event.isError } : {}),
      ...(eventResult === undefined ? {} : { resultSummary: summarizeResult(eventResult) }),
    });
  });
  const abort = () => agent.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; agent.abort(); }, options.timeoutMs ?? 30 * 60 * 1000);
  try {
    await agent.prompt(options.prompt);
    options.signal?.throwIfAborted();
    if (timedOut) throw new Error('Pi runtime deadline exceeded');
    if (agent.state.errorMessage) throw new Error('Pi model request failed');
    if (blocked) throw new Error('Pi attempted an invalid tool sequence');
    if (!options.isComplete()) throw new Error(turns >= limit ? 'Pi turn limit exceeded' : 'Pi stopped before workflow completion');
    return { turns, model: selectedTransport.model.id };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    await agent.waitForIdle();
  }
}

function summarizeResult(value: unknown): string {
  try {
    const text = JSON.stringify(value ?? null);
    return text.length > 500 ? `${text.slice(0, 497)}...` : text;
  } catch {
    return '[unserializable result]';
  }
}
