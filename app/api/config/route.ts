import { NextResponse } from 'next/server';
import { configHealth } from '@/packages/shared/config';
export const dynamic='force-dynamic';
export async function GET(){try{return NextResponse.json(configHealth());}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'配置无效'},{status:500});}}
