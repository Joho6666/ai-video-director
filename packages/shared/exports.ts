import { createHash } from 'node:crypto';
import { mkdir,lstat,readFile,rename,writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import type { Task } from './types';

export const EXPORT_FILES=['V1-prompt.txt','V2-prompt.txt','V3-prompt.txt','generation-plan.json','reference-evidence.json','assets-manifest.json','README.txt'] as const;
const MAX_EXPORT_BYTES=8*1024*1024;

async function atomicWrite(file:string,data:string|Buffer){
 const temp=`${file}.${crypto.randomUUID()}.tmp`;
 await writeFile(temp,data);
 await rename(temp,file);
}

function promptText(task:Task,index:number){
 const variant=task.plan!.variants[index];
 const showcase=variant.product_showcase.map((item,i)=>`${i+1}. ${item.feature} | ${item.action} | ${item.camera_focus} | ${item.evidence}`).join('\n');
 return `AI Video Director v0.4\nMode: ${task.appMode}\nVariant: ${variant.id} · ${variant.name}\n\nCreative Direction\n${variant.creative_direction}\n\nSeedance Prompt\n${variant.seedance_prompt}\n\nNegative Prompt\n${variant.negative_prompt}\n\nProduct Showcase\n${showcase}\n`;
}

export async function createExportPackage(task:Task,root:string,input:{reference_evidence:unknown}){
 if(!task.plan)throw new Error('缺少 generation plan，无法导出');
 const dir=path.join(root,'exports');await mkdir(dir,{recursive:true});
 for(let i=0;i<3;i++)await atomicWrite(path.join(dir,`V${i+1}-prompt.txt`),promptText(task,i));
 await atomicWrite(path.join(dir,'generation-plan.json'),JSON.stringify(task.plan,null,2));
 await atomicWrite(path.join(dir,'reference-evidence.json'),JSON.stringify(input.reference_evidence,null,2));
 const counters={reference:0,model:0,product:0};
 const manifest=[];
 for(const asset of task.assets){
  counters[asset.kind]++;const target=path.resolve(root,asset.file);if(!target.startsWith(path.resolve(root)+path.sep))throw new Error('素材路径越界');
  const info=await lstat(target);if(!info.isFile()||info.isSymbolicLink())throw new Error('导出素材清单拒绝非普通文件');
  const data=await readFile(target);manifest.push({id:`${asset.kind}_${String(counters[asset.kind]).padStart(2,'0')}`,type:asset.kind,mime:asset.mime,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
 }
 await atomicWrite(path.join(dir,'assets-manifest.json'),JSON.stringify(manifest,null,2));
 await atomicWrite(path.join(dir,'README.txt'),`AI Video Director v0.4 Director-First\nTask: ${task.id}\nMode: ${task.appMode}\n\nThis package contains directing plans and prompts only. It excludes uploaded customer media, sampled frames, generated videos, API responses and credentials.\n`);
 const zip=new JSZip();let total=0;
 for(const name of EXPORT_FILES){const file=path.join(dir,name);const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw new Error(`导出项不是普通文件：${name}`);total+=info.size;if(total>MAX_EXPORT_BYTES)throw new Error('导出包超过 8 MiB 限制');zip.file(name,await readFile(file));}
 const zipPath=path.join(dir,'creative-package.zip');await atomicWrite(zipPath,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
 return {zipPath};
}
