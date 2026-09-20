import { NextResponse } from 'next/server';
import { configHealth } from '@/packages/shared/config';
import { listConnectionStatuses } from '@/packages/server/secrets';
import { hydrateEnvironment } from '@/packages/server/secrets';
export const dynamic='force-dynamic';
export async function GET(){try{await hydrateEnvironment();const health=configHealth();const connections=await listConnectionStatuses();const by=Object.fromEntries(connections.map(item=>[item.provider,item]));return NextResponse.json({appMode:health.appMode,deepseekConfigured:Boolean(by.deepseek?.configured),wanConfigured:Boolean(by.wan?.configured),minimaxConfigured:Boolean(by.minimax?.configured),seedanceConfigured:Boolean(by.seedance?.configured),deepseekModel:by.deepseek?.model||health.deepseekModel,wanModel:by.wan?.model||health.wanModel,minimaxModel:by.minimax?.model||'MiniMax-Hailuo-2.3',seedanceModel:health.seedanceModel});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'配置无效'},{status:500});}}
