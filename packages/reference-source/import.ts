import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { jsonWrite } from '../shared/storage';
import { downloadReferenceVideo, type DownloadOptions } from './downloader';
import type { ReferenceVideo } from './types';

export async function stageReferenceImport(reference: ReferenceVideo, stagingRoot: string, options?: DownloadOptions) {
  if (!reference.videoUrl) throw new Error('参考视频缺少可下载地址');
  const importId = randomUUID(); const directory = path.join(stagingRoot, importId); await mkdir(directory, { recursive: true });
  const downloaded = await downloadReferenceVideo(reference.videoUrl, directory, options);
  const saved = { ...reference, localFile: path.basename(downloaded.file) };
  await jsonWrite(path.join(directory, 'reference.json'), saved);
  return { importId, reference: saved };
}
