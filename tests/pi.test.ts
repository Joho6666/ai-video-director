import test from 'node:test';
import assert from 'node:assert/strict';
import { Type, createModels, fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { z } from 'zod';
import { runPiAgent, type RuntimeTool } from '../packages/pi-runtime';

function harness(calls: string[][]) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses(calls.map(names => fauxAssistantMessage(names.map(name => fauxToolCall(name, {})), { stopReason: 'toolUse' })));
  return { model: faux.getModel()!, streamFn: models.streamSimple.bind(models) };
}

test('Pi real SDK executes guarded tool sequence and stops at durable completion', async () => {
  const seen: string[] = [];
  const tools: RuntimeTool[] = ['analyze', 'finalize'].map(name => ({
    name, description: name, parameters: Type.Object({}), input: z.object({}).strict(),
    execute: async () => { seen.push(name); return { ok: true }; },
  }));
  const result = await runPiAgent({ systemPrompt: 'Test', prompt: 'Test', tools,
    canExecute: name => name === (seen.length === 0 ? 'analyze' : 'finalize'),
    isComplete: () => seen.includes('finalize'), transport: harness([['analyze'], ['finalize']]),
  });
  assert.equal(result.turns, 2);
  assert.deepEqual(seen, ['analyze', 'finalize']);
});

test('Pi refuses a multi-tool batch before executing any effect', async () => {
  let effects = 0;
  await assert.rejects(runPiAgent({ systemPrompt: 'Test', prompt: 'Test',
    tools: [{ name: 'generate', description: 'generate', parameters: Type.Object({}), input: z.object({}), execute: async () => { effects++; } }],
    canExecute: () => true, isComplete: () => false, transport: harness([['generate', 'generate']]),
  }), /invalid tool sequence/);
  assert.equal(effects, 0);
});

test('Pi caps turns without performing another model request', async () => {
  let effects = 0;
  await assert.rejects(runPiAgent({ systemPrompt: 'Test', prompt: 'Test', maxTurns: 2,
    tools: [{ name: 'poll', description: 'poll', parameters: Type.Object({}), input: z.object({}), execute: async () => { effects++; } }],
    canExecute: () => true, isComplete: () => false, transport: harness([['poll'], ['poll'], ['poll']]),
  }), /turn limit/);
  assert.equal(effects, 2);
});

test('Pi missing key returns UNAVAILABLE before transport', async () => {
  await assert.rejects(runPiAgent({ systemPrompt: '', prompt: '', tools: [], canExecute: () => true, isComplete: () => false, env: {} }), /UNAVAILABLE: DEEPSEEK_API_KEY missing/);
});

test('Pi applies Zod tool boundary and never executes invalid input', async () => {
  let effects = 0;
  await assert.rejects(runPiAgent({ systemPrompt: 'Test', prompt: 'Test', maxTurns: 1,
    tools: [{ name: 'submit', description: 'submit', parameters: Type.Object({}), input: z.object({ approved: z.literal(true) }), execute: async () => { effects++; } }],
    canExecute: () => true, isComplete: () => false, transport: harness([['submit']]),
  }), /turn limit/);
  assert.equal(effects, 0);
});
