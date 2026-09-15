import path from 'node:path';
import { projectDir,saveTask,jsonWrite,readTask } from '../shared/storage';
import type { Status,Task } from '../shared/types';
import { preprocess } from '../video-analysis';
import { MockVideoGenerationProvider,SeedanceProvider } from '../video-provider';
import { MockAgentAdapter,PiAgentAdapter } from './adapter';
const state=globalThis as typeof globalThis & {directorActive?:Set<string>};
export const active=state.directorActive??=new Set();
export async function runTask(task:Task){
 active.add(task.id);
 const update=async(status:Status,message:string)=>{task.status=status;task.logs.push({time:new Date().toISOString(),message});await saveTask(task);};
 try{
  await update('ANALYZING_REFERENCE','正在读取视频元数据并抽取 16 帧');
  task.metadata=await preprocess(path.join(projectDir(task.id),task.assets.find(a=>a.kind==='reference')!.file),path.join(projectDir(task.id),'reference'));
  await update('EXTRACTING_SHOT_DNA',task.director==='mock'?'读取 Director Skill；离线分析将视觉证据标为 Unknown':'Pi 正在调用视觉模型与 Director Skill');
  const adapter=task.director==='mock'?new MockAgentAdapter():new PiAgentAdapter();
  const {plan,treatment}=await adapter.plan(task);
  await update('PLANNING_VARIANTS','校验导演输出、动作连续性和三个版本的结构差异');
  task.plan=plan;await jsonWrite(path.join(projectDir(task.id),'director-output.json'),treatment);await jsonWrite(path.join(projectDir(task.id),'generation-plan.json'),plan);await saveTask(task);
  const provider=task.provider==='mock'?new MockVideoGenerationProvider():new SeedanceProvider();
  for(const variant of plan.variants){
   const result=task.results.find(r=>r.id===variant.id)!;result.name=variant.name;result.status='generating';
   await update(`GENERATING_${variant.id}` as Status,`${variant.id} · ${task.provider==='mock'?'制作本地演示预览':'提交 Seedance 视频任务'}`);
   try{
    const job=await provider.createTask({taskId:task.id,variant,assets:task.assets});result.providerTaskId=job.id;await saveTask(task);
    const deadline=Date.now()+20*60_000;
    for(;;){const status=await provider.getTaskStatus(job.id);if(status==='succeeded')break;if(status==='failed')throw new Error('视频服务任务失败');if(Date.now()>deadline)throw new Error('轮询超时；已保存 Provider 任务 ID，请到服务端检查，避免重复计费');await new Promise(r=>setTimeout(r,5000));}
    result.url=(await provider.getResult(job.id)).url;result.status='completed';await saveTask(task);
   }catch(e){result.status='failed';result.error=e instanceof Error?e.message:'生成失败';await saveTask(task);}
  }
  if(task.results.some(r=>r.status==='failed'))throw new Error('部分版本生成失败；成功的视频仍可播放和下载');
  await update('COMPLETED','三个视频结果已就绪');
 }catch(e){task.error=e instanceof Error?e.message:'任务失败';await update('FAILED',task.error);}
 finally{active.delete(task.id);}
}
export async function recoverTask(id:string){
 const task=await readTask(id);
 if(!['COMPLETED','FAILED'].includes(task.status)&&!active.has(id)){
  task.status='FAILED';task.error='服务已重启，任务中断。已保存的视频及 Provider 任务 ID 保留；请检查远端任务后重新创建。';
  task.results.forEach(r=>{if(r.status==='generating')r.status='failed';});await saveTask(task);
 }
 return task;
}
