import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {projectDir,acquireTaskLock} from '../packages/shared/storage';
import {executeGeneration,loadGenerationTasks,validateGenerationTasks} from '../packages/agent/production';
import {WorkflowStateManager} from '../packages/orchestrator/state';
import type {GenerationTask,VideoGenerationProvider} from '../packages/video-provider/types';
import type {Task} from '../packages/shared/types';

function fixture(){
 const job:GenerationTask={id:randomUUID(),variantId:'V1',provider:'wan',model:'verified',status:'PENDING',created_at:'now',updated_at:'now',request:{taskId:randomUUID(),variantId:'V1',model:'verified',mode:'image-to-video',prompt:'test',duration:5,aspect_ratio:'9:16',quality:'high',resolution:'720P'}};
 let submissions=0;
 const provider:VideoGenerationProvider={name:'wan',capabilities:{modes:['image-to-video'],durations:[5],resolution:'720P',aspectRatio:'9:16',maxPrompt:2000},async createTask(){submissions++;return{id:'remote'};},async getTaskStatus(){return 'COMPLETED';},async getResult(){return{url:'https://example.com/video.mp4'};}};
 return{job,provider,count:()=>submissions};
}
test('ambiguous submission persists manual state and cannot resubmit after reload',async()=>{
 const f=fixture();f.provider.createTask=async()=>{throw new Error('connection lost');};let saved='';const persist=async()=>{saved=JSON.stringify(f.job);};
 await assert.rejects(()=>executeGeneration(f.job,f.provider,persist,async()=>'/local'),/connection lost/);
 assert.equal(f.job.status,'MANUAL_VERIFICATION_REQUIRED');
 const recovered=JSON.parse(saved);let calls=0;f.provider.createTask=async()=>{calls++;return{id:'unsafe'};};
 await assert.rejects(()=>executeGeneration(recovered,f.provider,async()=>{},async()=>'/local'),/manual verification/);assert.equal(calls,0);
});
test('saved remote ID resumes download with no new submission; provider switch refused',async()=>{
 const f=fixture();f.job.task_id='remote';f.job.status='FAILED';
 await executeGeneration(f.job,f.provider,async()=>{},async()=>'/local');assert.equal(f.count(),0);assert.equal(f.job.status,'COMPLETED');
 f.job.status='PROCESSING';f.provider.name='minimax';await assert.rejects(()=>executeGeneration(f.job,f.provider,async()=>{},async()=>'/local'),/refusing to reroute/);
});
test('corrupt agent run fails closed and lock release checks owner',async()=>{
 const id=randomUUID(),root=projectDir(id);await mkdir(root,{recursive:true});await writeFile(path.join(root,'agent-run.json'),'{bad');await assert.rejects(()=>WorkflowStateManager.load(id,'full'));
 const release=await acquireTaskLock(id);assert.ok(release);assert.equal(await acquireTaskLock(id),null);
 await writeFile(path.join(root,'run.lock'),JSON.stringify({owner:'replacement',pid:process.pid}));await release();assert.equal(JSON.parse(await readFile(path.join(root,'run.lock'),'utf8')).owner,'replacement');
});
test('missing generation ledger fails closed after production evidence exists',async()=>{
 const f=fixture();const id=randomUUID();f.job.request.taskId=id;const task:Task={id,project_id:id,createdAt:'now',updatedAt:'now',requirement:'test',assets:[],status:'FAILED',appMode:'full',provider:'wan',director:'deepseek',logs:[],results:[{id:'V1',name:'V1',status:'failed',providerTaskId:'remote'}],generationTasks:[f.job]};
 await mkdir(projectDir(id),{recursive:true});await assert.rejects(()=>loadGenerationTasks(task),/refusing to recreate paid attempts/);
});
test('persisted attempt values are bounded before any paid execution',()=>{
 const f=fixture();const id=f.job.request.taskId;assert.throws(()=>validateGenerationTasks(id,[{...f.job,attempt:-1}]),/greater than or equal to 0|Invalid input/);assert.throws(()=>validateGenerationTasks(id,[{...f.job,attempt:3}]),/less than or equal to 2|Invalid input/);
});
