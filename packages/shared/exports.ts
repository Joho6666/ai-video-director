import { createHash } from 'node:crypto';
import { mkdir,lstat,readFile,rename,writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import type { Task } from './types';
import { mockMotionDna } from './motion-dna.schema';

export const EXPORT_FILES=['V1-prompt.txt','V2-prompt.txt','V3-prompt.txt','generation-plan.json','reference-evidence.json','motion-dna.json','assets-manifest.json','README.txt'] as const;
export const PRODUCTION_EXPORT_FILES=['director-plan.json','generation-request.json','provider-result.json'] as const;
const MAX_EXPORT_BYTES=8*1024*1024;

async function atomicWrite(file:string,data:string|Buffer){
 const temp=`${file}.${crypto.randomUUID()}.tmp`;
 await writeFile(temp,data);
 await rename(temp,file);
}

function promptText(task:Task,index:number){
 const variant=task.plan!.variants[index];
 const showcase=variant.product_showcase.map((item,i)=>`${i+1}. ${item.feature} | ${item.action} | ${item.camera_focus} | ${item.evidence}`).join('\n');
 return `AI Video Director v1.2\nMode: ${task.appMode}\nVariant: ${variant.id} · ${variant.name}\n\nCreative Direction\n${variant.creative_direction}\n\nSeedance Prompt\n${variant.seedance_prompt}\n\nNegative Prompt\n${variant.negative_prompt}\n\nProduct Showcase\n${showcase}\n`;
}

export async function createExportPackage(task:Task,root:string,input:{reference_evidence:unknown}){
 if(!task.plan)throw new Error('缺少 generation plan，无法导出');
 const dir=path.join(root,'exports');await mkdir(dir,{recursive:true});if((await lstat(dir)).isSymbolicLink())throw new Error('Export directory symlink rejected');
 for(const name of [...EXPORT_FILES,...PRODUCTION_EXPORT_FILES,'creative-package.zip']){try{const info=await lstat(path.join(dir,name));if(info.isSymbolicLink()||!info.isFile())throw new Error('Export entry must be a regular file');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 for(let i=0;i<3;i++)await atomicWrite(path.join(dir,`V${i+1}-prompt.txt`),promptText(task,i));
 await atomicWrite(path.join(dir,'generation-plan.json'),JSON.stringify(task.plan,null,2));
 await atomicWrite(path.join(dir,'reference-evidence.json'),JSON.stringify(input.reference_evidence,null,2));
 await atomicWrite(path.join(dir,'motion-dna.json'),JSON.stringify(task.plan.motion_dna || mockMotionDna(),null,2));
 const counters={reference:0,model:0,product:0,first_frame:0};
 const manifest=[];
 for(const asset of task.assets){
  counters[asset.kind]++;const target=path.resolve(root,asset.file);if(!target.startsWith(path.resolve(root)+path.sep))throw new Error('素材路径越界');
  const info=await lstat(target);if(!info.isFile()||info.isSymbolicLink())throw new Error('导出素材清单拒绝非普通文件');
  const data=await readFile(target);manifest.push({id:`${asset.kind}_${String(counters[asset.kind]).padStart(2,'0')}`,type:asset.kind,mime:asset.mime,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
 }
 await atomicWrite(path.join(dir,'assets-manifest.json'),JSON.stringify(manifest,null,2));
 await atomicWrite(path.join(dir,'README.txt'),`AI Video Director v1.2 Motion & Quality Agent\nTask: ${task.id}\nMode: ${task.appMode}\n\nThis package contains directing plans, prompts, motion DNA and sanitized production audit records. It excludes uploaded customer media, sampled frames, generated videos, API responses and credentials.\n`);
 const zip=new JSZip();let total=0;
 const production=task.appMode!=='director'&&Boolean(task.generationTasks);
 if(production){
  await atomicWrite(path.join(dir,'director-plan.json'),JSON.stringify(task.plan,null,2));
  await atomicWrite(path.join(dir,'generation-request.json'),JSON.stringify(task.generationTasks!.map(j=>({variant:j.variantId,provider:j.provider,model:j.model,prompt:j.request.prompt,mode:j.request.mode,duration:j.request.duration,aspect_ratio:j.request.aspect_ratio,resolution:j.request.resolution,first_frame:j.request.firstFrame?{id:j.request.firstFrame.id,sha256:j.request.firstFrame.sha256}:null})),null,2));
  await atomicWrite(path.join(dir,'provider-result.json'),JSON.stringify(task.generationTasks!.map(j=>({variant:j.variantId,provider:j.provider,model:j.model,task_id:j.task_id,status:j.status,created_at:j.created_at,updated_at:j.updated_at,result_url:j.result_url?.startsWith('/api/media/')?j.result_url:null,error:j.error, demo_only:j.provider==='mock'})),null,2));
 }
 for(const name of [...EXPORT_FILES,...(production?PRODUCTION_EXPORT_FILES:[])]){const file=path.join(dir,name);const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw new Error(`导出项不是普通文件：${name}`);total+=info.size;if(total>MAX_EXPORT_BYTES)throw new Error('导出包超过 8 MiB 限制');zip.file(name,await readFile(file));}
 const zipPath=path.join(dir,'creative-package.zip');await atomicWrite(zipPath,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
 return {zipPath};
}
