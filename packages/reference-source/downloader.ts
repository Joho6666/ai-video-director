import { lookup } from 'node:dns/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { ffprobe, mediaExec } from '../video-analysis';

export type DownloadOptions = { maxBytes?: number; timeoutMs?: number; maxRedirects?: number; fetchImpl?: typeof fetch };
function blockedHost(hostname: string) { const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true; if (isIP(h) === 6) return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb') || h.startsWith('::ffff:'); if (isIP(h) === 4) { const n = h.split('.').map(Number); return n[0] === 0 || n[0] === 10 || n[0] === 127 || n[0] >= 224 || (n[0] === 100 && n[1] >= 64 && n[1] <= 127) || (n[0] === 169 && n[1] === 254) || (n[0] === 172 && n[1] >= 16 && n[1] <= 31) || (n[0] === 192 && n[1] === 168); } return false; }
export async function assertSafeUrl(raw: string) { const url = new URL(raw); if (!['http:', 'https:'].includes(url.protocol) || blockedHost(url.hostname)) throw new Error('不安全的参考视频地址'); const records = await lookup(url.hostname, { all: true }).catch(() => []); if (records.some(r => blockedHost(r.address))) throw new Error('参考视频地址解析到内网地址'); return url; }
export async function downloadReferenceVideo(sourceUrl: string, directory: string, options: DownloadOptions = {}) {
  const maxBytes = options.maxBytes ?? 100 * 1024 * 1024; const fetchImpl = options.fetchImpl || fetch; let url = await assertSafeUrl(sourceUrl);
  for (let redirect = 0; redirect <= (options.maxRedirects ?? 3); redirect++) {
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(options.timeoutMs ?? 30_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); if (!location) throw new Error('参考视频重定向缺少目标'); url = await assertSafeUrl(new URL(location, url).toString()); continue; }
    if (!response.ok) throw new Error(`参考视频下载失败 HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || ''; if (!contentType.startsWith('video/') && !contentType.includes('octet-stream')) throw new Error('下载内容不是视频');
    const declared = Number(response.headers.get('content-length') || 0); if (declared > maxBytes) throw new Error('参考视频超过大小限制');
    if (!response.body) throw new Error('下载响应为空'); const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
    while (true) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > maxBytes) throw new Error('参考视频超过大小限制'); chunks.push(part.value); }
    await mkdir(directory, { recursive: true }); const target = path.join(directory, `reference-${randomUUID()}.mp4`); await writeFile(target, Buffer.concat(chunks));
    const probe = await mediaExec(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', target]); const info = JSON.parse(probe.stdout) as { streams?: Array<{ codec_type?: string }> }; if (!info.streams?.some(s => s.codec_type === 'video')) throw new Error('参考文件没有有效视频轨'); return { file: target, bytes: total, contentType };
  }
  throw new Error('参考视频重定向次数超限');
}
