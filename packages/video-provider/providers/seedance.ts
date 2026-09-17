import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {projectDir} from '../../shared/storage';
import type {Capabilities,GenerationStatus,VideoGenerationProvider,VideoGenerationRequest} from '../types';

export const SEEDANCE_MODEL='seedance-2.0';
export const SEEDANCE_CAPABILITIES:Capabilities={modes:['image-to-video'],durations:[8],resolution:'1080P',aspectRatio:'9:16',maxPrompt:2400};

type ArkTask={id?:string;status?:string;content?:{video_url?:string};error?:{message?:string}};

export class SeedanceProvider implements VideoGenerationProvider {
  readonly name='seedance' as const;
  readonly capabilities=SEEDANCE_CAPABILITIES;
  constructor(private config={key:process.env.SEEDANCE_API_KEY||'',base:process.env.SEEDANCE_BASE_URL||'https://ark.cn-beijing.volces.com/api/v3',model:process.env.SEEDANCE_MODEL||SEEDANCE_MODEL}) {
    if(!config.key||!config.model) throw new Error('UNAVAILABLE: SEEDANCE_API_KEY or SEEDANCE_MODEL missing');
  }
  private async request(endpoint:string,body?:unknown):Promise<ArkTask>{
    const response=await fetch(this.config.base.replace(/\/$/,'')+endpoint,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.config.key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60_000)});
    if(!response.ok) throw new Error(`Seedance HTTP ${response.status}`);
    return response.json();
  }
  async createTask(input:VideoGenerationRequest){
    const content:unknown[]=[{type:'text',text:input.prompt}];
    if(input.firstFrame){
      const data=await readFile(path.join(projectDir(input.taskId),input.firstFrame.file));
      content.push({type:'image_url',image_url:{url:`data:image/jpeg;base64,${data.toString('base64')}`},role:'reference_image'});
    }
    const task=await this.request('/contents/generations/tasks',{model:this.config.model,content,duration:input.duration,ratio:'9:16',watermark:false});
    if(!task.id) throw new Error('Seedance response did not contain task ID');
    return {id:task.id};
  }
  async getTaskStatus(id:string):Promise<GenerationStatus>{
    const task=await this.request('/contents/generations/tasks/'+encodeURIComponent(id));
    if(task.status==='succeeded')return 'COMPLETED';
    if(['failed','cancelled','expired'].includes(task.status||''))return 'FAILED';
    if(task.status==='queued')return 'SUBMITTED';
    if(task.status==='running')return 'PROCESSING';
    throw new Error('Seedance unknown task status');
  }
  async getResult(id:string){
    const task=await this.request('/contents/generations/tasks/'+encodeURIComponent(id));
    const url=task.content?.video_url;
    if(task.status!=='succeeded'||!url||!/^https:\/\//.test(url))throw new Error('Seedance result not ready');
    return {url,fileId:id};
  }
}
