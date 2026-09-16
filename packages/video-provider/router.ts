import {MiniMaxProvider,MINIMAX_MODEL,MINIMAX_CAPABILITIES} from './providers/minimax';
import {MockProvider} from './providers/mock';
import type {VideoGenerationProvider} from './types';
export function nearestDuration(target:number,supported:readonly number[]){if(!supported.length)throw new Error('Provider duration unavailable');return [...supported].sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||b-a)[0];}
export function resolveVideoRoute(mode:string,type='ecommerce',env:Record<string,string|undefined>=process.env){
 if(mode==='director')return null;
 if(mode==='mock')return {provider:'mock' as const,model:'demo-only',duration:8,resolution:'640P',aspect_ratio:'9:16' as const};
 if(mode!=='full'||!['fashion','ecommerce'].includes(type))throw new Error('Provider unavailable: unsupported mode or task type');
 if(!env.MINIMAX_API_KEY)throw new Error('Provider unavailable: MINIMAX_API_KEY missing');
 const model=env.MINIMAX_MODEL||MINIMAX_MODEL;if(model!==MINIMAX_MODEL)throw new Error('Provider unavailable: unverified MiniMax model');
 return {provider:'minimax' as const,model,duration:nearestDuration(8,MINIMAX_CAPABILITIES.durations),resolution:MINIMAX_CAPABILITIES.resolution,aspect_ratio:'9:16' as const};
}
export function routeProvider(mode:string,type='ecommerce'):VideoGenerationProvider{
 const route=resolveVideoRoute(mode,type);if(!route)throw new Error('Director-only mode has no video provider');return route.provider==='mock'?new MockProvider():new MiniMaxProvider();
}
