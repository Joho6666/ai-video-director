export type ProviderName='mock'|'minimax'|'seedance'|'wan'|'veo';
export type GenerationStatus='PENDING'|'SUBMITTED'|'PROCESSING'|'COMPLETED'|'FAILED'|'MANUAL_VERIFICATION_REQUIRED';
export type Capabilities={modes:readonly string[];durations:readonly number[];resolution:string;aspectRatio:'9:16';maxPrompt:number};
export type VideoGenerationRequest={taskId:string;variantId:'V1'|'V2'|'V3';model:string;mode:'image-to-video';prompt:string;duration:number;aspect_ratio:'9:16';quality:'high';resolution:string;firstFrame?:{id:string;file:string;sha256:string}};
export type GenerationTask={id:string;variantId:'V1'|'V2'|'V3';provider:ProviderName;model:string;task_id?:string;status:GenerationStatus;created_at:string;updated_at:string;submission_started_at?:string;result_url?:string;error?:string;request:VideoGenerationRequest;attempt?:number;previous_attempt_id?:string;quality_passed?:boolean};
export type VideoResult={url:string;fileId?:string};
export interface VideoGenerationProvider {
 name:ProviderName;
 capabilities:Capabilities;
 createTask(request:VideoGenerationRequest):Promise<{id:string}>;
 getTaskStatus(taskId:string):Promise<GenerationStatus>;
 getResult(taskId:string):Promise<VideoResult>;
}
