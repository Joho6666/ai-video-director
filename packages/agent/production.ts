import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {z} from 'zod';
import type {Task,Variant} from '../shared/types';
import {projectDir,jsonWrite,saveTask,mediaUrl} from '../shared/storage';
import {ffmpeg,ffprobe,mediaExec} from '../video-analysis';
import {routeProvider,resolveVideoRoute} from '../video-provider/router';
import type {GenerationTask,VideoGenerationProvider,VideoGenerationRequest} from '../video-provider/types';

export const selectionSchema=z.array(z.enum(['V1','V2','V3'])).min(1).max(3).refine(ids=>new Set(ids).size===ids.length,'Duplicate variant selection');
const generationRequestSchema=z.object({
 taskId:z.string().min(1),variantId:z.enum(['V1','V2','V3']),model:z.string().min(1),mode:z.literal('image-to-video'),prompt:z.string().min(1),duration:z.number().positive(),aspect_ratio:z.literal('9:16'),quality:z.literal('high'),resolution:z.string().min(1),
 firstFrame:z.object({id:z.string().min(1),file:z.string().min(1),sha256:z.string().regex(/^[a-f0-9]{64}$/i)}).strict().optional(),
}).strict();
export const generationTaskSchema=z.object({
 id:z.string().min(1),variantId:z.enum(['V1','V2','V3']),provider:z.enum(['mock','minimax','seedance','wan','veo']),model:z.string().min(1),task_id:z.string().min(1).optional(),status:z.enum(['PENDING','SUBMITTED','PROCESSING','COMPLETED','FAILED','MANUAL_VERIFICATION_REQUIRED']),created_at:z.string().min(1),updated_at:z.string().min(1),submission_started_at:z.string().min(1).optional(),result_url:z.string().min(1).optional(),error:z.string().min(1).optional(),request:generationRequestSchema,attempt:z.number().int().min(0).max(2).optional(),previous_attempt_id:z.string().min(1).optional(),quality_passed:z.boolean().optional(),
}).strict();
export const generationTasksSchema=z.array(generationTaskSchema);
export function validateGenerationTasks(taskId:string,value:unknown):GenerationTask[]{
 const jobs=generationTasksSchema.parse(value) as GenerationTask[];const ids=new Set<string>();const attempts=new Map<string,Set<number>>();
 for(const job of jobs){
  if(ids.has(job.id))throw new Error(`Duplicate generation attempt id: ${job.id}`);ids.add(job.id);
  if(job.request.taskId!==taskId||job.request.variantId!==job.variantId)throw new Error('Persisted generation task does not belong to its task');
  const attempt=job.attempt??0;const seen=attempts.get(job.variantId)??new Set<number>();if(seen.has(attempt))throw new Error(`Duplicate generation attempt for ${job.variantId}: ${attempt}`);seen.add(attempt);attempts.set(job.variantId,seen);
 }
 return jobs;
}
export async function loadGenerationTasks(task:Task):Promise<GenerationTask[]>{
 const file=path.join(projectDir(task.id),'generation-tasks.json');
 try{
  const ledger=validateGenerationTasks(task.id,JSON.parse(await readFile(file,'utf8')));
  if(task.generationTasks!==undefined){
   const embedded=validateGenerationTasks(task.id,task.generationTasks);
   const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):value;
   const canonical=(jobs:GenerationTask[])=>jobs.map(job=>JSON.stringify(stable(job))).sort();
   if(JSON.stringify(canonical(embedded))!==JSON.stringify(canonical(ledger)))throw new Error('Persisted generation ledger disagrees with task.json; refusing ambiguous recovery');
  }
  return ledger;
 }
 catch(error){
  if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
  const productionStarted=Boolean(task.generationTasks?.length)||task.results.some(result=>result.status!=='waiting'||result.providerTaskId)||['GENERATING','REVIEWING','RETRYING','COMPLETED'].includes(task.status);
  if(productionStarted)throw new Error('generation-tasks.json missing after production started; refusing to recreate paid attempts');
  return [];
 }
}
export function productionPrompt(variant:Variant,duration:number){
 const total=variant.timeline.reduce((sum,b)=>sum+b.duration,0);if(!total)throw new Error('Empty timeline');let elapsed=0;
 const timeline=variant.timeline.map((beat,i)=>{const start=elapsed;elapsed=i===variant.timeline.length-1?duration:Number((elapsed+beat.duration/total*duration).toFixed(3));return {...beat,duration:elapsed-start,time_range:`${start}-${elapsed}s`};});
 const prompt=`${duration}-second vertical commercial. Preserve the person and product in the supplied first frame. `+timeline.map(b=>`${b.time_range}: ${b.transition}; camera: ${(b as Record<string,unknown>).camera_state||'steady'}; end: ${b.end_state}.`).join(' ');
 const details=` Performance: ${Object.values(variant.performance).join('; ')}.`;
 if(prompt.length>2000)throw new Error('Production core prompt exceeds provider limit');
 return {prompt:prompt.length+details.length<=2000?prompt+details:prompt,timeline};
}
export async function prepareFirstFrame(task:Task){
 const asset=task.assets.find(a=>a.kind==='first_frame');
 const reference=task.assets.find(a=>a.kind==='reference');
 const source=asset||reference;
 if(!source)throw new Error('Full mode requires a reference video or first-frame image');
 const root=projectDir(task.id);await mkdir(path.join(root,'production'),{recursive:true});const file='production/first-frame.jpg';
 // A dedicated first frame takes precedence. If omitted, derive one from the
 // reference video so video + reference images can start production directly.
 await mediaExec(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',path.join(root,source.file),'-vf','scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2','-frames:v','1','-q:v','3',path.join(root,file)]);
 const bytes=await readFile(path.join(root,file));return {id:'first_frame_01',file,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function validateVideo(file:string,duration:number){
 if((await stat(file)).size===0)throw new Error('Video file empty');
 const {stdout}=await mediaExec(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file]);const info=JSON.parse(stdout);const video=info.streams?.find((s:{codec_type:string})=>s.codec_type==='video');
 if(!video||!Number.isFinite(Number(info.format?.duration))||Math.abs(Number(info.format.duration)-duration)>0.6||Math.abs(video.width/video.height-9/16)>0.03)throw new Error('Downloaded video duration/aspect/stream invalid');
}
export async function downloadVideo(url:string,target:string,duration:number,transport:typeof fetch=fetch){
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hostname==='localhost'||/^(127\.|10\.|192\.168\.|169\.254\.|\[)/.test(parsed.hostname))throw new Error('Unsafe video download URL');
 const response=await transport(url,{signal:AbortSignal.timeout(120_000),redirect:'error'});if(!response.ok||!response.body)throw new Error(`Video download HTTP ${response.status}`);
 const max=150*1024*1024;if(Number(response.headers.get('content-length'))>max)throw new Error('Video download exceeds size limit');
 const parts:Uint8Array[]=[];let size=0;for await(const part of response.body as unknown as AsyncIterable<Uint8Array>){size+=part.length;if(size>max)throw new Error('Video download exceeds size limit');parts.push(part);}
 await mkdir(path.dirname(target),{recursive:true});const temp=target+'.partial';await writeFile(temp,Buffer.concat(parts));await validateVideo(temp,duration);await rename(temp,target);
}
export async function executeGeneration(job:GenerationTask,provider:VideoGenerationProvider,persist:()=>Promise<void>,finish:(url:string)=>Promise<string>,options={pollMs:5000,timeoutMs:20*60_000}){
 if(job.status==='COMPLETED')return;
 // A durable intent with no remote ID has an ambiguous submission outcome.
 if(job.provider!==provider.name)throw new Error('Saved provider differs; refusing to reroute');
 if(!job.task_id&&job.submission_started_at){job.status='MANUAL_VERIFICATION_REQUIRED';await persist();throw new Error('Submission outcome unknown; manual verification required; no resubmission');}
 if(!job.task_id){job.submission_started_at=new Date().toISOString();await persist();try{const remote=await provider.createTask(job.request);if(!remote.id)throw new Error('Missing remote task ID');job.task_id=remote.id;job.status='SUBMITTED';await persist();}catch(error){if(!job.task_id){job.status='MANUAL_VERIFICATION_REQUIRED';await persist();}throw error;}}
 const deadline=Date.now()+options.timeoutMs;
 for(;;){const status=await provider.getTaskStatus(job.task_id);if(status==='FAILED')throw new Error('Provider generation failed');if(status==='COMPLETED')break;if(!['SUBMITTED','PROCESSING','PENDING'].includes(status))throw new Error('Invalid provider state');job.status=status==='PROCESSING'?'PROCESSING':'SUBMITTED';await persist();if(Date.now()>=deadline)throw new Error('Polling timeout; remote ID saved; resume polling only');await new Promise(r=>setTimeout(r,options.pollMs));}
 const result=await provider.getResult(job.task_id);job.result_url=await finish(result.url);job.status='COMPLETED';delete job.error;await persist();
}
export async function produce(task:Task,providerOverride?:VideoGenerationProvider){
 if(!task.plan)throw new Error('Production requires validated plan');
 const route=resolveVideoRoute(task.appMode,task.taskType);if(!route)throw new Error('Director-only mode cannot produce video');
 const provider=providerOverride||routeProvider(task.appMode,task.taskType);task.provider=route.provider;
 const selected=selectionSchema.parse(task.selectedVariants||['V1']);task.selectedVariants=selected;
 const root=projectDir(task.id);
 task.generationTasks=await loadGenerationTasks(task);
 const firstFrame=task.appMode==='full'&&!task.generationTasks.length?await prepareFirstFrame(task):undefined;
 for(const id of selected){if(task.generationTasks.some(j=>j.variantId===id))continue;const variant=task.plan.variants.find(v=>v.id===id);if(!variant)throw new Error('Selected variant missing');
  const request:VideoGenerationRequest={taskId:task.id,variantId:id,model:route.model,mode:'image-to-video',prompt:productionPrompt(variant,route.duration).prompt,duration:route.duration,aspect_ratio:'9:16',quality:'high',resolution:route.resolution,firstFrame};
  task.generationTasks.push({id:randomUUID(),variantId:id,provider:route.provider,model:route.model,status:'PENDING',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),request});
 }
 task.results=selected.map(id=>task.results.find(r=>r.id===id)||{id,name:task.plan!.variants.find(v=>v.id===id)!.name,status:'waiting'});
 const persist=async()=>{await jsonWrite(path.join(root,'generation-tasks.json'),task.generationTasks);await saveTask(task);};await persist();
 for(const job of task.generationTasks.filter(j=>selected.includes(j.variantId))){
  const result=task.results.find(r=>r.id===job.variantId)!;
  if(job.status==='COMPLETED'){result.status='completed';result.url=job.result_url;continue;}
  if(job.provider!==route.provider||job.model!==route.model)throw new Error('Saved provider/model differs; refusing to reroute');
  task.status=`GENERATING_${job.variantId}`;result.status='generating';task.logs.push({time:new Date().toISOString(),message:`${job.variantId}: ${job.provider} ${job.model} · ${job.request.duration}s`});await persist();
  try{await executeGeneration(job,provider,async()=>{job.updated_at=new Date().toISOString();result.providerTaskId=job.task_id;await persist();},async url=>{const file=`results/${job.variantId}.mp4`;if(provider.name==='mock')await validateVideo(path.join(root,file),job.request.duration);else await downloadVideo(url,path.join(root,file),job.request.duration);return mediaUrl(task.id,file);});result.status='completed';result.url=job.result_url;delete result.error;}
  catch(error){if(job.status!=='MANUAL_VERIFICATION_REQUIRED')job.status='FAILED';job.error=error instanceof Error?error.message:'Production failed';result.status='failed';result.error=job.error;}await persist();
 }
}
