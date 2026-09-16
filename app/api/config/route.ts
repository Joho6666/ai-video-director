import { NextResponse } from 'next/server';
export const dynamic='force-dynamic';
export async function GET(){const director=process.env.DIRECTOR_MODE||'mock';return NextResponse.json({provider:process.env.VIDEO_PROVIDER||'mock',director,directorLabel:director==='deepseek'?'DeepSeek Director':'Mock Director'});}
