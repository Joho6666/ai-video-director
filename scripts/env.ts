import path from 'node:path';
import { readFile } from 'node:fs/promises';

export async function loadLocalEnv() {
  try {
    const text = await readFile(path.join(process.cwd(), '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* preflight reports missing configuration */ }
}
