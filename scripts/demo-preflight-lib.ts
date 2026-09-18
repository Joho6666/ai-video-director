import path from 'node:path';
import { access, constants, mkdir, stat, statfs, readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpeg, ffprobe } from '../packages/video-analysis';
import { resolveVideoRoute } from '../packages/video-provider/router';

const exec = promisify(execFile);
const root = process.cwd();
export type PreflightResult = { ok: boolean; checks: Array<{ name: string; status: 'PASS'|'FAIL'|'NOT_CHECKED'; detail: string; p0?: boolean }> };
async function occupied(port: number) { return new Promise<boolean>(resolve => { const socket = createConnection({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); socket.setTimeout(500, () => { socket.destroy(); resolve(false); }); }); }
async function command(binary: string) { try { await exec(binary, ['-version'], { timeout: 15_000, windowsHide: true }); return true; } catch { return false; } }

export async function runPreflight(options: { quiet?: boolean; requireLive?: boolean } = {}): Promise<PreflightResult> {
  const checks: PreflightResult['checks'] = [];
  const add = (name: string, status: PreflightResult['checks'][number]['status'], detail: string, p0 = false) => checks.push({ name, status, detail, p0 });
  const env = process.env as Record<string, string | undefined>;
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add('Node version', nodeMajor >= 20 ? 'PASS' : 'FAIL', process.versions.node, true);
  try {
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { version?: unknown };
    add('Package version', typeof packageJson.version === 'string' && /^1\.3\./.test(packageJson.version) ? 'PASS' : 'FAIL', typeof packageJson.version === 'string' ? packageJson.version : 'missing', true);
  } catch { add('Package version', 'FAIL', 'package.json unreadable', true); }
  try {
    const { stdout } = await exec('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, timeout: 10_000, windowsHide: true });
    add('Git SHA', /^[0-9a-f]{7,40}$/i.test(stdout.trim()) ? 'PASS' : 'FAIL', stdout.trim() || 'missing', true);
  } catch { add('Git SHA', 'FAIL', 'git revision unavailable', true); }
  add('FFmpeg', await command(ffmpeg) ? 'PASS' : 'FAIL', path.basename(ffmpeg), true);
  add('FFprobe', await command(ffprobe) ? 'PASS' : 'FAIL', path.basename(ffprobe), true);
  try { await access(root, constants.R_OK | constants.W_OK); add('Project directory', 'PASS', 'read/write', true); } catch { add('Project directory', 'FAIL', 'not writable', true); }
  try { const data = path.join(root, 'data'); await mkdir(data, { recursive: true }); await access(data, constants.R_OK | constants.W_OK); add('data directory', 'PASS', 'writable', true); } catch { add('data directory', 'FAIL', 'not writable', true); }
  try { const fs = await statfs(root); const free = Number(fs.bavail) * Number(fs.bsize); add('Disk space', free >= 2 * 1024 ** 3 ? 'PASS' : 'FAIL', `${Math.round(free / 1024 ** 3)} GiB free`, true); } catch { add('Disk space', 'NOT_CHECKED', 'filesystem stats unavailable'); }
  add('DeepSeek key', env.DEEPSEEK_API_KEY ? 'PASS' : 'FAIL', env.DEEPSEEK_API_KEY ? 'configured' : 'missing', true);
  const endpoints: Array<[string, string, string[]]> = [['DeepSeek base', env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', ['api.deepseek.com']], ['Wan base', env.WAN_BASE_URL || 'https://dashscope.aliyuncs.com', ['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com']]];
  for (const [name, value, hosts] of endpoints) {
    try { const url = new URL(value); add(name, url.protocol === 'https:' && hosts.includes(url.hostname) ? 'PASS' : 'FAIL', url.hostname, true); } catch { add(name, 'FAIL', 'invalid HTTPS URL', true); }
  }
  const minimaxBase = env.MINIMAX_BASE_URL || 'https://api.minimax.cn';
  try {
    const url = new URL(minimaxBase);
    const valid = url.protocol === 'https:' && ['api.minimax.cn', 'api.minimax.io', 'api.minimaxi.com'].includes(url.hostname);
    add('MiniMax base', valid ? 'PASS' : 'FAIL', url.hostname, Boolean(env.MINIMAX_API_KEY));
  } catch { add('MiniMax base', 'FAIL', 'invalid HTTPS URL', Boolean(env.MINIMAX_API_KEY)); }
  add('Wan provider config', env.WAN_API_KEY || env.DASHSCOPE_API_KEY ? 'PASS' : 'NOT_CHECKED', env.WAN_API_KEY || env.DASHSCOPE_API_KEY ? 'configured' : 'not configured');
  add('MiniMax provider config', env.MINIMAX_API_KEY ? 'PASS' : 'NOT_CHECKED', env.MINIMAX_API_KEY ? 'configured' : 'not configured');
  try { const route = resolveVideoRoute('full', 'fashion', { ...env, VIDEO_PROVIDER: 'wan' }); if (!route) throw new Error('route unavailable'); add('Wan route', route.provider === 'wan' && route.duration === 5 && route.resolution === '720P' ? 'PASS' : 'FAIL', `${route.model} ${route.duration}s ${route.resolution}`, true); } catch { add('Wan route', 'FAIL', env.WAN_API_KEY || env.DASHSCOPE_API_KEY ? 'configured but invalid' : 'WAN_API_KEY missing', true); }
  const goldenPath = path.join(root, 'demo', 'golden-case.json');
  try { const golden = JSON.parse(await readFile(goldenPath, 'utf8')) as Record<string, unknown>; for (const key of ['reference_video', 'model_image', 'product_image', ...(golden.first_frame_image ? ['first_frame_image'] : [])]) { const value = golden[key]; if (typeof value !== 'string' || path.isAbsolute(value)) throw new Error(`${key} is not relative`); const info = await stat(path.resolve(root, value)); if (!info.isFile() || !info.size) throw new Error(`${key} missing`); } add('Golden Demo assets', 'PASS', 'reference/model/product available', true); } catch { add('Golden Demo assets', 'FAIL', 'missing or invalid relative paths', true); }
  const port = await occupied(3080); add('Port 3080', 'PASS', port ? 'local service already listening' : 'available');
  try { const url = new URL(env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'); await exec(process.platform === 'win32' ? 'nslookup' : 'getent', process.platform === 'win32' ? [url.hostname] : ['hosts', url.hostname], { timeout: 10_000 }); add('Safe connectivity', 'PASS', 'DNS only; no paid request'); } catch { add('Safe connectivity', 'NOT_CHECKED', 'no safe read-only check available'); }
  const result = { ok: checks.every(check => !check.p0 || check.status !== 'FAIL'), checks };
  if (!options.quiet) { console.log('DEMO PREFLIGHT'); for (const check of checks) console.log(`${check.status.padEnd(12)} ${check.name}: ${check.detail}`); console.log(`DEMO PREFLIGHT = ${result.ok ? 'PASS' : 'FAIL'}`); }
  return result;
}
