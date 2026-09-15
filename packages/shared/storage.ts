import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Task } from './types';
export const dataRoot = path.resolve(process.env.DATA_DIR || 'data/projects');
export function projectDir(id:string) { if(!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid task ID'); return path.join(dataRoot,id); }
export async function jsonWrite(file:string,value:unknown) { await mkdir(path.dirname(file),{recursive:true}); const temp=file+'.'+crypto.randomUUID()+'.tmp'; await writeFile(temp,JSON.stringify(value,null,2)); await rename(temp,file); }
export async function saveTask(task:Task) { task.updatedAt=new Date().toISOString(); await jsonWrite(path.join(projectDir(task.id),'task.json'),task); }
export async function readTask(id:string):Promise<Task> { return JSON.parse(await readFile(path.join(projectDir(id),'task.json'),'utf8')); }
export function mediaUrl(id:string,file:string) { return `/api/media/${id}/${file.split(path.sep).join('/').split('/').map(encodeURIComponent).join('/')}`; }
