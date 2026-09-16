import {randomUUID} from 'node:crypto';
import {readFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {planSchema,type Task} from '../packages/shared/types';
import {projectDir,saveTask,jsonWrite} from '../packages/shared/storage';
import {createExportPackage} from '../packages/shared/exports';
import {produce} from '../packages/agent/production';
try{process.loadEnvFile('.env.local');}catch{}
if(!process.env.MINIMAX_API_KEY){console.log('UNAVAILABLE: MINIMAX_API_KEY missing');process.exit(0);}
const args=process.argv.slice(2);const value=(key:string)=>args[args.indexOf(key)+1];
if(!args.includes('--plan')||!args.includes('--first-frame'))throw new Error('Usage: npm run provider-live -- --plan <generation-plan.json> --first-frame <image>');
const plan=planSchema.parse(JSON.parse(await readFile(value('--plan'),'utf8')));if(plan.mode!=='live')throw new Error('Live test requires a real Director plan');
const id=randomUUID(),root=projectDir(id);await mkdir(path.join(root,'uploads'),{recursive:true});const file='uploads/'+randomUUID()+path.extname(value('--first-frame'));await copyFile(value('--first-frame'),path.join(root,file));
const task:Task={id,project_id:id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),requirement:'Explicit MiniMax live V1 test',assets:[{name:'first-frame',file,mime:'image/jpeg',kind:'first_frame'}],status:'PLANNING_VARIANTS',appMode:'full',director:'deepseek',provider:'minimax',logs:[],results:[],selectedVariants:['V1'],taskType:'ecommerce',plan};
await saveTask(task);await jsonWrite(path.join(root,'generation-plan.json'),plan);
const evidence=JSON.parse(await readFile(path.join(path.dirname(value('--plan')),'reference-evidence.json'),'utf8'));await jsonWrite(path.join(root,'reference-evidence.json'),evidence);
await produce(task);await createExportPackage(task,root,{reference_evidence:evidence});task.status=task.results.every(r=>r.status==='completed')?'COMPLETED':'FAILED';await saveTask(task);await jsonWrite(path.join(root,'provider-live.json'),{status:task.status,taskId:id});console.log(`${task.status==='COMPLETED'?'PASS':'FAIL'} MiniMax live task=${id}`);if(task.status==='FAILED')process.exitCode=1;
