import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceEvidenceSchema,deepSeekEnvelopeSchema,validateEvidenceFrameIds,normalizeUnknownProductShowcase,normalizeProductEvidenceSources,normalizeUnknownMotionEvidence,normalizeEvidenceFrameIds } from '../packages/agent/deepseek';
import { mockSupplements,checkPlan } from '../packages/director';
import { mockTreatment } from '../packages/director/mock';
import { mockMotionDna } from '../packages/shared/motion-dna.schema';
import { frameCountForDuration } from '../packages/video-analysis';

test('reference evidence requires every movement and camera field',()=>{
 const item={status:'Unknown',description:'not visible',frame_ids:[]};
 const valid=Object.fromEntries(['scene','shot_size','camera_height','camera_angle','camera_motion','subject_trajectory','action_sequence','gaze','head_movement','shoulder_movement','arm_motion','hand_action','body_weight','facial_expression','product_interaction','motion_continuity','lighting','rhythm','product_display_logic'].map(k=>[k,item]));
 assert.equal(referenceEvidenceSchema.safeParse(valid).success,true);
 delete valid.gaze;assert.equal(referenceEvidenceSchema.safeParse(valid).success,false);
});

test('evidence status enforces traceability',()=>{
 assert.equal(referenceEvidenceSchema.shape.gaze.safeParse({status:'Observed',description:'visible',frame_ids:[]}).success,false);
 assert.equal(referenceEvidenceSchema.shape.gaze.safeParse({status:'Unknown',description:'not visible',frame_ids:['frame_01']}).success,false);
 assert.equal(referenceEvidenceSchema.shape.gaze.safeParse({status:'Inferred',description:'推断为视线变化',frame_ids:[]}).success,true);
 assert.equal(referenceEvidenceSchema.shape.gaze.safeParse({status:'Inferred',description:'视线变化',frame_ids:[]}).success,false);
});

test('evidence rejects missing frame ids',()=>{const item={status:'Unknown' as const,description:'not visible',frame_ids:[]};const evidence=Object.fromEntries(['scene','shot_size','camera_height','camera_angle','camera_motion','subject_trajectory','action_sequence','gaze','head_movement','shoulder_movement','arm_motion','hand_action','body_weight','facial_expression','product_interaction','motion_continuity','lighting','rhythm','product_display_logic'].map(k=>[k,item]));evidence.gaze={status:'Observed',description:'visible',frame_ids:['frame_99']} as never;assert.throws(()=>validateEvidenceFrameIds(referenceEvidenceSchema.parse(evidence),new Set(['frame_01'])));});

test('frame evidence accepts safe zero-padding aliases only',()=>{
 const item={status:'Observed' as const,description:'visible',frame_ids:['frame_1']};
 const evidence=Object.fromEntries(['scene','shot_size','camera_height','camera_angle','camera_motion','subject_trajectory','action_sequence','gaze','head_movement','shoulder_movement','arm_motion','hand_action','body_weight','facial_expression','product_interaction','motion_continuity','lighting','rhythm','product_display_logic'].map(k=>[k,{status:'Unknown',description:'not visible',frame_ids:[]} ]));
 evidence.scene=item as never;
 const normalized=normalizeEvidenceFrameIds(referenceEvidenceSchema.parse(evidence),new Set(['frame_01','frame_02']));
 assert.deepEqual(normalized.scene.frame_ids,['frame_01']);
 const invalid=normalizeEvidenceFrameIds(referenceEvidenceSchema.parse({...evidence,scene:{...item,frame_ids:['frame_9']}}),new Set(['frame_01']));
 assert.throws(()=>validateEvidenceFrameIds(invalid,new Set(['frame_01'])));
});

test('dynamic frame count follows duration bands',()=>{assert.equal(frameCountForDuration(10),16);assert.equal(frameCountForDuration(10.1),24);assert.equal(frameCountForDuration(20),24);assert.equal(frameCountForDuration(20.1),32);assert.equal(frameCountForDuration(80),32);});

test('DeepSeek envelope separates original treatment from supplements and motion_dna',()=>{
 const task={metadata:{duration:8,width:720,height:1280}} as never;
 const treatment=mockTreatment(task);const evidence=Object.fromEntries(['scene','shot_size','camera_height','camera_angle','camera_motion','subject_trajectory','action_sequence','gaze','head_movement','shoulder_movement','arm_motion','hand_action','body_weight','facial_expression','product_interaction','motion_continuity','lighting','rhythm','product_display_logic'].map(k=>[k,{status:'Unknown',description:'unknown',frame_ids:[]}])) ;
 assert.equal(deepSeekEnvelopeSchema.safeParse({treatment,supplements:mockSupplements(),reference_evidence:evidence}).success,true);
 assert.equal(deepSeekEnvelopeSchema.safeParse({treatment,supplements:mockSupplements(),reference_evidence:evidence,motion_dna:mockMotionDna()}).success,true);
});

test('Unknown product evidence is made explicit without inventing a claim',()=>{
 const supplements=mockSupplements().map((variant,i)=>i===1?{...variant,product_showcase:[{...variant.product_showcase[0],feature:'jacket detail',evidence:'Unknown'}]}:variant) as Parameters<typeof normalizeUnknownProductShowcase>[0];
 const normalized=normalizeUnknownProductShowcase(supplements);
 assert.match(normalized[1].product_showcase[0].feature,/^Unknown:/);
 assert.equal(normalized[0].product_showcase[0].feature, supplements[0].product_showcase[0].feature);
});

test('product evidence aliases are canonicalized to task product ids',()=>{
 const supplements=mockSupplements().map(v=>({...v,product_showcase:v.product_showcase.map(x=>({...x,evidence:'product'}))}));
 const normalized=normalizeProductEvidenceSources(supplements as Parameters<typeof normalizeProductEvidenceSources>[0],new Set(['product_01']));
 assert.deepEqual(normalized[0].product_showcase[0].evidence,['product_01']);
});

test('explicit UNKNOWN motion evidence cannot retain frames or confidence',()=>{
 const value=normalizeUnknownMotionEvidence({action:'UNKNOWN: hand contact not visible',evidence:{frames:['frame_03'],confidence:0.8}}) as {evidence:{frames:string[];confidence:number}};
 assert.deepEqual(value.evidence,{frames:[],confidence:0});
});

test('plan rejects cosmetic structural differences',()=>{
 const variant=(id:string,trajectory:string)=>({id,name:id,creative_direction:'x',timeline:[{start_state:'a',end_state:'b',transition:'x',duration:8}],performance:{x:'y'},product_showcase:[{feature:'shape',action:'hold',camera_focus:'product',evidence:'image'},{feature:'ratio',action:'turn',camera_focus:'body',evidence:'image'}],seedance_prompt:'prompt',negative_prompt:'none',structure:{camera_height:'same',camera_trajectory:trajectory,subject_trajectory:'same'}});
 assert.throws(()=>checkPlan({project_id:'p',mode:'mock',skill_sha256:'x',reference_analysis:{},shot_dna:{keep:['x'],mutate:['y']},variants:[variant('V1','slow left follow'),variant('V2','slow follow left'),variant('V3','slow left follow')],limitations:[]} as never));
});
