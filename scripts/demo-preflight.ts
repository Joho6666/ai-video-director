import { loadLocalEnv } from './env';
import { runPreflight } from './demo-preflight-lib';

await loadLocalEnv();
const result = await runPreflight();
if (!result.ok) process.exitCode = 1;
