import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { dataRoot, jsonWrite } from '../shared/storage';

export type ProviderId = 'deepseek' | 'wan' | 'minimax' | 'seedance';

export interface StoredSecretEntry {
  key?: string;
  baseUrl?: string;
  model?: string;
  updatedAt: string;
}

export interface StoredSecretsFile {
  version: '1.0';
  connections: Partial<Record<ProviderId, StoredSecretEntry>>;
}

export interface ConnectionStatusInfo {
  provider: ProviderId;
  name: string;
  role: string;
  configured: boolean;
  maskedKey: string | null;
  baseUrl: string;
  model: string;
  models: string[];
}

const SECRETS_DIR = path.join(dataRoot, 'config');
const SECRETS_FILE = path.join(SECRETS_DIR, 'secrets.json');

const DEFAULT_METADATA: Record<ProviderId, { name: string; role: string; defaultBaseUrl: string; defaultModel: string; models: string[]; envKeyNames: string[]; envBaseName: string; envModelName: string }> = {
  deepseek: {
    name: 'DeepSeek',
    role: '用于视频分析、导演规划和质量评估',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    models: ['deepseek-flash', 'deepseek-chat'],
    envKeyNames: ['DEEPSEEK_API_KEY'],
    envBaseName: 'DEEPSEEK_BASE_URL',
    envModelName: 'DEEPSEEK_MODEL',
  },
  wan: {
    name: 'Wan / DashScope',
    role: '阿里云通义万相 · 视频生成',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com',
    defaultModel: 'wanx2.1-i2v-plus',
    models: ['wanx2.1-i2v-plus'],
    envKeyNames: ['WAN_API_KEY', 'DASHSCOPE_API_KEY'],
    envBaseName: 'WAN_BASE_URL',
    envModelName: 'WAN_MODEL',
  },
  minimax: {
    name: 'MiniMax',
    role: '用于图生视频（可选）',
    defaultBaseUrl: 'https://api.minimax.cn',
    defaultModel: 'MiniMax-Hailuo-2.3',
    models: ['MiniMax-Hailuo-2.3'],
    envKeyNames: ['MINIMAX_API_KEY'],
    envBaseName: 'MINIMAX_BASE_URL',
    envModelName: 'MINIMAX_MODEL',
  },
  seedance: {
    name: 'Seedance',
    role: '字节跳动 · 视频生成（可选）',
    defaultBaseUrl: 'https://api.seedance.com',
    defaultModel: 'seedance-1.0-pro',
    models: ['seedance-1.0-pro'],
    envKeyNames: ['SEEDANCE_API_KEY'],
    envBaseName: 'SEEDANCE_BASE_URL',
    envModelName: 'SEEDANCE_MODEL',
  },
};

