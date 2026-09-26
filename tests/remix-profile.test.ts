import test from 'node:test';
import assert from 'node:assert/strict';
import { remixProfiles } from '../packages/shared/types';
test('exposes three bounded remix presets', () => { assert.deepEqual(Object.keys(remixProfiles).sort(), ['close','creative','structure']); for (const profile of Object.values(remixProfiles)) for (const key of ['hookLock','shotStructureLock','cameraLock','motionLock','pacingLock'] as const) assert.ok(profile[key] >= 0 && profile[key] <= 1); });
test('structure remix replaces source identity assets', () => { assert.equal(remixProfiles.structure.characterReplace, true); assert.equal(remixProfiles.structure.productReplace, true); assert.equal(remixProfiles.structure.copyReplace, true); });
