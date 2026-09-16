import {randomUUID} from 'node:crypto';
import {readFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {planSchema,type Task} from '../packages/shared/types';
import {projectDir,saveTask,jsonWrite} from '../packages/shared/storage';
import {createExportPackage} from '../packages/shared/exports';
import {produce} from '../packages/agent/production';
try{process.loadEnvFile('.env.local');}catch{}

const args=process.argv.slice(2);const value=(key:string)=>args[args.indexOf(key)+1];
const targetProvider = (args.includes('--provider') ? value('--provider') : (process.env.VIDEO_PROVIDER || (process.env.WAN_API_KEY ? 'wan' : 'minimax'))) as 'minimax'|'wan';

if(targetProvider==='wan'){
 if(!process.env.WAN_API_KEY && !process.env.DASHSCOPE_API_KEY){console.log('UNAVAILABLE: WAN_API_KEY missing');process.exit(0);}
}else{
 if(!process.env.MINIMAX_API_KEY){console.log('UNAVAILABLE: MINIMAX_API_KEY missing');process.exit(0);}
}

if(!args.includes('--plan')||!args.includes('--first-frame')){
 console.log(`Configured provider [${targetProvider}] is ready. Usage: npm run provider-live -- [--provider wan|minimax] --plan <generation-plan.json> --first-frame <image>`);
 process.exit(0);
}
const plan=planSchema.parse(JSON.parse(await readFile(value('--plan'),'utf8')));if(plan.mode!=='live')throw new Error('Live test requires a real Director plan');
const id=randomUUID(),root=projectDir(id);await mkdir(path.join(root,'uploads'),{recursive:true});const file='uploads/'+randomUUID()+path.extname(value('--first-frame'));await copyFile(value('--first-frame'),path.join(root,file));
const task:Task={id,project_id:id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),requirement:`Explicit ${targetProvider} live V1 test`,assets:[{name:'first-frame',file,mime:'image/jpeg',kind:'first_frame'}],status:'PLANNING_VARIANTS',appMode:'full',director:'deepseek',provider:targetProvider,logs:[],results:[],selectedVariants:['V1'],taskType:'ecommerce',plan};
await saveTask(task);await jsonWrite(path.join(root,'generation-plan.json'),plan);
const evidence=JSON.parse(await readFile(path.join(path.dirname(value('--plan')),'reference-evidence.json'),'utf8'));await jsonWrite(path.join(root,'reference-evidence.json'),evidence);
await produce(task);await createExportPackage(task,root,{reference_evidence:evidence});task.status=task.results.every(r=>r.status==='completed')?'COMPLETED':'FAILED';await saveTask(task);await jsonWrite(path.join(root,'provider-live.json'),{status:task.status,taskId:id,provider:targetProvider});console.log(`${task.status==='COMPLETED'?'PASS':'FAIL'} ${targetProvider} live task=${id}`);if(task.status==='FAILED')process.exitCode=1;
