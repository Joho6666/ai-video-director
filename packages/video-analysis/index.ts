import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { jsonWrite } from '../shared/storage';
import type { Metadata } from '../shared/types';
const require = createRequire(import.meta.url);
export const ffmpeg:string=process.env.FFMPEG_PATH || require('ffmpeg-static');
export const ffprobe:string=process.env.FFPROBE_PATH || require('ffprobe-static').path;
const exec=promisify(execFile);
export async function mediaExec(binary:string,args:string[]) { return exec(binary,args,{timeout:120_000,maxBuffer:8*1024*1024,windowsHide:true}); }
export async function preprocess(input:string,dir:string):Promise<Metadata> {
  const {stdout}=await mediaExec(ffprobe,['-v','error','-show_streams','-show_format','-of','json',input]);
  const info=JSON.parse(stdout); const video=info.streams.find((s:{codec_type:string})=>s.codec_type==='video');
  if(!video) throw new Error('参考文件没有有效的视频轨道');
  const duration=Number(info.format.duration); const [n,d]=String(video.avg_frame_rate).split('/').map(Number);
  if(!Number.isFinite(duration)||duration<1||duration>120) throw new Error('参考视频时长需为 1–120 秒');
  const metadata={duration,fps:d?n/d:0,width:Number(video.width),height:Number(video.height),frameCount:16};
  if(metadata.width>4096||metadata.height>4096) throw new Error('视频分辨率不能超过 4096 像素');
  await mkdir(path.join(dir,'frames'),{recursive:true});
  await mediaExec(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',input,'-vf',`fps=16/${duration},scale=480:480:force_original_aspect_ratio=decrease,pad=480:480:(ow-iw)/2:(oh-ih)/2`,'-frames:v','16','-q:v','3',path.join(dir,'frames','frame-%02d.jpg')]);
  await mediaExec(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',path.join(dir,'frames','frame-%02d.jpg'),'-vf','scale=240:240,tile=4x4','-frames:v','1',path.join(dir,'contact-sheet.jpg')]);
  await jsonWrite(path.join(dir,'metadata.json'),metadata); return metadata;
}
