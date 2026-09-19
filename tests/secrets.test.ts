import test from 'node:test';
import assert from 'node:assert/strict';
import { maskApiKey, getSecret, setSecret, deleteSecret, listConnectionStatuses } from '../packages/server/secrets.js';

test('maskApiKey masks secrets properly', () => {
  assert.equal(maskApiKey(''), null);
  assert.equal(maskApiKey(undefined), null);
  assert.equal(maskApiKey('12345678'), '****');
  assert.equal(maskApiKey('sk-1234567890abcdef'), 'sk-****def');
});

test('secrets storage reads, writes, and deletes securely', async () => {
  await setSecret('minimax', { key: 'test-minimax-key-123456', baseUrl: 'https://custom.minimax.cn', model: 'custom-model' });
  const key = await getSecret('minimax', {});
  assert.equal(key, 'test-minimax-key-123456');

  const statuses = await listConnectionStatuses({});
  const minimaxStatus = statuses.find(s => s.provider === 'minimax');
  assert.ok(minimaxStatus);
  assert.equal(minimaxStatus?.configured, true);
  assert.equal(minimaxStatus?.maskedKey, 'tes****456');
  assert.equal(minimaxStatus?.baseUrl, 'https://custom.minimax.cn');
  assert.equal(minimaxStatus?.model, 'custom-model');

  await deleteSecret('minimax');
  const deletedKey = await getSecret('minimax', {});
  assert.equal(deletedKey, undefined);
});
