import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceEvidenceSchema,deepSeekEnvelopeSchema } from '../packages/agent/deepseek';
import { mockSupplements,checkPlan } from '../packages/director';
import { mockTreatment } from '../packages/director/mock';

test('reference evidence requires every movement and camera field',()=>{
 const item={status:'Unknown',description:'not visible',frame_ids:[]};
 const valid=Object.fromEntries(['scene','shot_size','camera_height','camera_angle','camera_motion','subject_trajectory','action_sequence','gaze','head_movement','shoulder_movement','arm_motion','hand_action','body_weight','facial_expression','product_interaction','motion_continuity','lighting','rhythm','product_display_logic'].map(k=>[k,item]));
 assert.equal(referenceEvidenceSchema.safeParse(valid).success,true);
 delete valid.gaze;assert.equal(referenceEvidenceSchema.safeParse(valid).success,false);
});

test('DeepSeek envelope separates original treatment from supplements',()=>{
 const task={metadata:{duration:8,width:720,height:1280}} as never;
 const treatment=mockTreatment(task);const evidence=Object.fromEntries(['scene','shot_size','camera_height','camera_angle','camera_motion','subject_trajectory','action_sequence','gaze','head_movement','shoulder_movement','arm_motion','hand_action','body_weight','facial_expression','product_interaction','motion_continuity','lighting','rhythm','product_display_logic'].map(k=>[k,{status:'Unknown',description:'unknown',frame_ids:[]}])) ;
 assert.equal(deepSeekEnvelopeSchema.safeParse({treatment,supplements:mockSupplements(),reference_evidence:evidence}).success,true);
});

test('plan rejects fewer than three structural differences',()=>{
 const variant=(id:string)=>({id,name:id,creative_direction:'x',timeline:[{start_state:'a',end_state:'b',transition:'x',duration:8}],performance:{x:'y'},product_showcase:['legacy'],seedance_prompt:'prompt',negative_prompt:'none',structure:{camera_height:'same',camera_trajectory:'same',subject_trajectory:'same'}});
 assert.throws(()=>checkPlan({project_id:'p',mode:'mock',skill_sha256:'x',reference_analysis:{},shot_dna:{keep:['x'],mutate:['y']},variants:[variant('V1'),variant('V2'),variant('V3')],limitations:[]} as never));
});
