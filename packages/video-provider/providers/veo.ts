import type {Capabilities,GenerationStatus,VideoGenerationProvider,VideoGenerationRequest,VideoResult} from '../types';

export const VEO_MODEL='veo-2.0-generate-001';
export const VEO_CAPABILITIES:Capabilities={modes:['image-to-video','text-to-video'],durations:[5,8],resolution:'1080P',aspectRatio:'9:16',maxPrompt:2000};

export class VeoProvider implements VideoGenerationProvider {
 readonly name='veo' as const;
 readonly capabilities=VEO_CAPABILITIES;
 constructor(private config={key:process.env.VEO_API_KEY||process.env.GOOGLE_API_KEY||'',base:process.env.VEO_BASE_URL||'https://generativelanguage.googleapis.com',model:process.env.VEO_MODEL||VEO_MODEL}){
  if(!config.key)throw new Error('UNAVAILABLE: VEO_API_KEY missing');
 }
 async createTask(input:VideoGenerationRequest):Promise<{id:string}>{
  void input;
  throw new Error('Veo live generation requires Google Cloud / Gemini Vertex credentials');
 }
 async getTaskStatus(id:string):Promise<GenerationStatus>{
  void id;
  return 'FAILED';
 }
 async getResult(id:string):Promise<VideoResult>{
  void id;
  throw new Error('Veo result unavailable');
 }
}
