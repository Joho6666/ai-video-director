import type OpenAI from 'openai';
import { ZodError } from 'zod';

type CreateParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
type Completion = OpenAI.Chat.Completions.ChatCompletion;

/** Structural subset of the OpenAI client so tests can inject a fake. */
export interface JsonCompletionClient {
  chat: { completions: { create(request: CreateParams): Promise<Completion> } };
}

export interface JsonRepairMeta {
  id: string;
  errors: string;
}

const MAX_ISSUES = 20;

/** Compact, model-readable description of a validation failure. */
export function describeValidationError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.slice(0, MAX_ISSUES).map(issue => {
      const where = issue.path.length ? issue.path.join('.') : '(root)';
      const received = 'received' in issue ? ` (received ${JSON.stringify(issue.received)})` : '';
      return `- ${where}: ${issue.message}${received}`;
    }).join('\n') + (error.issues.length > MAX_ISSUES ? `\n- …${error.issues.length - MAX_ISSUES} more` : '');
  }
  return `- ${error instanceof Error ? error.message : String(error)}`;
}

function readJsonChoice(response: Completion, label: string): string {
  const choice = response.choices[0];
  if (!choice) throw new Error(`${label} returned no choice`);
  if (choice.finish_reason === 'length') throw new Error(`${label} JSON was truncated by the token limit`);
  if (choice.finish_reason !== 'stop' || !choice.message.content?.trim()) {
    throw new Error(`${label} returned empty or incomplete JSON`);
  }
  return choice.message.content;
}

function parseAndValidate<T>(text: string, validate: (raw: unknown) => T): T {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('response is not valid JSON'); }
  return validate(raw);
}

/**
 * Run one JSON completion and validate it with the caller's strict validator.
 * On a validation failure (never on transport / truncation), ask the model
 * exactly once to correct the listed violations and validate again with the
 * SAME validator. The contract is never relaxed; a second failure throws.
 */
export async function completeJsonWithRepair<T>(options: {
  client: JsonCompletionClient;
  request: CreateParams;
  validate: (raw: unknown) => T;
  label: string;
}): Promise<{ value: T; response: Completion; repair?: JsonRepairMeta }> {
  const { client, request, validate, label } = options;
  const response = await client.chat.completions.create(request);
  const text = readJsonChoice(response, label);
  let firstError: unknown;
  try {
    return { value: parseAndValidate(text, validate), response };
  } catch (error) {
    firstError = error;
  }

  const errors = describeValidationError(firstError);
  const repairResponse = await client.chat.completions.create({
    ...request,
    messages: [
      ...request.messages,
      { role: 'assistant', content: text },
      {
        role: 'user',
        content: `Your JSON failed server-side validation:\n${errors}\n\n` +
          'Return the complete corrected JSON object. Fix only the listed violations and keep everything else unchanged. ' +
          'Use only the allowed enum values and keys from the contract; drop items that do not belong to it. ' +
          'If the supplied images cannot support a claim, mark it uncertain/Unknown with empty frame lists and low confidence. ' +
          'Never invent frame IDs, reference IDs or visual facts.',
      },
    ],
  });
  const repairText = readJsonChoice(repairResponse, `${label} repair`);
  try {
    return { value: parseAndValidate(repairText, validate), response, repair: { id: repairResponse.id, errors } };
  } catch (repairError) {
    const first = firstError instanceof Error ? firstError.message : String(firstError);
    const second = repairError instanceof Error ? repairError.message : String(repairError);
    const wrapped = new Error(`${label} failed validation after one repair attempt: ${second} (initial: ${first})`);
    (wrapped as Error & { cause?: unknown }).cause = firstError;
    throw wrapped;
  }
}
