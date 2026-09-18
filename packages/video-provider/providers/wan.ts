import {readFile} from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns';
import {projectDir} from '../../shared/storage';
import type {Capabilities,GenerationStatus,VideoGenerationProvider,VideoGenerationRequest} from '../types';

if (typeof dns.setDefaultResultOrder === 'function') {
 dns.setDefaultResultOrder('ipv4first');
}

// Verified against DashScope video-generation API (wanx2.1-i2v-plus)
export const WAN_MODEL='wanx2.1-i2v-plus';
export const WAN_CAPABILITIES:Capabilities={modes:['image-to-video'],durations:[5],resolution:'720P',aspectRatio:'9:16',maxPrompt:2000};

type DashscopeTaskOutput = {
 task_id?: string;
 task_status?: string;
 submit_time?: string;
 scheduled_time?: string;
 end_time?: string;
 video_url?: string;
 code?: string;
 message?: string;
};

type DashscopeResponseBody = {
 request_id?: string;
 output?: DashscopeTaskOutput;
 code?: string;
 message?: string;
};

export class WanProvider implements VideoGenerationProvider {
 readonly name='wan' as const;
 readonly capabilities=WAN_CAPABILITIES;
 constructor(private config={key:process.env.WAN_API_KEY||process.env.DASHSCOPE_API_KEY||'',base:process.env.WAN_BASE_URL||'https://dashscope.aliyuncs.com',model:process.env.WAN_MODEL||WAN_MODEL},private transport:typeof fetch=fetch){
  if(!config.key)throw new Error('UNAVAILABLE: WAN_API_KEY missing');
  if(config.model!==WAN_MODEL)throw new Error('Wan model capability not verified');
  const normalizedBase=config.base.replace(/\/$/,'');
  if(!['https://dashscope.aliyuncs.com','https://dashscope-intl.aliyuncs.com'].includes(normalizedBase)){
   throw new Error('Wan base URL must be an official DashScope HTTPS endpoint');
  }
 }
 private async request(endpoint:string,body?:unknown,isSubmit=false):Promise<DashscopeResponseBody>{
  const headers:Record<string,string>={
   Authorization:`Bearer ${this.config.key}`,
   'Content-Type':'application/json'
  };
  if(isSubmit){
   headers['X-DashScope-Async']='enable';
  }
  // A generation submission is deliberately single shot: a timeout leaves
  // the durable submission intent in place and must never be retried. Status
  // reads are different: retrying a GET is safe because it cannot create a
  // second paid task, and DashScope occasionally drops a long-poll request.
  const attempts=isSubmit?1:5;
  for(let attempt=0;attempt<attempts;attempt++){
   try{
    const response=await this.transport(this.config.base.replace(/\/$/,'')+endpoint,{
     method:body?'POST':'GET',
     headers,
     body:body?JSON.stringify(body):undefined,
     signal:AbortSignal.timeout(120_000),
     redirect:'error'
    });
    if(!response.ok)throw new Error(`Wan HTTP ${response.status}`);
    const data=await response.json() as DashscopeResponseBody;
    if(data.code&&data.code!=='200'&&data.code!=='Success'){
     throw new Error(`Wan business error ${data.code}: ${data.message||'unknown'}`);
    }
    return data;
   }catch(error){
    if(attempt+1<attempts){await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));continue;}
    if(error instanceof Error && (error.message.startsWith('Wan HTTP ')||error.message.startsWith('Wan business error ')))throw error;
    const detail=error instanceof Error?error.message:String(error);
    throw new Error(body?'Wan submission outcome unknown; manual verification required; no resubmission':`Wan query connection failed: ${detail}`);
   }
  }
  throw new Error('Wan query connection failed');
 }
 async createTask(input:VideoGenerationRequest){
  if(input.model!==this.config.model||input.duration!==5||input.resolution!=='720P'||input.aspect_ratio!=='9:16'||input.mode!=='image-to-video')throw new Error('Wan capability mismatch');
  if(!input.firstFrame||!/^production\/first-frame\.jpg$/.test(input.firstFrame.file))throw new Error('Wan requires a prepared first frame');
  if(!input.prompt.trim()||input.prompt.length>2000)throw new Error('Wan prompt length invalid');
  const data=await readFile(path.join(projectDir(input.taskId),input.firstFrame.file));
  if(data.length>=20*1024*1024)throw new Error('Wan first frame exceeds 20 MB');
  const payload={
   model:input.model,
   input:{
    prompt:input.prompt,
    img_url:`data:image/jpeg;base64,${data.toString('base64')}`
   },
   parameters:{
    size:'720*1280',
    duration:input.duration
   }
  };
  const result=await this.request('/api/v1/services/aigc/video-generation/video-synthesis',payload,true);
  const taskId=result.output?.task_id;
  if(!taskId)throw new Error('Wan submission outcome unknown: missing task_id; manual verification required');
  return {id:taskId};
 }
 private query(id:string){return this.request('/api/v1/tasks/'+encodeURIComponent(id),undefined,false);}
 async getTaskStatus(id:string):Promise<GenerationStatus>{
  const result=await this.query(id);
  const rawStatus=result.output?.task_status;
  const states:Record<string,GenerationStatus>={
   PENDING:'SUBMITTED',
   RUNNING:'PROCESSING',
   SUCCEEDED:'COMPLETED',
   FAILED:'FAILED',
   CANCELED:'FAILED',
   UNKNOWN:'FAILED'
  };
  const state=states[rawStatus||''];
  if(!state)throw new Error('Wan unknown task status');
  return state;
 }
 async getResult(id:string){
  const task=await this.query(id);
  if(task.output?.task_status!=='SUCCEEDED'||!task.output?.video_url)throw new Error('Wan video result not ready');
  const url=task.output.video_url;
  if(!url||new URL(url).protocol!=='https:')throw new Error('Wan missing HTTPS download URL');
  return {url,fileId:id};
 }
}
