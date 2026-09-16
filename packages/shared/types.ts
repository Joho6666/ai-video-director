import { z } from 'zod';
export const statuses = ['UPLOADED','ANALYZING_REFERENCE','EXTRACTING_SHOT_DNA','PLANNING_VARIANTS','GENERATING_V1','GENERATING_V2','GENERATING_V3','COMPLETED','FAILED'] as const;
export type Status = typeof statuses[number];
export type Asset = { name: string; file: string; mime: string; kind: 'reference'|'model'|'product' };
export type Metadata = { duration: number; fps: number; width: number; height: number; frameCount: number };
export const showcaseSchema=z.object({feature:z.string().min(1),action:z.string().min(1),camera_focus:z.string().min(1),evidence:z.string().min(1)});
export type ProductShowcase=z.infer<typeof showcaseSchema>;
export const variantSchema = z.object({
  id: z.enum(['V1','V2','V3']), name: z.string().min(1), creative_direction: z.string().min(1),
  timeline: z.array(z.object({start_state:z.string(),end_state:z.string(),transition:z.string(),duration:z.number().positive()}).passthrough()).min(1),
  performance: z.record(z.string()), product_showcase:z.array(z.union([showcaseSchema,z.string()])).min(1),
  seedance_prompt:z.string().min(1).max(2400), negative_prompt:z.string().max(600),
  structure:z.record(z.string()),
});
export const planSchema = z.object({ project_id:z.string(), mode:z.enum(['mock','live']), skill_sha256:z.string(),
  reference_analysis:z.unknown(), shot_dna:z.object({keep:z.array(z.string()),mutate:z.array(z.string())}).passthrough(),
  variants:z.array(variantSchema).length(3), limitations:z.array(z.string()),
});
export type Variant = z.infer<typeof variantSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Result = { id:string; name:string; status:'waiting'|'generating'|'completed'|'failed'; providerTaskId?:string; url?:string; error?:string };
export type Task = { id:string; project_id:string; createdAt:string; updatedAt:string; requirement:string; assets:Asset[]; status:Status; provider:'mock'|'seedance'; director:'mock'|'deepseek'|'pi'; logs:{time:string;message:string}[]; results:Result[]; metadata?:Metadata; plan?:Plan; error?:string };
export interface VideoQCProvider { evaluate(videoUrl:string):Promise<{passed:boolean;issues:string[]}> }
