import {resolveVideoRoute} from '../video-provider/router';
import type {AppMode} from './types';

export type AppConfig={
 appMode:AppMode;
 director:'mock'|'deepseek';
 videoProvider:'mock'|'minimax'|'wan'|'seedance'|'veo'|null;
 deepseekModel:string;
 seedanceModel:string|null;
 deepseekConfigured:boolean;
 seedanceConfigured:boolean;
};

type Env=Record<string,string|undefined>;

export function resolveAppConfig(env:Env=process.env):AppConfig{
 const mode=env.APP_MODE||'mock';
 if(!['mock','agent','director','full'].includes(mode))throw new Error('APP_MODE 必须为 mock、agent、director 或 full');
 const appMode=mode as AppMode;
 const deepseekConfigured=Boolean(env.DEEPSEEK_API_KEY);
 const seedanceConfigured=Boolean(env.SEEDANCE_API_KEY&&env.SEEDANCE_MODEL);
 if((appMode==='director'||appMode==='agent')&&!deepseekConfigured)throw new Error('Director Mode 缺少 DEEPSEEK_API_KEY');
 if(appMode==='full'&&!deepseekConfigured)throw new Error('Full Mode 缺少 DEEPSEEK_API_KEY');
 const route = appMode==='full'?resolveVideoRoute(appMode,'ecommerce',env):null;
 return {
  appMode,
  director:appMode==='mock'?'mock':'deepseek',
  videoProvider:appMode==='mock'?'mock':route?route.provider:null,
  deepseekModel:env.DEEPSEEK_MODEL||'deepseek-flash',
  seedanceModel:env.SEEDANCE_MODEL||null,
  deepseekConfigured,
  seedanceConfigured,
 };
}

export function configHealth(env:Env=process.env){
 const mode=(env.APP_MODE||'mock');
 if(!['mock','agent','director','full'].includes(mode))throw new Error('APP_MODE 必须为 mock、agent、director 或 full');
 const appMode=mode as AppMode;
 let production=null;let productionError:string|null=null;try{production=resolveVideoRoute(appMode,'ecommerce',env);}catch(e){productionError=e instanceof Error?e.message:'Provider unavailable';}
 return {
  production,
  productionError,
  minimaxConfigured:Boolean(env.MINIMAX_API_KEY),
  wanConfigured:Boolean(env.WAN_API_KEY||env.DASHSCOPE_API_KEY),
  veoConfigured:Boolean(env.VEO_API_KEY||env.GOOGLE_API_KEY),
  appMode,
  deepseekConfigured:Boolean(env.DEEPSEEK_API_KEY),
  seedanceConfigured:Boolean(env.SEEDANCE_API_KEY&&env.SEEDANCE_MODEL),
  deepseekModel:env.DEEPSEEK_MODEL||'deepseek-flash',
  seedanceModel:env.SEEDANCE_MODEL||null,
  wanModel:env.WAN_MODEL||'wanx2.1-i2v-plus'
 };
}

export function publicConfig(config:AppConfig){
 return {appMode:config.appMode,deepseekConfigured:config.deepseekConfigured,seedanceConfigured:config.seedanceConfigured,deepseekModel:config.deepseekModel,seedanceModel:config.seedanceModel};
}
