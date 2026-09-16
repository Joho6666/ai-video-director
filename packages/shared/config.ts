export type AppMode='mock'|'director'|'full';
export type AppConfig={
 appMode:AppMode;
 director:'mock'|'deepseek';
 videoProvider:'mock'|'seedance'|null;
 deepseekModel:string;
 seedanceModel:string|null;
 deepseekConfigured:boolean;
 seedanceConfigured:boolean;
};

type Env=Record<string,string|undefined>;

export function resolveAppConfig(env:Env=process.env):AppConfig{
 const mode=env.APP_MODE||'mock';
 if(!['mock','director','full'].includes(mode))throw new Error('APP_MODE 必须为 mock、director 或 full');
 const appMode=mode as AppMode;
 const deepseekConfigured=Boolean(env.DEEPSEEK_API_KEY);
 const seedanceConfigured=Boolean(env.SEEDANCE_API_KEY&&env.SEEDANCE_MODEL);
 if(appMode==='director'&&!deepseekConfigured)throw new Error('Director Mode 缺少 DEEPSEEK_API_KEY');
 if(appMode==='full'&&!deepseekConfigured)throw new Error('Full Mode 缺少 DEEPSEEK_API_KEY');
 if(appMode==='full'&&!seedanceConfigured)throw new Error('Full Mode 缺少 Seedance API Key 或模型配置');
 return {
  appMode,
  director:appMode==='mock'?'mock':'deepseek',
  videoProvider:appMode==='mock'?'mock':appMode==='full'?'seedance':null,
  deepseekModel:env.DEEPSEEK_MODEL||'deepseek-flash',
  seedanceModel:env.SEEDANCE_MODEL||null,
  deepseekConfigured,
  seedanceConfigured,
 };
}

export function configHealth(env:Env=process.env){
 const appMode=(env.APP_MODE||'mock') as AppMode;
 if(!['mock','director','full'].includes(appMode))throw new Error('APP_MODE 必须为 mock、director 或 full');
 return {appMode,deepseekConfigured:Boolean(env.DEEPSEEK_API_KEY),seedanceConfigured:Boolean(env.SEEDANCE_API_KEY&&env.SEEDANCE_MODEL),deepseekModel:env.DEEPSEEK_MODEL||'deepseek-flash',seedanceModel:env.SEEDANCE_MODEL||null};
}

export function publicConfig(config:AppConfig){
 return {appMode:config.appMode,deepseekConfigured:config.deepseekConfigured,seedanceConfigured:config.seedanceConfigured,deepseekModel:config.deepseekModel,seedanceModel:config.seedanceModel};
}
