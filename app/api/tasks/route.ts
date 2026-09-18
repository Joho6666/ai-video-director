import { NextRequest,NextResponse,after } from 'next/server';
import { mkdir,writeFile,readdir,stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { active,runTask,startPendingTaskRecovery } from '@/packages/agent/runner';
import { dataRoot,jsonWrite,projectDir,readTask,reserveIdempotency,saveTask } from '@/packages/shared/storage';
import {selectionSchema} from '@/packages/agent/production';
import type { Task } from '@/packages/shared/types';
import { resolveAppConfig } from '@/packages/shared/config';
import { customerErrorMessage } from '@/packages/shared/errors';
export const runtime='nodejs';
export const dynamic='force-dynamic';
startPendingTaskRecovery();

/**
 * In local development Next may normalize the request URL to `localhost`
 * while the browser is using `127.0.0.1` (or vice versa). Both names resolve
 * to the same local service, so treat them as equivalent for the CSRF origin
 * check. Keep the exact-origin check for every non-local request.
 */
function isAllowedOrigin(req: NextRequest): boolean {
 const origin = req.headers.get('origin');
 if (!origin) return true;
 try {
  const originUrl = new URL(origin);
  const requestUrl = new URL(req.nextUrl.origin);
  if (originUrl.origin === requestUrl.origin) return true;
  const localHosts = new Set(['localhost','127.0.0.1','[::1]','::1']);
  return originUrl.protocol === requestUrl.protocol
   && originUrl.port === requestUrl.port
   && localHosts.has(originUrl.hostname)
   && localHosts.has(requestUrl.hostname);
 } catch {
  return false;
 }
}

export async function POST(req:NextRequest){
 if(!isAllowedOrigin(req))return NextResponse.json({error:'跨域请求不受支持'},{status:403});
 if(Number(req.headers.get('content-length')||0)>150*1024*1024)return NextResponse.json({error:'上传总大小不能超过 150 MB'},{status:413});
 try{
  const form=await req.formData();const reference=form.get('referenceVideo');const requirement=String(form.get('requirement')||'').trim();
  if(!(reference instanceof File)||!reference.size||! /\.(mp4|mov)$/i.test(reference.name))throw new Error('请上传 MP4 / MOV 参考视频');
  if(reference.size>100*1024*1024)throw new Error('参考视频不能超过 100 MB');
  if(!requirement||requirement.length>5000)throw new Error('创作要求需为 1–5000 字');
  const models=form.getAll('modelImages');const products=form.getAll('productImages');
  if(models.length<1||products.length<1)throw new Error('请至少上传一张模特图和一张商品图');
  if(models.length+products.length>9)throw new Error('模特和商品图片合计最多 9 张');
  const firstFrame=form.get('firstFrameImage');
  const selectedVariants=selectionSchema.parse(JSON.parse(String(form.get('selectedVariants')||'["V1"]')));
  const taskType=String(form.get('taskType')||'ecommerce');if(!['fashion','ecommerce'].includes(taskType))throw new Error('Unsupported task type');
  const images=[...models,...products,...(firstFrame instanceof File&&firstFrame.size?[firstFrame]:[])];
  for(const file of images)if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024||file.size===0)throw new Error('图片需为 JPG / PNG / WebP，单张不超过 10 MB');
  const config=resolveAppConfig();const id=randomUUID();const idempotencyKey=req.headers.get('idempotency-key')||randomUUID();
  const incoming=[{file:reference,kind:'reference' as const},...models.map(file=>({file:file as File,kind:'model' as const})),...products.map(file=>({file:file as File,kind:'product' as const})),...(firstFrame instanceof File&&firstFrame.size?[{file:firstFrame,kind:'first_frame' as const}]:[])];
  const buffered=await Promise.all(incoming.map(async item=>({...item,data:Buffer.from(await item.file.arrayBuffer())})));
  const fingerprint=createHash('sha256').update(requirement).update(config.appMode).update(JSON.stringify({selectedVariants,taskType,provider:'auto',model:config.videoProvider})).update(buffered.map(x=>createHash('sha256').update(x.data).digest('hex')).join(':')).digest('hex');
  const reservation=await reserveIdempotency(idempotencyKey,fingerprint,id);if(reservation.existing){try{return NextResponse.json(await readTask(reservation.id));}catch{return NextResponse.json({error:'已有幂等任务记录但任务文件不可用，请更换 Idempotency-Key'},{status:409});}}
  const task:Task={taskType:taskType as "fashion"|"ecommerce",selectedVariants,id,project_id:id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),requirement,assets:[],status:'UPLOADED',appMode:config.appMode,provider:config.videoProvider,director:config.director,idempotencyKey,logs:[{time:new Date().toISOString(),message:'素材已保存'}],results:config.appMode==='director'?[]:selectedVariants.map((resultId,i)=>({id:resultId,name:['轻奢时尚','都市通勤','活力街拍'][i],status:'waiting'}))};
  await mkdir(path.join(projectDir(id),'uploads'),{recursive:true});
  for(const {file,kind,data} of buffered){const ext=kind==='reference'?path.extname(file.name).toLowerCase():({'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[file.type]||'.jpg');const relative=`uploads/${randomUUID()}${ext}`;await writeFile(path.join(projectDir(id),relative),data);task.assets.push({name:file.name,file:relative,mime:file.type,kind});}
  await jsonWrite(path.join(projectDir(id),'runtime.json'),{version:'1.3.0',app_mode:task.appMode,director:task.director,video_provider:task.provider,deepseek_model:task.director==='deepseek'?config.deepseekModel:null,minimax_model:task.provider==='minimax'?(process.env.MINIMAX_MODEL||'MiniMax-Hailuo-2.3'):null,wan_model:task.provider==='wan'?(process.env.WAN_MODEL||'wanx2.1-i2v-plus'):null,frame_count:null});
  await saveTask(task);active.add(id);after(()=>runTask(task));return NextResponse.json(task,{status:201});
 }catch(e){return NextResponse.json({error:customerErrorMessage(e)},{status:400});}
}

export async function GET(){
 try{
  const entries = await readdir(dataRoot,{withFileTypes:true});
  const ids = entries.filter(e=>e.isDirectory()&&/^[a-f0-9-]{36}$/.test(e.name)).map(e=>e.name);
  if(!ids.length)return NextResponse.json({latest:null,tasks:[]});
  const tasksWithTime = await Promise.all(
   ids.map(async id=>{
    try{
     const s=await stat(path.join(dataRoot,id,'task.json'));
     return {id,mtime:s.mtimeMs};
    }catch{return null;}
   })
  );
  const sorted = tasksWithTime.filter((t):t is {id:string;mtime:number}=>t!==null).sort((a,b)=>b.mtime-a.mtime).slice(0,5);
  const tasks=(await Promise.all(sorted.map(async item=>{try{const task=await readTask(item.id);const appMode=task.appMode||(task.director==='mock'?'mock':task.provider==='seedance'?'full':'director');return {id:task.id,createdAt:task.createdAt,updatedAt:task.updatedAt,appMode,status:task.status};}catch{return null;}}))).filter((item):item is NonNullable<typeof item>=>item!==null);
  return NextResponse.json({latest:tasks[0]?.id||null,tasks});
 }catch{return NextResponse.json({latest:null,tasks:[]});}
}
