import { z } from 'zod';
import { planSchema, type Task, type Plan } from '../shared/types';
import { loadSkill } from './skill';
import { mockTreatment } from './mock';
export const structureKeys=['camera_height','camera_trajectory','subject_trajectory','performance','framing','entrance','ending','environment_interaction','product_interaction'] as const;
export const structureSchema=z.object(Object.fromEntries(structureKeys.map(k=>[k,z.string().min(1)])) as Record<typeof structureKeys[number],z.ZodString>);
export const supplementsSchema=z.array(z.object({id:z.enum(['V1','V2','V3']),structure:structureSchema,product_showcase:z.array(z.object({feature:z.string().min(1),action:z.string().min(1),camera_focus:z.string().min(1),evidence:z.string().min(1)})).min(2).max(4)})).length(3);
export function normalizeStructure(value:string){return value.toLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').split(' ').sort().join(' ');}
export function checkPlan(plan:Plan){
 if(new Set(plan.variants.map(v=>v.id)).size!==3)throw new Error('Director 必须输出 V1 / V2 / V3');
 for(const v of plan.variants){for(let i=1;i<v.timeline.length;i++)if(v.timeline[i-1].end_state!==v.timeline[i].start_state)throw new Error(`${v.id} 动作时间线不连续`);if(Math.abs(v.timeline.reduce((a,s)=>a+s.duration,0)-8)>0.1)throw new Error('每个版本必须为 8 秒');if(v.seedance_prompt.length>1800)throw new Error(`${v.id} Seedance Prompt 超过 1800 字符`);}
 for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){const changes=structureKeys.filter(k=>normalizeStructure(plan.variants[i].structure[k])!==normalizeStructure(plan.variants[j].structure[k]));if(changes.length<3)throw new Error('版本间不足三个结构差异');}
}
export async function compileTreatment(task:Task,raw:unknown,supplements:unknown,mode:'mock'|'live'){
 const skill=await loadSkill();if(!skill.validate(raw))throw new Error('Director 输出不符合现有 Skill Schema: '+JSON.stringify(skill.validate.errors?.slice(0,3)));
 const treatment=raw as ReturnType<typeof mockTreatment>;
 if(treatment.mode!=='INSPIRE'||treatment.variations.length!==3)throw new Error('Director 必须输出 INSPIRE 模式的三个版本');
 if(mode==='live'&&Object.values(treatment.quality_check).some(v=>v!=='pass'))throw new Error('Director 质量检查未通过');
 const extra=supplementsSchema.parse(supplements);
 const plan=planSchema.parse({project_id:task.project_id,mode,skill_sha256:skill.sha256,reference_analysis:treatment.reference_analysis,shot_dna:treatment.shot_dna,limitations:treatment.limitations,variants:treatment.variations.map(v=>{
  if(v.timeline.continuity_check!=='pass')throw new Error('连续性检查未通过');
  const supplement=extra.find(x=>x.id===v.id);if(!supplement)throw new Error('缺少版本结构');
  if(mode==='live'&&(v.similarity_report.decision!=='pass'||Object.values(v.similarity_report).filter(x=>x==='high').length>=4))throw new Error('参考相似度检查未通过');
  const p=v.compiled_prompts.seedance;if(!p)throw new Error('缺少 Seedance Prompt');
  return {id:v.id,name:v.title,creative_direction:v.concept,timeline:v.timeline.segments,performance:v.performance_direction,product_showcase:supplement.product_showcase,seedance_prompt:p.complete_prompt,negative_prompt:p.negative_prompt,structure:supplement.structure};
 })});checkPlan(plan);return {plan,treatment};
}
export function mockSupplements(){return ['V1','V2','V3'].map((id,i)=>({id,structure:{camera_height:['high','eye-level','low'][i],camera_trajectory:['forward','lateral','arc'][i],subject_trajectory:['diagonal','cross frame','stationary quarter turn'][i],performance:['support and reveal','pause and demonstrate','turn and settle'][i],framing:['medium to detail','wide to medium','full to three-quarter'][i],entrance:['frame left','already walking','foreground detail'][i],ending:['hold','exit','off-camera glance'][i],environment_interaction:['open walkway','pause beside bench','open plaza'][i],product_interaction:['silhouette','daily use','side profile'][i]},product_showcase:[{feature:'Unknown / product silhouette',action:'自然保持接触并展示商品轮廓',camera_focus:'商品与人物比例',evidence:'Mock creative assumption; no visual model'},{feature:'Unknown / overall proportion',action:'轻微改变身体角度后保持商品稳定',camera_focus:'人物与商品整体比例',evidence:'Mock creative assumption; no visual model'}]}));}
