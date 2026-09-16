import { NextRequest,NextResponse,after } from 'next/server';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { active,runTask } from '@/packages/agent/runner';
import { projectDir,saveTask } from '@/packages/shared/storage';
import type { Task } from '@/packages/shared/types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'跨域请求不受支持'},{status:403});
 if(active.size)return NextResponse.json({error:'已有任务运行中，请等待完成'},{status:409});
 if(Number(req.headers.get('content-length')||0)>150*1024*1024)return NextResponse.json({error:'上传总大小不能超过 150 MB'},{status:413});
 const reservation=randomUUID();active.add(reservation);
 try{
  const form=await req.formData();const reference=form.get('referenceVideo');const requirement=String(form.get('requirement')||'').trim();
  if(!(reference instanceof File)||!reference.size||! /\.(mp4|mov)$/i.test(reference.name))throw new Error('请上传 MP4 / MOV 参考视频');
  if(reference.size>100*1024*1024)throw new Error('参考视频不能超过 100 MB');
  if(!requirement||requirement.length>5000)throw new Error('创作要求需为 1–5000 字');
  const models=form.getAll('modelImages');const products=form.getAll('productImages');
  if(models.length+products.length>9)throw new Error('模特和商品图片合计最多 9 张');
  const images=[...models,...products];
  for(const file of images)if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024||file.size===0)throw new Error('图片需为 JPG / PNG / WebP，单张不超过 10 MB');
  const provider=process.env.VIDEO_PROVIDER||'mock';const director=process.env.DIRECTOR_MODE||'mock';
  if(!['mock','seedance'].includes(provider)||!['mock','deepseek'].includes(director))throw new Error(director==='pi'?'DIRECTOR_MODE=pi 已停用，请改为 deepseek':'服务配置模式无效');
  if(provider==='seedance'&&director!=='deepseek')throw new Error('真实 Seedance 生成必须启用 DeepSeek Director，不能提交 Mock 创意');
  if(provider==='seedance'&&(!process.env.SEEDANCE_API_KEY||!process.env.SEEDANCE_MODEL))throw new Error('缺少 Seedance Key 或模型配置');
  if(director==='deepseek'&&!process.env.DEEPSEEK_API_KEY)throw new Error('缺少 DEEPSEEK_API_KEY');
  const id=randomUUID();const task:Task={id,project_id:id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),requirement,assets:[],status:'UPLOADED',provider:provider as Task['provider'],director:director as Task['director'],logs:[{time:new Date().toISOString(),message:'素材已保存'}],results:['V1','V2','V3'].map((id,i)=>({id,name:['轻奢时尚','都市通勤','活力街拍'][i],status:'waiting'}))};
  await mkdir(path.join(projectDir(id),'uploads'),{recursive:true});
  const files=[{file:reference,kind:'reference' as const},...models.map(file=>({file:file as File,kind:'model' as const})),...products.map(file=>({file:file as File,kind:'product' as const}))];
  for(const {file,kind} of files){const ext=kind==='reference'?path.extname(file.name).toLowerCase():({'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[file.type]||'.jpg');const relative=`uploads/${randomUUID()}${ext}`;await writeFile(path.join(projectDir(id),relative),Buffer.from(await file.arrayBuffer()));task.assets.push({name:file.name,file:relative,mime:file.type,kind});}
  await saveTask(task);active.add(id);after(()=>runTask(task));return NextResponse.json(task,{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'上传失败'},{status:400});}
 finally{active.delete(reservation);}
}
