import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {projectDir} from '../../shared/storage';
import type {Capabilities,GenerationStatus,VideoGenerationProvider,VideoGenerationRequest} from '../types';

// Verified against platform.minimax.cn/docs/api-reference/video-generation-i2v,
// video-generation-query and video-generation-download on 2026-09-16.
export const MINIMAX_MODEL='MiniMax-Hailuo-2.3';
export const MINIMAX_CAPABILITIES:Capabilities={modes:['image-to-video'],durations:[6],resolution:'1080P',aspectRatio:'9:16',maxPrompt:2000,inputPolicy:{firstFrame:'required',referenceImages:'unsupported',referenceVideo:'unsupported'}};
type ResponseBody={task_id?:string;status?:string;file_id?:string;file?:{download_url?:string};base_resp?:{status_code:number}};
export class MiniMaxProvider implements VideoGenerationProvider {
 readonly name='minimax' as const;
 readonly capabilities=MINIMAX_CAPABILITIES;
 constructor(private config={key:process.env.MINIMAX_API_KEY||'',base:process.env.MINIMAX_BASE_URL||'https://api.minimax.cn',model:process.env.MINIMAX_MODEL||MINIMAX_MODEL},private transport:typeof fetch=fetch){
  if(!config.key)throw new Error('UNAVAILABLE: MINIMAX_API_KEY missing');
  if(config.model!==MINIMAX_MODEL)throw new Error('MiniMax model capability not verified');
  if(!['https://api.minimax.cn','https://api.minimax.io','https://api.minimaxi.com'].includes(config.base.replace(/\/$/,'')))throw new Error('MiniMax base URL must be an official HTTPS endpoint');
 }
 private async request(endpoint:string,body?:unknown):Promise<ResponseBody>{
  let response:Response;
  try{response=await this.transport(this.config.base.replace(/\/$/,'')+endpoint,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.config.key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60_000),redirect:'error'});}catch{throw new Error(body?'MiniMax submission outcome unknown; manual verification required; no resubmission':'MiniMax query connection failed');}
  if(!response.ok)throw new Error(`MiniMax HTTP ${response.status}`);
  const data=await response.json() as ResponseBody;
  if(data.base_resp?.status_code!==0)throw new Error(`MiniMax business error ${data.base_resp?.status_code??'missing status'}`);
  return data;
 }
 async createTask(input:VideoGenerationRequest){
  if(input.model!==this.config.model||input.duration!==6||input.resolution!=='1080P'||input.aspect_ratio!=='9:16'||input.mode!=='image-to-video')throw new Error('MiniMax capability mismatch');
  if(!input.firstFrame||!/^production\/first-frame\.jpg$/.test(input.firstFrame.file))throw new Error('MiniMax requires a prepared first frame');
  if(!input.prompt.trim()||input.prompt.length>2000)throw new Error('MiniMax prompt length invalid');
  const data=await readFile(path.join(projectDir(input.taskId),input.firstFrame.file));
  if(data.length>=20*1024*1024)throw new Error('MiniMax first frame exceeds 20 MB');
  const result=await this.request('/v1/video_generation',{model:input.model,prompt:input.prompt,first_frame_image:`data:image/jpeg;base64,${data.toString('base64')}`,duration:input.duration,resolution:input.resolution,prompt_optimizer:false});
  if(!result.task_id)throw new Error('MiniMax submission outcome unknown: missing task_id; manual verification required');
  return {id:result.task_id};
 }
 private query(id:string){return this.request('/v1/query/video_generation?task_id='+encodeURIComponent(id));}
 async getTaskStatus(id:string):Promise<GenerationStatus>{
  const result=await this.query(id);const states:Record<string,GenerationStatus>={Preparing:'SUBMITTED',Queueing:'SUBMITTED',Processing:'PROCESSING',Success:'COMPLETED',Fail:'FAILED'};
  const state=states[result.status||''];if(!state)throw new Error('MiniMax unknown task status');return state;
 }
 async getResult(id:string){
  const task=await this.query(id);if(task.status!=='Success'||!task.file_id)throw new Error('MiniMax video result not ready');
  const data=await this.request('/v1/files/retrieve?file_id='+encodeURIComponent(task.file_id));const url=data.file?.download_url;
  if(!url||new URL(url).protocol!=='https:')throw new Error('MiniMax missing HTTPS download URL');return {url,fileId:task.file_id};
 }
}
