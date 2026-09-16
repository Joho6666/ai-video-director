import path from 'node:path';
import { projectDir,saveTask,jsonWrite,readTask,acquireTaskLock } from '../shared/storage';
import type { Status,Task } from '../shared/types';
import { preprocess } from '../video-analysis';
import {produce} from './production';
import type { ProviderTask, ProviderInput, VideoGenerationProvider } from '../video-provider/legacy';
import { MockAgentAdapter } from './adapter';
import { DeepSeekDirectorAdapter } from './deepseek';
import { createExportPackage } from '../shared/exports';
import { resolveAppConfig } from '../shared/config';
const state=globalThis as typeof globalThis & {directorActive?:Set<string>};
export const active=state.directorActive??=new Set();
export async function getOrCreateProviderTask(provider:VideoGenerationProvider,input:ProviderInput,result:Task['results'][number]):Promise<ProviderTask>{
 if(result.providerTaskId)return {id:result.providerTaskId};
 const job=await provider.createTask(input);result.providerTaskId=job.id;return job;
}
export async function runTask(task:Task){
 const release=await acquireTaskLock(task.id);if(!release)return;
 active.add(task.id);
 const update=async(status:Status,message:string)=>{task.status=status;task.logs.push({time:new Date().toISOString(),message});await saveTask(task);};
 try{
  task=await readTask(task.id);delete task.error;
  if(task.status==='COMPLETED')return;
  if(task.provider==='seedance')throw new Error('Legacy Seedance task: production resume is not supported');
  if(!task.plan){
  await update('ANALYZING_REFERENCE','正在读取视频元数据并抽取参考帧');
  task.metadata=await preprocess(path.join(projectDir(task.id),task.assets.find(a=>a.kind==='reference')!.file),path.join(projectDir(task.id),'reference'));
  const config=resolveAppConfig();await jsonWrite(path.join(projectDir(task.id),'runtime.json'),{version:'0.5.0',app_mode:task.appMode,director:task.director,video_provider:task.provider,deepseek_model:task.director==='deepseek'?config.deepseekModel:null,minimax_model:task.provider==='minimax'?(process.env.MINIMAX_MODEL||'MiniMax-Hailuo-2.3'):null,frame_count:task.metadata.frameCount});
  await update('EXTRACTING_SHOT_DNA',task.director==='mock'?'读取 Director Skill；离线分析将视觉证据标为 Unknown':'DeepSeek 正在识别人物动作并提取 Shot DNA');
  const adapter=task.director==='mock'?new MockAgentAdapter():new DeepSeekDirectorAdapter();
  const result=await adapter.plan(task);const {plan,treatment}=result;
  await update('PLANNING_VARIANTS','校验导演输出、动作连续性和三个版本的结构差异');
  const unknown={status:'Unknown',description:'Mock mode does not perform visual analysis',frame_ids:[]};const mockEvidence=Object.fromEntries(['scene','shot_size','camera_height','camera_angle','camera_motion','subject_trajectory','action_sequence','gaze','head_movement','shoulder_movement','arm_motion','hand_action','body_weight','facial_expression','product_interaction','motion_continuity','lighting','rhythm','product_display_logic'].map(k=>[k,unknown]));
  const evidence='evidence' in result?result.evidence:mockEvidence;
  task.plan=plan;await jsonWrite(path.join(projectDir(task.id),'director-output.json'),treatment);await jsonWrite(path.join(projectDir(task.id),'reference-evidence.json'),evidence);if('requestMeta' in result)await jsonWrite(path.join(projectDir(task.id),'deepseek-request.json'),result.requestMeta);await jsonWrite(path.join(projectDir(task.id),'generation-plan.json'),plan);await createExportPackage(task,projectDir(task.id),{reference_evidence:evidence});await saveTask(task);
  }
  if(task.appMode==='director'){await update('COMPLETED','三套导演方案与创作包已就绪');return;}
  await update('PLANNING_VARIANTS','Director 完成，选择模型');
  await produce(task);
  const evidence=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(projectDir(task.id),'reference-evidence.json'),'utf8'));
  await createExportPackage(task,projectDir(task.id),{reference_evidence:evidence});
  if(task.results.some(r=>r.status==='failed'))throw new Error('部分版本生成失败；成功的视频仍可播放和下载');
  await update('COMPLETED','所选视频与创作包已就绪');
 }catch(e){task.error=e instanceof Error?e.message:'任务失败';await update('FAILED',task.error);}
 finally{active.delete(task.id);await release();}
}
export async function recoverTask(id:string){return readTask(id);}
