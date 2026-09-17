import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import type { Task } from './types';
export const dataRoot = path.resolve(process.env.DATA_DIR || 'data/projects');
export function projectDir(id:string) { if(!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid task ID'); return path.join(dataRoot,id); }
export async function jsonWrite(file:string,value:unknown) { await mkdir(path.dirname(file),{recursive:true}); const temp=file+'.'+crypto.randomUUID()+'.tmp'; await writeFile(temp,JSON.stringify(value,null,2)); await rename(temp,file); }
export async function saveTask(task:Task) { task.updatedAt=new Date().toISOString(); await jsonWrite(path.join(projectDir(task.id),'task.json'),task); }
export async function readTask(id:string):Promise<Task> { return JSON.parse(await readFile(path.join(projectDir(id),'task.json'),'utf8')); }
export function mediaUrl(id:string,file:string) { return `/api/media/${id}/${file.split(path.sep).join('/').split('/').map(encodeURIComponent).join('/')}`; }

export async function reserveIdempotency(key:string,fingerprint:string,id:string){
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(key))throw new Error('Idempotency-Key 格式无效');
 const dir=path.join(dataRoot,'_idempotency');await mkdir(dir,{recursive:true});const file=path.join(dir,createHash('sha256').update(key).digest('hex')+'.json');
 try{const handle=await open(file,'wx');try{await handle.writeFile(JSON.stringify({id,fingerprint,createdAt:new Date().toISOString()}));}finally{await handle.close();}return {id,existing:false};}
 catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const saved=JSON.parse(await readFile(file,'utf8')) as {id:string;fingerprint:string};if(saved.fingerprint!==fingerprint)throw new Error('同一 Idempotency-Key 不能用于不同素材');return {id:saved.id,existing:true};}
}

export async function acquireTaskLock(id:string){
 const file=path.join(projectDir(id),'run.lock');
 const create=async()=>{
  const owner=randomUUID();const handle=await open(file,'wx');
  try{await handle.writeFile(JSON.stringify({owner,pid:process.pid,startedAt:new Date().toISOString()}));}finally{await handle.close();}
  return async()=>{try{const current=JSON.parse(await readFile(file,'utf8'));if(current.owner===owner)await unlink(file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}};
 };
 try{return await create();}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
 // Serialize stale-owner recovery. An alive or unverifiable owner is never evicted.
 let recovery;try{recovery=await open(file+'.recovery','wx');}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')return null;throw error;}
 try{
  const current=JSON.parse(await readFile(file,'utf8')) as {pid?:number};
  if(!Number.isInteger(current.pid)||!current.pid||current.pid<1)return null;
  try{process.kill(current.pid,0);return null;}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')return null;}
  await unlink(file);
  try{return await create();}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')return null;throw error;}
 }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
 finally{await recovery.close();await unlink(file+'.recovery').catch(()=>{});}
}
