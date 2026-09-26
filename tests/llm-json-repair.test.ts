import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import type OpenAI from 'openai';
import { completeJsonWithRepair, type JsonCompletionClient } from '../packages/shared/llm-json-repair';

type Params = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
const schema = z.object({ evidence: z.array(z.object({ dimension: z.enum(['a', 'b']) }).strict()) }).strict();
const request = { model: 'fake', messages: [{ role: 'user', content: 'go' }] } as Params;

function fakeClient(replies: Array<{ content: string | null; finish?: string }>) {
  const calls: Params[] = [];
  const client: JsonCompletionClient = {
    chat: { completions: { async create(params: Params) {
      calls.push(params);
      const reply = replies[calls.length - 1];
      if (!reply) throw new Error('unexpected extra call');
      return { id: `resp-${calls.length}`, model: 'fake', choices: [{ index: 0, finish_reason: reply.finish ?? 'stop', message: { role: 'assistant', content: reply.content } }] } as unknown as OpenAI.Chat.Completions.ChatCompletion;
    } } },
  };
  return { client, calls };
}
const good = JSON.stringify({ evidence: [{ dimension: 'a' }] });
const bad = JSON.stringify({ evidence: [{ dimension: 'a' }, { dimension: 'reference_similarity' }] });

test('valid first response needs a single call and no repair', async () => {
  const { client, calls } = fakeClient([{ content: good }]);
  const out = await completeJsonWithRepair({ client, request, validate: raw => schema.parse(raw), label: 'T' });
  assert.equal(calls.length, 1);
  assert.equal(out.repair, undefined);
  assert.equal(out.value.evidence[0].dimension, 'a');
});

test('schema failure is repaired exactly once with the Zod path in the prompt', async () => {
  const { client, calls } = fakeClient([{ content: bad }, { content: good }]);
  const out = await completeJsonWithRepair({ client, request, validate: raw => schema.parse(raw), label: 'T' });
  assert.equal(calls.length, 2);
  assert.equal(out.repair?.id, 'resp-2');
  assert.equal(out.response.id, 'resp-1');
  const followUp = calls[1].messages;
  assert.equal(followUp.length, 3);
  assert.equal(followUp[1].role, 'assistant');
  assert.equal(followUp[1].content, bad);
  assert.match(String(followUp[2].content), /evidence\.1\.dimension/);
});

test('a second schema failure throws without a third call', async () => {
  const { client, calls } = fakeClient([{ content: bad }, { content: bad }]);
  await assert.rejects(
    completeJsonWithRepair({ client, request, validate: raw => schema.parse(raw), label: 'T' }),
    /failed validation after one repair attempt/,
  );
  assert.equal(calls.length, 2);
});

test('truncated or empty output is not repairable', async () => {
  const truncated = fakeClient([{ content: '{"evid', finish: 'length' }]);
  await assert.rejects(completeJsonWithRepair({ client: truncated.client, request, validate: raw => schema.parse(raw), label: 'T' }), /truncated/);
  assert.equal(truncated.calls.length, 1);
  const empty = fakeClient([{ content: '  ' }]);
  await assert.rejects(completeJsonWithRepair({ client: empty.client, request, validate: raw => schema.parse(raw), label: 'T' }), /empty/);
  assert.equal(empty.calls.length, 1);
});

test('invalid JSON text gets the single repair round', async () => {
  const { client, calls } = fakeClient([{ content: 'not json' }, { content: good }]);
  const out = await completeJsonWithRepair({ client, request, validate: raw => schema.parse(raw), label: 'T' });
  assert.equal(calls.length, 2);
  assert.match(out.repair?.errors ?? '', /not valid JSON/);
});
