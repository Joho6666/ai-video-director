import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {resolveVideoRoute,nearestDuration} from '../packages/video-provider/router';
import {MiniMaxProvider,MINIMAX_MODEL,MINIMAX_CAPABILITIES} from '../packages/video-provider/providers/minimax';
import {WanProvider,WAN_MODEL} from '../packages/video-provider/providers/wan';
import {MockProvider} from '../packages/video-provider/providers/mock';
import {productionPrompt,executeGeneration,selectionSchema,downloadVideo} from '../packages/agent/production';
import {projectDir} from '../packages/shared/storage';
import {configHealth} from '../packages/shared/config';
import type {GenerationTask,VideoGenerationProvider} from '../packages/video-provider/types';
import type {Variant} from '../packages/shared/types';
test('router selects mock or verified MiniMax, never falls back',()=>{
 assert.equal(resolveVideoRoute('mock','fashion',{})?.provider,'mock');assert.equal(resolveVideoRoute('director'),null);
 assert.throws(()=>resolveVideoRoute('full','fashion',{}),/unavailable/);
 assert.throws(()=>resolveVideoRoute('full','other',{MINIMAX_API_KEY:'x'}),/unsupported/);
 assert.throws(()=>resolveVideoRoute('full','fashion',{MINIMAX_API_KEY:'x',MINIMAX_MODEL:'unknown'}),/unverified/);
 assert.equal(resolveVideoRoute('full','ecommerce',{MINIMAX_API_KEY:'x'})?.duration,6);
 assert.equal(nearestDuration(8,[6,10]),10);
});
test('router selects Wan when WAN_API_KEY is configured or requested',()=>{
 assert.throws(()=>resolveVideoRoute('full','fashion',{WAN_API_KEY:'x',WAN_MODEL:'unknown'}),/unverified/);
 assert.equal(resolveVideoRoute('full','ecommerce',{WAN_API_KEY:'x'})?.provider,'wan');
 assert.equal(resolveVideoRoute('full','ecommerce',{WAN_API_KEY:'x'})?.duration,5);
 assert.equal(resolveVideoRoute('full','ecommerce',{WAN_API_KEY:'x'})?.resolution,'720P');
 assert.equal(resolveVideoRoute('full','ecommerce',{VIDEO_PROVIDER:'wan',WAN_API_KEY:'x',MINIMAX_API_KEY:'y'})?.provider,'wan');
 assert.equal(resolveVideoRoute('full','ecommerce',{VIDEO_PROVIDER:'minimax',WAN_API_KEY:'x',MINIMAX_API_KEY:'y'})?.provider,'minimax');
});
test('selection accepts one to three unique variants',()=>{for(const v of [['V1'],['V1','V3'],['V1','V2','V3']])assert.ok(selectionSchema.safeParse(v).success);for(const v of [[],['V1','V1'],['V4']])assert.equal(selectionSchema.safeParse(v).success,false);});
test('production timeline rescales all boundaries and avoids old complete prompt',()=>{const variant={timeline:[{duration:3,transition:'walk',end_state:'stop',camera_state:'follow'},{duration:5,transition:'turn',end_state:'settle'}],performance:{gaze:'eyes lead'},seedance_prompt:'8 seconds OLD'} as unknown as Variant;const out=productionPrompt(variant,6);assert.equal(out.timeline[1].time_range,'2.25-6s');assert.match(out.prompt,/6-second/);assert.doesNotMatch(out.prompt,/OLD|8 seconds/);});
test('config response does not expose key values',()=>{const data=configHealth({APP_MODE:'full',MINIMAX_API_KEY:'private-key',DEEPSEEK_API_KEY:'secret-key'});assert.doesNotMatch(JSON.stringify(data),/private-key|secret-key|API_KEY/);});
const config={key:'test-key',base:'https://api.minimax.cn',model:MINIMAX_MODEL};
test('MiniMax HTTP mapping handles submit, status, download without exposing vendor fields',async()=>{
 const id=randomUUID();await mkdir(path.join(projectDir(id),'production'),{recursive:true});await writeFile(path.join(projectDir(id),'production/first-frame.jpg'),Buffer.from('fixture-only'));
 const calls:string[]=[];const responses=[{task_id:'remote'},...['Preparing','Queueing','Processing','Success','Fail'].map(status=>({status})),{status:'Success',file_id:'file'},{file:{download_url:'https://cdn.example/video.mp4'}}];
 const provider=new MiniMaxProvider(config,(async(url,init)=>{calls.push(String(url));if(init?.body){const body=JSON.parse(String(init.body));assert.equal(body.model,MINIMAX_MODEL);assert.equal(body.prompt_optimizer,false);assert.match(body.first_frame_image,/^data:image\/jpeg;base64,/);assert.equal(body.duration,6);}return Response.json({...responses.shift(),base_resp:{status_code:0}});}) as typeof fetch);
 assert.equal((await provider.createTask({taskId:id,variantId:'V1',model:MINIMAX_MODEL,mode:'image-to-video',prompt:'Walk',duration:6,aspect_ratio:'9:16',quality:'high',resolution:'1080P',firstFrame:{id:'first_frame_01',file:'production/first-frame.jpg',sha256:'fixture'}})).id,'remote');
 for(const status of ['SUBMITTED','SUBMITTED','PROCESSING','COMPLETED','FAILED'])assert.equal(await provider.getTaskStatus('remote'),status);
 assert.equal((await provider.getResult('remote')).fileId,'file');assert.match(calls.at(-1)!,/files\/retrieve\?file_id=file/);
});
test('MiniMax missing key, HTTP/business errors, malformed and unknown states fail',async()=>{
 assert.throws(()=>new MiniMaxProvider({...config,key:''}),/UNAVAILABLE/);
 for(const response of [new Response('',{status:401}),Response.json({base_resp:{status_code:1008}}),Response.json({base_resp:{status_code:0},status:'other'})]){const p=new MiniMaxProvider(config,(async()=>response) as typeof fetch);await assert.rejects(()=>p.getTaskStatus('x'));}
});
const wanConfig={key:'test-wan-key',base:'https://dashscope.aliyuncs.com',model:WAN_MODEL};
test('Wan HTTP mapping handles submit, status, download without exposing vendor fields',async()=>{
 const id=randomUUID();await mkdir(path.join(projectDir(id),'production'),{recursive:true});await writeFile(path.join(projectDir(id),'production/first-frame.jpg'),Buffer.from('fixture-only'));
 const calls:string[]=[];const responses=[
  {output:{task_id:'wan_remote_1',task_status:'PENDING'}},
  ...['PENDING','RUNNING','SUCCEEDED','FAILED'].map(task_status=>({output:{task_id:'wan_remote_1',task_status}})),
  {output:{task_id:'wan_remote_1',task_status:'SUCCEEDED',video_url:'https://cdn.example/wan.mp4'}}
 ];
 const provider=new WanProvider(wanConfig,(async(url,init)=>{
  calls.push(String(url));
  if(init?.body){
   const body=JSON.parse(String(init.body));
   assert.equal(body.model,WAN_MODEL);
   assert.match(body.input.img_url,/^data:image\/jpeg;base64,/);
   assert.equal(body.parameters.duration,5);
   assert.equal(body.parameters.size,'720*1280');
   assert.equal((init.headers as Record<string,string>)?.[('X-DashScope-Async')],'enable');
  }
  return Response.json(responses.shift()||{});
 }) as typeof fetch);
 assert.equal((await provider.createTask({taskId:id,variantId:'V1',model:WAN_MODEL,mode:'image-to-video',prompt:'Walk',duration:5,aspect_ratio:'9:16',quality:'high',resolution:'720P',firstFrame:{id:'first_frame_01',file:'production/first-frame.jpg',sha256:'fixture'}})).id,'wan_remote_1');
 for(const status of ['SUBMITTED','PROCESSING','COMPLETED','FAILED'])assert.equal(await provider.getTaskStatus('wan_remote_1'),status);
 assert.equal((await provider.getResult('wan_remote_1')).url,'https://cdn.example/wan.mp4');
 assert.match(calls.at(-1)!,/tasks\/wan_remote_1/);
});
test('Wan missing key, HTTP/business errors, malformed and unknown states fail',async()=>{
 assert.throws(()=>new WanProvider({...wanConfig,key:''}),/UNAVAILABLE/);
 assert.throws(()=>new WanProvider({...wanConfig,base:'https://untrusted.com'}),/official DashScope/);
 for(const response of [new Response('',{status:401}),Response.json({code:'InvalidParameter',message:'bad input'}),Response.json({output:{task_status:'OTHER'}})]){
  const p=new WanProvider(wanConfig,(async()=>response) as typeof fetch);
  await assert.rejects(()=>p.getTaskStatus('x'));
 }
});
function job():GenerationTask{return {id:'local',variantId:'V1',provider:'minimax',model:MINIMAX_MODEL,status:'PENDING',created_at:'now',updated_at:'now',request:{taskId:randomUUID(),variantId:'V1',model:MINIMAX_MODEL,mode:'image-to-video',prompt:'walk',duration:6,aspect_ratio:'9:16',quality:'high',resolution:'1080P'}};}
test('state transitions persist and existing remote IDs never resubmit',async()=>{let creates=0;const statuses:string[]=[];const provider:VideoGenerationProvider={name:'minimax',capabilities:MINIMAX_CAPABILITIES,createTask:async()=>{creates++;return {id:'remote'};},getTaskStatus:async()=> 'COMPLETED',getResult:async()=>({url:'https://cdn.example/out'})};const j=job();await executeGeneration(j,provider,async()=>{statuses.push(j.status);},async()=>'/api/media/result');assert.deepEqual(statuses,['PENDING','SUBMITTED','COMPLETED']);assert.equal(creates,1);j.status='FAILED';await executeGeneration(j,provider,async()=>{},async()=>'/api/media/result');assert.equal(creates,1);});
test('ambiguous submission never retries and download failure never completes',async()=>{let creates=0;const provider:VideoGenerationProvider={name:'minimax',capabilities:MINIMAX_CAPABILITIES,createTask:async()=>{creates++;throw new Error('timeout');},getTaskStatus:async()=> 'COMPLETED',getResult:async()=>({url:'https://cdn.example/out'})};const j=job();await assert.rejects(()=>executeGeneration(j,provider,async()=>{},async()=>''),/timeout/);await assert.rejects(()=>executeGeneration(j,provider,async()=>{},async()=>''),/no resubmission/);assert.equal(creates,1);j.task_id='known';await assert.rejects(()=>executeGeneration(j,provider,async()=>{},async()=>{throw new Error('download failed');}),/download/);assert.notEqual(j.status,'COMPLETED');});
test('Mock unknown task is failed, unsafe download is rejected',async()=>{assert.equal(await new MockProvider().getTaskStatus(`mock:${randomUUID()}:V1`),'FAILED');await assert.rejects(()=>downloadVideo('http://localhost/video','unused',6),/Unsafe/);});

test('processing and polling timeout retain remote ID for resume without submission',async()=>{
 let creates=0;const j=job();const states:string[]=[];
 const p:VideoGenerationProvider={name:'minimax',capabilities:MINIMAX_CAPABILITIES,createTask:async()=>{creates++;return {id:'retained'};},getTaskStatus:async()=> 'PROCESSING',getResult:async()=>({url:'https://cdn.example/out'})};
 await assert.rejects(()=>executeGeneration(j,p,async()=>{states.push(j.status);},async()=>'',{pollMs:0,timeoutMs:0}),/Polling timeout/);
 assert.equal(j.task_id,'retained');assert.ok(states.includes('PROCESSING'));
 p.getTaskStatus=async()=> 'FAILED';await assert.rejects(()=>executeGeneration(j,p,async()=>{},async()=>''),/generation failed/);assert.equal(creates,1);
});
