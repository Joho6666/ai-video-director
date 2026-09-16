import { NextResponse } from 'next/server';
import { readTask } from '@/packages/shared/storage';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await readTask((await params).id),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'任务不存在'},{status:404});}}
