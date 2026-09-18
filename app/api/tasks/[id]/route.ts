import { NextResponse } from 'next/server';
import { readTask } from '@/packages/shared/storage';
import { startPendingTaskRecovery } from '@/packages/agent/runner';
import { customerizeTask } from '@/packages/shared/errors';
import { isVerifiedReplayTask } from '@/packages/shared/replay';
export const dynamic='force-dynamic';
startPendingTaskRecovery();
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const task=await readTask((await params).id);return NextResponse.json({...customerizeTask(task),replayVerified:await isVerifiedReplayTask(task)},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'任务不存在'},{status:404});}}
