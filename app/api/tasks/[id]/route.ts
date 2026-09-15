import { NextResponse } from 'next/server';
import { recoverTask } from '@/packages/agent/runner';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await recoverTask((await params).id),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'任务不存在'},{status:404});}}
