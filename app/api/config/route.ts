import { NextResponse } from 'next/server';
export const dynamic='force-dynamic';
export async function GET(){return NextResponse.json({provider:process.env.VIDEO_PROVIDER||'mock',director:process.env.DIRECTOR_MODE||'mock'});}
