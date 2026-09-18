import {mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {mediaExec,ffmpeg} from '../../video-analysis';
import {projectDir,readTask,mediaUrl} from '../../shared/storage';
import type {VideoGenerationProvider,VideoGenerationRequest,GenerationStatus,Capabilities} from '../types';
export class MockProvider implements VideoGenerationProvider {
 readonly name='mock' as const;
 readonly capabilities:Capabilities={modes:['image-to-video'],durations:[8],resolution:'640P',aspectRatio:'9:16',maxPrompt:2000,inputPolicy:{firstFrame:'optional',referenceImages:'unsupported',referenceVideo:'unsupported'}};
 private parse(id:string){const m=/^mock:([a-f0-9-]{36}):(V[123])$/.exec(id);if(!m)throw new Error('Invalid Mock task ID');return {task:m[1],variant:m[2]};}
 async createTask(input:VideoGenerationRequest){
  const root=projectDir(input.taskId);const task=await readTask(input.taskId);const source=task.assets.find(a=>a.kind==='reference');if(!source)throw new Error('Mock reference missing');
  await mkdir(path.join(root,'results'),{recursive:true});
  await mediaExec(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',path.join(root,source.file),'-t',String(input.duration),'-an','-vf','scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,`results/${input.variantId}.mp4`)]);
  return {id:`mock:${input.taskId}:${input.variantId}`};
 }
 async getTaskStatus(id:string):Promise<GenerationStatus>{const p=this.parse(id);return await stat(path.join(projectDir(p.task),`results/${p.variant}.mp4`)).then(s=>s.size>0?'COMPLETED' as const:'FAILED' as const).catch(()=>'FAILED' as const);}
 async getResult(id:string){const p=this.parse(id);if(await this.getTaskStatus(id)!=='COMPLETED')throw new Error('Mock result missing');return {url:mediaUrl(p.task,`results/${p.variant}.mp4`)};}
}
