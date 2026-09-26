import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { normalizeTikHub, stageReferenceImport } from '../packages/reference-source';
import { ffmpeg, mediaExec, preprocess } from '../packages/video-analysis';

test('mock reference import feeds the existing preprocess chain', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reference-import-'));
  try {
    const source = path.join(root, 'source.mp4');
    await mediaExec(ffmpeg, ['-f','lavfi','-i','color=c=black:s=320x240:d=2','-c:v','mpeg4','-y',source]);
    const bytes = await readFile(source);
    const reference = normalizeTikHub({ data:{ id:'video-1', video:{ url:'https://cdn.example/video.mp4', duration:2000 } } }, 'https://www.tiktok.com/@demo/video/1', 'tiktok');
    const staged = await stageReferenceImport(reference, path.join(root, 'staged'), { fetchImpl: async () => new Response(bytes, { headers:{ 'content-type':'video/mp4', 'content-length':String(bytes.length) } }) });
    const imported = JSON.parse(await readFile(path.join(root,'staged',staged.importId,'reference.json'),'utf8'));
    const metadata = await preprocess(path.join(root,'staged',staged.importId,imported.localFile), path.join(root,'analysis'));
    assert.equal(metadata.width,320); assert.equal(metadata.height,240); assert.equal(imported.provider,'tikhub');
  } finally { await rm(root,{recursive:true,force:true}); }
});
