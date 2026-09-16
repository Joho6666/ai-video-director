import { NextRequest } from 'next/server';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { projectDir } from '@/packages/shared/storage';
export const runtime='nodejs';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string;file:string[]}>}){
 try{
  const {id,file}=await params;const relative=file.join('/');
  if(!/^(uploads\/[a-f0-9-]+\.(mp4|mov|jpg|png|webp)|reference\/(metadata\.json|frames\.json|contact-sheet\.jpg|frames\/frame-\d+\.jpg)|results\/V[123]\.mp4|generation-plan\.json|director-output\.json|reference-evidence\.json|deepseek-request\.json)$/.test(relative))return new Response('Not found',{status:404});
  const root=projectDir(id);const target=path.resolve(root,...file);if(!target.startsWith(root+path.sep))return new Response('Not found',{status:404});
  const size=(await stat(target)).size;const ext=path.extname(target);const mime:Record<string,string>={'.mp4':'video/mp4','.mov':'video/quicktime','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.json':'application/json'};
  const headers:Record<string,string>={'Content-Type':mime[ext]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'};
  if(req.nextUrl.searchParams.has('download'))headers['Content-Disposition']=`attachment; filename="${path.basename(target)}"`;
  let start=0,end=size-1;const range=req.headers.get('range');
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}else start=Math.max(0,size-Number(match[2]));if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});headers['Content-Range']=`bytes ${start}-${end}/${size}`;}
  headers['Content-Length']=String(end-start+1);return new Response(Readable.toWeb(createReadStream(target,{start,end})) as ReadableStream,{status:range?206:200,headers});
 }catch{return new Response('Not found',{status:404});}
}