export function maskApiKey(key: string | undefined): string | null {
  if (!key || typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return '****';
  const prefix = trimmed.slice(0, 3);
  const suffix = trimmed.slice(-3);
  return `${prefix}****${suffix}`;
}

export async function readSecrets(): Promise<StoredSecretsFile> {
  try {
    const raw = await readFile(SECRETS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'connections' in parsed) {
      return parsed as StoredSecretsFile;
    }
    return { version: '1.0', connections: {} };
  } catch {
    return { version: '1.0', connections: {} };
  }
}

export async function writeSecrets(data: StoredSecretsFile): Promise<void> {
  await mkdir(SECRETS_DIR, { recursive: true });
  await jsonWrite(SECRETS_FILE, data);
}

export async function getSecret(provider: ProviderId, env: Record<string, string | undefined> = process.env): Promise<string | undefined> {
  const file = await readSecrets();
  const fromFile = file.connections[provider]?.key;
  if (fromFile && typeof fromFile === 'string' && fromFile.trim()) {
    return fromFile.trim();
  }
  const meta = DEFAULT_METADATA[provider];
  for (const name of meta.envKeyNames) {
    const fromEnv = env[name];
    if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  }
  return undefined;
}

export async function getProviderConfig(provider: ProviderId, env: Record<string, string | undefined> = process.env) {
  const file = await readSecrets();
  const stored = file.connections[provider];
  const meta = DEFAULT_METADATA[provider];
  const key = await getSecret(provider, env);
  const baseUrl = stored?.baseUrl || env[meta.envBaseName] || meta.defaultBaseUrl;
  const model = stored?.model || env[meta.envModelName] || meta.defaultModel;
  return {
    key,
    baseUrl: baseUrl.replace(/\/$/, ''),
    model,
    configured: Boolean(key),
  };
}

export async function setSecret(
  provider: ProviderId,
  data: { key?: string; baseUrl?: string; model?: string }
): Promise<void> {
  const file = await readSecrets();
  const existing = file.connections[provider] || { updatedAt: new Date().toISOString() };
  if (data.key !== undefined && data.key.trim()) {
    existing.key = data.key.trim();
  }
  if (data.baseUrl !== undefined) {
    existing.baseUrl = data.baseUrl.trim();
  }
  if (data.model !== undefined) {
    existing.model = data.model.trim();
  }
  existing.updatedAt = new Date().toISOString();
  file.connections[provider] = existing;
  await writeSecrets(file);
}

export async function deleteSecret(provider: ProviderId): Promise<void> {
  const file = await readSecrets();
  if (file.connections[provider]) {
    delete file.connections[provider];
    await writeSecrets(file);
  }
}

export async function listConnectionStatuses(env: Record<string, string | undefined> = process.env): Promise<ConnectionStatusInfo[]> {
  const providers: ProviderId[] = ['deepseek', 'wan', 'minimax', 'seedance'];
  const list: ConnectionStatusInfo[] = [];
  for (const p of providers) {
    const config = await getProviderConfig(p, env);
    const meta = DEFAULT_METADATA[p];
    list.push({
      provider: p,
      name: meta.name,
      role: meta.role,
      configured: config.configured,
      maskedKey: maskApiKey(config.key),
      baseUrl: config.baseUrl,
      model: config.model,
      models: meta.models,
    });
  }
  return list;
}

export async function testConnection(
  provider: ProviderId,
  override?: { key?: string; baseUrl?: string },
  env: Record<string, string | undefined> = process.env
): Promise<{ ok: boolean; latencyMs?: number; message: string }> {
  const config = await getProviderConfig(provider, env);
  const key = override?.key?.trim() || config.key;
  const baseUrl = (override?.baseUrl?.trim() || config.baseUrl).replace(/\/$/, '');

  if (!key) {
    return { ok: false, message: '未配置 API Key，请先输入密钥' };
  }

  const start = Date.now();
  try {
    if (provider === 'deepseek') {
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { ok: true, latencyMs, message: `连接正常 (${latencyMs}ms)` };
      }
      if (res.status === 401) {
        return { ok: false, latencyMs, message: 'API Key 无效或未授权' };
      }
      return { ok: false, latencyMs, message: `HTTP 错误: ${res.status}` };
    }

    if (provider === 'wan') {
      const res = await fetch(`${baseUrl}/api/v1/tasks/conn_probe_${Date.now()}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - start;
      if (res.status === 401) {
        return { ok: false, latencyMs, message: 'DashScope API Key 无效或未授权' };
      }
      return { ok: true, latencyMs, message: `连接正常 (${latencyMs}ms)` };
    }

    if (provider === 'minimax') {
      const res = await fetch(`${baseUrl}/v1/query/video_generation?task_id=probe_${Date.now()}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - start;
      if (res.status === 401) {
        return { ok: false, latencyMs, message: 'MiniMax API Key 无效' };
      }
      return { ok: true, latencyMs, message: `连接正常 (${latencyMs}ms)` };
    }

    if (provider === 'seedance') {
      return { ok: false, message: 'Seedance 适配器目前未配置可用端点' };
    }

    return { ok: false, message: '未知的服务提供商' };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return { ok: false, latencyMs, message: error instanceof Error ? error.message : '连接超时或网络异常' };
  }
}
