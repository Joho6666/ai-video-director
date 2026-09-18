import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceEvidenceSchema,deepSeekEnvelopeSchema,validateEvidenceFrameIds,normalizeUnknownProductShowcase } from '../packages/agent/deepseek';
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

test('plan rejects cosmetic structural differences',()=>{
 const variant=(id:string,trajectory:string)=>({id,name:id,creative_direction:'x',timeline:[{start_state:'a',end_state:'b',transition:'x',duration:8}],performance:{x:'y'},product_showcase:[{feature:'shape',action:'hold',camera_focus:'product',evidence:'image'},{feature:'ratio',action:'turn',camera_focus:'body',evidence:'image'}],seedance_prompt:'prompt',negative_prompt:'none',structure:{camera_height:'same',camera_trajectory:trajectory,subject_trajectory:'same'}});
 assert.throws(()=>checkPlan({project_id:'p',mode:'mock',skill_sha256:'x',reference_analysis:{},shot_dna:{keep:['x'],mutate:['y']},variants:[variant('V1','slow left follow'),variant('V2','slow follow left'),variant('V3','slow left follow')],limitations:[]} as never));
});
