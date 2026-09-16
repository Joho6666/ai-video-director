import type {Asset,Variant} from '../shared/types';
export type ProviderInput={taskId:string;variant:Variant;assets:Asset[]};
export type ProviderTask={id:string};
export type ProviderStatus='queued'|'running'|'succeeded'|'failed';
export interface VideoGenerationProvider {createTask(input:ProviderInput):Promise<ProviderTask>;getTaskStatus(id:string):Promise<ProviderStatus>;getResult(id:string):Promise<{url:string}>;}
