// Loaded before every test file (see the `test` script). Storage resolves
// DATA_DIR at import time, so point it at a throwaway directory to keep test
// tasks out of the real data/projects.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.DATA_DIR) process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'avd-test-'));
