import { z } from 'zod';
import { planSchema, type Task, type Plan, remixProfiles } from '../shared/types';
import { deriveCreativeDNA } from './creative-dna';
import { mockMotionDna, motionDnaSchema } from '../shared/motion-dna.schema';
import { loadSkill } from './skill';
import { mockTreatment } from './mock';
export const structureKeys=['camera_height','camera_trajectory','subject_trajectory','performance','framing','entrance','ending','environment_interaction','product_interaction'] as const;
export const structureSchema=z.object(Object.fromEntries(structureKeys.map(k=>[k,z.string().min(1)])) as Record<typeof structureKeys[number],z.ZodString>);
export const supplementsSchema=z.array(z.object({id:z.enum(['V1','V2','V3']),structure:structureSchema,product_showcase:z.array(z.object({feature:z.string().min(1),action:z.string().min(1),camera_focus:z.string().min(1),evidence:z.union([z.string().min(1),z.array(z.string().min(1)).min(1)])})).min(2).max(4)})).length(3);
export function normalizeStructure(value:string){return value.toLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').split(' ').sort().join(' ');}
export function compileSeedancePrompt(input:{subject:string;camera:string;beats:string[];important?:string[];optional?:string[]}){
 const p0=`8-second commercial. Subject and product: ${input.subject}. Camera: ${input.camera}. Beats: ${input.beats.join(' → ')}.`;
 const p1=input.important?.length?` Performance: ${input.important.join('; ')}.`:'';
 const p2=input.optional?.length?` Look: ${input.optional.join('; ')}.`:'';
 for(const candidate of [p0+p1+p2,p0+p1,p0])if(candidate.length<=1800)return candidate;
 throw new Error('P0 Seedance Prompt 超过 1800 字符');
}
function actualFingerprint(variant:Plan['variants'][number]){
 const timeline=variant.timeline as Array<Record<string,unknown>>;
 return {
  camera:timeline.map(x=>x.camera_state||''),
  subject:timeline.map(x=>x.subject_position||''),
  performance:variant.performance,
  entrance:timeline[0]?.start_state||'',
  ending:timeline.at(-1)?.end_state||'',
  product:variant.product_showcase.map(x=>({action:x.action,camera_focus:x.camera_focus})),
 };
}
export function checkPlan(plan:Plan){
 if(new Set(plan.variants.map(v=>v.id)).size!==3)throw new Error('Director 必须输出 V1 / V2 / V3');
 if(plan.motion_dna)motionDnaSchema.parse(plan.motion_dna);
 for(const v of plan.variants){for(let i=1;i<v.timeline.length;i++)if(v.timeline[i-1].end_state!==v.timeline[i].start_state)throw new Error(`${v.id} 动作时间线不连续`);if(Math.abs(v.timeline.reduce((a,s)=>a+s.duration,0)-8)>0.1)throw new Error('每个版本必须为 8 秒');if(v.seedance_prompt.length>1800)throw new Error(`${v.id} Seedance Prompt 超过 1800 字符`);}
 for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){
  const changes=structureKeys.filter(k=>normalizeStructure(plan.variants[i].structure[k])!==normalizeStructure(plan.variants[j].structure[k]));if(changes.length<3)throw new Error('版本间不足三个结构差异');
  const a=actualFingerprint(plan.variants[i]),b=actualFingerprint(plan.variants[j]);const actualChanges=(Object.keys(a) as Array<keyof typeof a>).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));if(actualChanges.length<3)throw new Error('版本间实际内容不足三个差异维度');
 }
}
export async function compileTreatment(task:Task,raw:unknown,supplements:unknown,mode:'mock'|'live',motionDna?:unknown){
 const skill=await loadSkill();if(!skill.validate(raw))throw new Error('Director 输出不符合现有 Skill Schema: '+JSON.stringify(skill.validate.errors?.slice(0,3)));
 const treatment=raw as ReturnType<typeof mockTreatment>;
 if(treatment.mode!=='INSPIRE'||treatment.variations.length!==3)throw new Error('Director 必须输出 INSPIRE 模式的三个版本');
 if(mode==='live'&&Object.values(treatment.quality_check).some(v=>v!=='pass'))throw new Error('Director 质量检查未通过');
 const extra=supplementsSchema.parse(supplements);
 const resolvedMotionDna = motionDna ? motionDnaSchema.parse(motionDna) : ((treatment as Record<string,unknown>)?.motion_dna ? motionDnaSchema.parse((treatment as Record<string,unknown>).motion_dna) : mockMotionDna());
 const plan=planSchema.parse({video_generation:{provider:"auto",model:"",mode:"reference-to-video",duration:8,aspect_ratio:"9:16",quality:"high"},project_id:task.project_id,mode,skill_sha256:skill.sha256,reference_analysis:treatment.reference_analysis,shot_dna:treatment.shot_dna,motion_dna:resolvedMotionDna,creative_dna:deriveCreativeDNA(treatment.reference_analysis,treatment.shot_dna,resolvedMotionDna),remix_profile:remixProfiles[task.remixMode || 'structure'],limitations:treatment.limitations,variants:treatment.variations.map(v=>{
  if(v.timeline.continuity_check!=='pass')throw new Error('连续性检查未通过');
  const supplement=extra.find(x=>x.id===v.id);if(!supplement)throw new Error('缺少版本结构');
  if(mode==='live'&&(v.similarity_report.decision!=='pass'||Object.values(v.similarity_report).filter(x=>x==='high').length>=4))throw new Error('参考相似度检查未通过');
  const p=v.compiled_prompts.seedance;if(!p)throw new Error('缺少 Seedance Prompt');
  const beats=v.timeline.segments.map(s=>`${s.transition} End in ${s.end_state}`);
  const performance=v.performance_direction as Record<string,string>;
  const seedancePrompt=compileSeedancePrompt({subject:'Use the supplied person and product references; keep product identity and continuous hand contact',camera:v.timeline.segments.map(s=>String((s as Record<string,unknown>).camera_state||'physically compatible camera motion')).join('; '),beats,important:[performance.gaze,performance.head_movement,performance.shoulders,performance.body_weight,performance.asymmetry,performance.clothing_inertia,performance.props_inertia].filter(Boolean),optional:[p.complete_prompt]});
  return {id:v.id,name:v.title,creative_direction:v.concept,timeline:v.timeline.segments,performance:v.performance_direction,product_showcase:supplement.product_showcase.map(item=>({...item,evidence:Array.isArray(item.evidence)?item.evidence.join(','):item.evidence})),prompt:seedancePrompt,seedance_prompt:seedancePrompt,negative_prompt:p.negative_prompt,structure:supplement.structure};
 })});checkPlan(plan);return {plan,treatment};
}
export function mockSupplements(){return ['V1','V2','V3'].map((id,i)=>({id,structure:{camera_height:['high','eye-level','low'][i],camera_trajectory:['forward','lateral','arc'][i],subject_trajectory:['diagonal','cross frame','stationary quarter turn'][i],performance:['support and reveal','pause and demonstrate','turn and settle'][i],framing:['medium to detail','wide to medium','full to three-quarter'][i],entrance:['frame left','already walking','foreground detail'][i],ending:['hold','exit','off-camera glance'][i],environment_interaction:['open walkway','pause beside bench','open plaza'][i],product_interaction:['silhouette','daily use','side profile'][i]},product_showcase:[{feature:'Unknown / product silhouette',action:'自然保持接触并展示商品轮廓',camera_focus:'商品与人物比例',evidence:'Mock creative assumption; no visual model'},{feature:'Unknown / overall proportion',action:'轻微改变身体角度后保持商品稳定',camera_focus:'人物与商品整体比例',evidence:'Mock creative assumption; no visual model'}]}));}
