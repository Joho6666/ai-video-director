import {MiniMaxProvider,MINIMAX_MODEL,MINIMAX_CAPABILITIES} from './providers/minimax';
import {WanProvider,WAN_MODEL,WAN_CAPABILITIES} from './providers/wan';
import {MockProvider} from './providers/mock';
import type {VideoGenerationProvider} from './types';

export function nearestDuration(target:number,supported:readonly number[]){
 if(!supported.length)throw new Error('Provider duration unavailable');
 return [...supported].sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||b-a)[0];
}

export function resolveVideoRoute(mode:string,type='ecommerce',env:Record<string,string|undefined>=process.env){
 if(mode==='director')return null;
 if(mode==='mock')return {provider:'mock' as const,model:'demo-only',duration:8,resolution:'640P',aspect_ratio:'9:16' as const};
 if(mode!=='full'||!['fashion','ecommerce'].includes(type))throw new Error('Provider unavailable: unsupported mode or task type');

 const requested = env.VIDEO_PROVIDER && env.VIDEO_PROVIDER !== 'auto' ? env.VIDEO_PROVIDER : undefined;
 const targetProvider = requested || ((env.WAN_API_KEY || env.DASHSCOPE_API_KEY) && !env.MINIMAX_API_KEY ? 'wan' : 'minimax');

 if(targetProvider === 'wan'){
  const key = env.WAN_API_KEY || env.DASHSCOPE_API_KEY;
  if(!key)throw new Error('Provider unavailable: WAN_API_KEY missing');
  const model = env.WAN_MODEL || WAN_MODEL;
  if(model !== WAN_MODEL)throw new Error('Provider unavailable: unverified Wan model');
  return {provider:'wan' as const,model,duration:nearestDuration(8,WAN_CAPABILITIES.durations),resolution:WAN_CAPABILITIES.resolution,aspect_ratio:'9:16' as const};
 }

 if(!env.MINIMAX_API_KEY)throw new Error('Provider unavailable: MINIMAX_API_KEY missing');
 const model=env.MINIMAX_MODEL||MINIMAX_MODEL;
 if(model!==MINIMAX_MODEL)throw new Error('Provider unavailable: unverified MiniMax model');
 return {provider:'minimax' as const,model,duration:nearestDuration(8,MINIMAX_CAPABILITIES.durations),resolution:MINIMAX_CAPABILITIES.resolution,aspect_ratio:'9:16' as const};
}

export function routeProvider(mode:string,type='ecommerce',env:Record<string,string|undefined>=process.env):VideoGenerationProvider{
 const route=resolveVideoRoute(mode,type,env);
 if(!route)throw new Error('Director-only mode has no video provider');
 if(route.provider==='mock')return new MockProvider();
 if(route.provider==='wan')return new WanProvider({key:env.WAN_API_KEY||env.DASHSCOPE_API_KEY||'',base:env.WAN_BASE_URL||'https://dashscope.aliyuncs.com',model:route.model});
 return new MiniMaxProvider({key:env.MINIMAX_API_KEY||'',base:env.MINIMAX_BASE_URL||'https://api.minimax.cn',model:route.model});
}

/** Resume a persisted attempt without allowing current routing preferences to
 * replace its original provider or model. The adapter still validates its own
 * capability and configured official endpoint before any network call. */
export function providerForSavedRoute(provider:string, model:string, env:Record<string,string|undefined>=process.env):VideoGenerationProvider {
 if(provider==='mock') return new MockProvider();
 if(provider==='wan') return new WanProvider({key:env.WAN_API_KEY||env.DASHSCOPE_API_KEY||'',base:env.WAN_BASE_URL||'https://dashscope.aliyuncs.com',model});
 if(provider==='minimax') return new MiniMaxProvider({key:env.MINIMAX_API_KEY||'',base:env.MINIMAX_BASE_URL||'https://api.minimax.cn',model});
 throw new Error('Saved provider cannot be resumed safely');
}
