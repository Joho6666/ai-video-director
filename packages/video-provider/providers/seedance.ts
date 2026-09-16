import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {projectDir} from '../../shared/storage';
import type {ProviderInput,ProviderStatus,VideoGenerationProvider as LegacyProvider} from '../legacy';
type ArkTask={id?:string;status?:string;content?:{video_url?:string};error?:{message?:string}};
export class SeedanceProvider implements LegacyProvider {
  constructor(private config={key:process.env.SEEDANCE_API_KEY||'',base:process.env.SEEDANCE_BASE_URL||'https://ark.cn-beijing.volces.com/api/v3',model:process.env.SEEDANCE_MODEL||''}) {
    if(!config.key||!config.model) throw new Error('请配置 SEEDANCE_API_KEY 和 SEEDANCE_MODEL');
  }
  private async request(endpoint:string,body?:unknown):Promise<ArkTask>{
    const response=await fetch(this.config.base.replace(/\/$/,'')+endpoint,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.config.key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60_000)});
    if(!response.ok) throw new Error(`Seedance HTTP ${response.status}；请检查模型权限、额度和输入规格`);
    return response.json();
  }
  async createTask(input:ProviderInput){
    const images=input.assets.filter(a=>a.kind!=='reference');
    if(images.length>9)throw new Error('Seedance 参考图最多 9 张');
    const content:unknown[]=[{type:'text',text:`${input.variant.seedance_prompt}\nAvoid: ${input.variant.negative_prompt}`}];
    for(const asset of images){const data=await readFile(path.join(projectDir(input.taskId),asset.file));content.push({type:'image_url',image_url:{url:`data:${asset.mime};base64,${data.toString('base64')}`},role:'reference_image'});}
    const task=await this.request('/contents/generations/tasks',{model:this.config.model,content,duration:8,ratio:'9:16',watermark:true});
    if(!task.id) throw new Error('Seedance response did not contain task ID');return {id:task.id};
  }
  async getTaskStatus(id:string):Promise<ProviderStatus>{
    const task=await this.request('/contents/generations/tasks/'+encodeURIComponent(id));
    if(task.status==='succeeded')return 'succeeded';
    if(['failed','cancelled','expired'].includes(task.status||''))return 'failed';
    if(task.status==='queued')return 'queued';
    if(task.status==='running')return 'running';
    throw new Error('Seedance 返回未知任务状态');
  }
  async getResult(id:string){const task=await this.request('/contents/generations/tasks/'+encodeURIComponent(id));const url=task.content?.video_url;
    if(task.status!=='succeeded'||!url||!/^https:\/\//.test(url))throw new Error('Seedance 视频结果不可用');return {url};}
}
