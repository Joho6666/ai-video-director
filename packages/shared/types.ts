import type {GenerationTask} from '../video-provider/types';
import { z } from 'zod';
import { motionDnaSchema } from './motion-dna.schema';

export const workflowStatuses = ['CREATED','ANALYZING','PLANNING','GENERATING','REVIEWING','RETRYING','COMPLETED','FAILED'] as const;
export type WorkflowStatus = typeof workflowStatuses[number];
export const legacyStatuses = ['UPLOADED','ANALYZING_REFERENCE','EXTRACTING_SHOT_DNA','PLANNING_VARIANTS','GENERATING_V1','GENERATING_V2','GENERATING_V3'] as const;
export const statuses = ['CREATED','ANALYZING','PLANNING','GENERATING','REVIEWING','RETRYING','COMPLETED','FAILED','UPLOADED','ANALYZING_REFERENCE','EXTRACTING_SHOT_DNA','PLANNING_VARIANTS','GENERATING_V1','GENERATING_V2','GENERATING_V3'] as const;
export type Status = typeof statuses[number];

export type Asset = { name: string; file: string; mime: string; kind: 'reference'|'model'|'product'|'first_frame' };
export type Metadata = { duration: number; fps: number; width: number; height: number; frameCount: number };
export const showcaseSchema=z.object({feature:z.string().min(1),action:z.string().min(1),camera_focus:z.string().min(1),evidence:z.string().min(1)});
export type ProductShowcase=z.infer<typeof showcaseSchema>;
export const variantSchema = z.object({
  id: z.enum(['V1','V2','V3']), name: z.string().min(1), creative_direction: z.string().min(1),
  timeline: z.array(z.object({start_state:z.string(),end_state:z.string(),transition:z.string(),duration:z.number().positive()}).passthrough()).min(2).max(4),
  performance: z.record(z.string()), product_showcase:z.array(showcaseSchema).min(2).max(4),
  prompt:z.string().optional(), seedance_prompt:z.string().min(1).max(2400), negative_prompt:z.string().max(600),
  structure:z.record(z.string()),
});
export const videoGenerationSchema=z.object({provider:z.literal('auto').default('auto'),model:z.string().default(''),mode:z.literal('reference-to-video').default('reference-to-video'),duration:z.literal(8).default(8),aspect_ratio:z.literal('9:16').default('9:16'),quality:z.literal('high').default('high')});
export const planSchema = z.object({ video_generation:videoGenerationSchema.optional(), project_id:z.string(), mode:z.enum(['mock','live']), skill_sha256:z.string(),
  reference_analysis:z.unknown(), shot_dna:z.object({keep:z.array(z.string()),mutate:z.array(z.string())}).passthrough(),
  motion_dna:motionDnaSchema.optional(),
  variants:z.array(variantSchema).length(3), limitations:z.array(z.string()),
});
export type Variant = z.infer<typeof variantSchema>;
export type Plan = z.infer<typeof planSchema>;
export { type MotionDna, motionDnaSchema } from './motion-dna.schema';
export type Result = { id:string; name:string; status:'waiting'|'generating'|'completed'|'failed'; providerTaskId?:string; url?:string; error?:string; qualityScore?:number; qualityFeedback?:string[] };
export type AppMode='mock'|'agent'|'director'|'full';
export type ProviderPreference='auto'|'wan'|'minimax';
export type Task = {
  id:string;
  project_id:string;
  createdAt:string;
  updatedAt:string;
  requirement:string;
  assets:Asset[];
  status:Status;
  appMode:AppMode;
  provider:'mock'|'seedance'|'minimax'|'wan'|'veo'|null;
  providerPreference?: ProviderPreference;
  director:'mock'|'deepseek';
  idempotencyKey?:string;
  logs:{time:string;message:string}[];
  results:Result[];
  taskType?:'fashion'|'ecommerce';
  selectedVariants?:Array<'V1'|'V2'|'V3'>;
  generationTasks?:GenerationTask[];
  metadata?:Metadata;
  plan?:Plan;
  error?:string;
  workflow_id?:string;
  finalRecommendation?:{recommended_variant:'V1'|'V2'|'V3';score:number;rationale:string};
};
export interface VideoQCProvider { evaluate(videoUrl:string):Promise<{passed:boolean;issues:string[]}> }
