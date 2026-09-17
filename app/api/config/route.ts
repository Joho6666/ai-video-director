import { NextResponse } from 'next/server';
import { configHealth } from '@/packages/shared/config';
export const dynamic='force-dynamic';
export async function GET(){try{const health=configHealth();return NextResponse.json({appMode:health.appMode,deepseekConfigured:health.deepseekConfigured,seedanceConfigured:health.seedanceConfigured,deepseekModel:health.deepseekModel,seedanceModel:health.seedanceModel});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'配置无效'},{status:500});}}
