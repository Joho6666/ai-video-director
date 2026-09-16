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
export function frameCountForDuration(duration:number){return duration<=10?16:duration<=20?24:32;}
export async function preprocess(input:string,dir:string):Promise<Metadata> {
  const {stdout}=await mediaExec(ffprobe,['-v','error','-show_streams','-show_format','-of','json',input]);
  const info=JSON.parse(stdout); const video=info.streams.find((s:{codec_type:string})=>s.codec_type==='video');
  if(!video) throw new Error('参考文件没有有效的视频轨道');
  const duration=Number(info.format.duration); const [n,d]=String(video.avg_frame_rate).split('/').map(Number);
  if(!Number.isFinite(duration)||duration<1||duration>120) throw new Error('参考视频时长需为 1–120 秒');
  const frameCount=frameCountForDuration(duration);const metadata={duration,fps:d?n/d:0,width:Number(video.width),height:Number(video.height),frameCount};
  if(metadata.width>4096||metadata.height>4096) throw new Error('视频分辨率不能超过 4096 像素');
  await mkdir(path.join(dir,'frames'),{recursive:true});
  await mediaExec(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',input,'-vf',`fps=${frameCount}/${duration},scale=480:480:force_original_aspect_ratio=decrease,pad=480:480:(ow-iw)/2:(oh-ih)/2`,'-frames:v',String(frameCount),'-q:v','3',path.join(dir,'frames','frame-%02d.jpg')]);
  const columns=frameCount===16?4:frameCount===24?6:8;await mediaExec(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',path.join(dir,'frames','frame-%02d.jpg'),'-vf',`scale=200:200,tile=${columns}x4`,'-frames:v','1',path.join(dir,'contact-sheet.jpg')]);
  const frames=Array.from({length:frameCount},(_,i)=>({id:`frame_${String(i+1).padStart(2,'0')}`,file:`frames/frame-${String(i+1).padStart(2,'0')}.jpg`,timestamp:Number((duration*i/frameCount).toFixed(3)),order:i+1}));
  await jsonWrite(path.join(dir,'frames.json'),frames);
  await jsonWrite(path.join(dir,'metadata.json'),metadata); return metadata;
}
