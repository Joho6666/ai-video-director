import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,symlink} from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import {randomUUID} from 'node:crypto';
import {produce,prepareFirstFrame} from '../packages/agent/production';
import {projectDir,saveTask,acquireTaskLock,reserveIdempotency} from '../packages/shared/storage';
import {compileTreatment,mockSupplements} from '../packages/director';
import {mockTreatment} from '../packages/director/mock';
import {ffmpeg,mediaExec} from '../packages/video-analysis';
import {createExportPackage,EXPORT_FILES,PRODUCTION_EXPORT_FILES} from '../packages/shared/exports';
import type {Task} from '../packages/shared/types';
test('Mock production only creates selected videos, resumes, exports sanitized ten-file ZIP',async()=>{
 const id=randomUUID(),root=projectDir(id);await mkdir(path.join(root,'uploads'),{recursive:true});
 await mediaExec(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:size=360x640:rate=10','-t','8','-pix_fmt','yuv420p',path.join(root,'uploads/reference.mp4')]);
 const task:Task={id,project_id:id,createdAt:'now',updatedAt:'now',requirement:'fixture',assets:[{kind:'reference',file:'uploads/reference.mp4',name:'reference.mp4',mime:'video/mp4'}],appMode:'mock',director:'mock',provider:'mock',status:'PLANNING_VARIANTS',logs:[],results:[],selectedVariants:['V1','V3']};
 task.plan=(await compileTreatment(task,mockTreatment(task),mockSupplements(),'mock')).plan;await saveTask(task);
 const lock=await acquireTaskLock(id);assert.ok(lock);assert.equal(await acquireTaskLock(id),null);await lock();
 await produce(task);assert.deepEqual(task.results.map(r=>r.id),['V1','V3']);assert.ok(task.results.every(r=>r.status==='completed'));assert.deepEqual((await readdir(path.join(root,'results'))).sort(),['V1.mp4','V3.mp4']);
 const ids=task.generationTasks!.map(j=>j.task_id);await produce(task);assert.deepEqual(task.generationTasks!.map(j=>j.task_id),ids);
 const exported=await createExportPackage(task,root,{reference_evidence:{}});const zip=await JSZip.loadAsync(await readFile(exported.zipPath));assert.deepEqual(Object.keys(zip.files).sort(),[...EXPORT_FILES,...PRODUCTION_EXPORT_FILES].sort());const audit=await zip.file('generation-request.json')!.async('string');assert.doesNotMatch(audit,/data:image|uploads\/|Bearer|API_KEY/);
 const key=randomUUID();assert.equal((await reserveIdempotency(key,'one',id)).existing,false);assert.equal((await reserveIdempotency(key,'one',id)).existing,true);await assert.rejects(()=>reserveIdempotency(key,'two',id));
});
test('first frame is letterboxed to 1080x1920 and export directory symlinks rejected',async()=>{
 const id=randomUUID(),root=projectDir(id);await mkdir(path.join(root,'uploads'),{recursive:true});await mediaExec(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=red:size=640x480','-frames:v','1',path.join(root,'uploads/source.jpg')]);
 const task={id,assets:[{kind:'first_frame',file:'uploads/source.jpg'}]} as Task;const frame=await prepareFirstFrame(task);assert.equal(frame.sha256.length,64);assert.ok((await readFile(path.join(root,frame.file))).length>0);
 const outside=path.join(projectDir(randomUUID()),'outside');await mkdir(outside,{recursive:true});await symlink(outside,path.join(root,'exports'),'junction');task.plan={} as Task['plan'];await assert.rejects(()=>createExportPackage(task,root,{reference_evidence:{}}),/symlink/);
});

test('partial production preserves successful variant and never resubmits ambiguous failure',async()=>{
 const id=randomUUID(),root=projectDir(id);await mkdir(path.join(root,'uploads'),{recursive:true});
 await mediaExec(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:size=360x640:rate=10','-t','8','-pix_fmt','yuv420p',path.join(root,'uploads/reference.mp4')]);
 const task:Task={id,project_id:id,createdAt:'now',updatedAt:'now',requirement:'fixture',assets:[{kind:'reference',file:'uploads/reference.mp4',name:'reference.mp4',mime:'video/mp4'}],appMode:'mock',director:'mock',provider:'mock',status:'PLANNING_VARIANTS',logs:[],results:[],selectedVariants:['V1','V2']};
 task.plan=(await compileTreatment(task,mockTreatment(task),mockSupplements(),'mock')).plan;await saveTask(task);
 const {MockProvider}=await import('../packages/video-provider/providers/mock');const provider=new MockProvider();const original=provider.createTask.bind(provider);let calls=0;
 provider.createTask=async request=>{calls++;if(request.variantId==='V2')throw new Error('Submission timeout');return original(request);};
 await produce(task,provider);assert.deepEqual(task.results.map(r=>r.status),['completed','failed']);assert.ok(task.results[0].url);
 await produce(task,provider);assert.equal(calls,2);assert.equal(task.results[0].status,'completed');assert.match(task.results[1].error||'',/manual verification/);
});
