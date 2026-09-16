import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveAppConfig, publicConfig } from '../packages/shared/config';
import { createExportPackage, EXPORT_FILES } from '../packages/shared/exports';
import { validateEvidenceAgainstTreatment, directorOutputContract } from '../packages/agent/deepseek';
import { checkPlan, compileSeedancePrompt } from '../packages/director';
import { getOrCreateProviderTask } from '../packages/agent/runner';
import type { Plan, Task } from '../packages/shared/types';

test('APP_MODE resolves the only supported runtime combinations',()=>{
 assert.deepEqual(resolveAppConfig({APP_MODE:'mock'}),{appMode:'mock',director:'mock',videoProvider:'mock',deepseekModel:'deepseek-flash',seedanceModel:null,deepseekConfigured:false,seedanceConfigured:false});
 assert.equal(resolveAppConfig({APP_MODE:'director',DEEPSEEK_API_KEY:'key'}).videoProvider,null);
 assert.equal(resolveAppConfig({APP_MODE:'full',DEEPSEEK_API_KEY:'key',SEEDANCE_API_KEY:'seed',SEEDANCE_MODEL:'seedance'}).director,'deepseek');
 assert.throws(()=>resolveAppConfig({APP_MODE:'director'}),/DEEPSEEK_API_KEY/);
 assert.throws(()=>resolveAppConfig({APP_MODE:'full',DEEPSEEK_API_KEY:'key'}),/Seedance/);
 assert.throws(()=>resolveAppConfig({APP_MODE:'broken'}),/APP_MODE/);
});

test('public config never exposes secrets',()=>{
 const value=publicConfig(resolveAppConfig({APP_MODE:'director',DEEPSEEK_API_KEY:'top-secret'}));
 assert.deepEqual(Object.keys(value).sort(),['appMode','deepseekConfigured','deepseekModel','seedanceConfigured','seedanceModel'].sort());
 assert.doesNotMatch(JSON.stringify(value),/top-secret|apiKey|authorization/i);
});

test('DeepSeek contract pins Skill enum values without treating the example as evidence',()=>{
 const contract=directorOutputContract();
 assert.match(contract,/changed_dimensions allowed values: camera_height, camera_trajectory, subject_trajectory, framing, performance, entrance, ending, environment_interaction/i);
 assert.doesNotMatch(contract,/changed_dimensions allowed values:[^\.]*product_interaction/i);
 assert.match(contract,/illustrative example only/i);
});

test('Unknown evidence cannot accompany a definite reference claim',()=>{
 const treatment={reference_analysis:[{scene:'City street',shot_size:'Unknown',camera_position:'Unknown',camera_angle:'Unknown',camera_motion:'Unknown',subject_trajectory:'Unknown',actions:'Unknown',performance:'Unknown',lighting:'Unknown',rhythm:'Unknown'}]};
 const unknown={status:'Unknown' as const,description:'not visible',frame_ids:[]};
 const evidence=Object.fromEntries(['scene','shot_size','camera_height','camera_angle','camera_motion','subject_trajectory','action_sequence','gaze','head_movement','shoulder_movement','arm_motion','hand_action','body_weight','facial_expression','product_interaction','motion_continuity','lighting','rhythm','product_display_logic'].map(k=>[k,unknown]));
 assert.throws(()=>validateEvidenceAgainstTreatment(treatment,evidence as never),/scene/i);
});

test('product showcase sources are restricted to current product ids, user text, or Unknown',()=>{
 const evidence={status:'Observed',description:'visible',frame_ids:['frame_01']};
 const base=Object.fromEntries(['scene','shot_size','camera_height','camera_angle','camera_motion','subject_trajectory','action_sequence','gaze','head_movement','shoulder_movement','arm_motion','hand_action','body_weight','facial_expression','product_interaction','motion_continuity','lighting','rhythm','product_display_logic'].map(k=>[k,evidence]));
 const treatment={reference_analysis:[{scene:'[Observed:frame_01] street',shot_size:'[Observed:frame_01] full',camera_position:'[Observed:frame_01] eye',camera_angle:'[Observed:frame_01] level',camera_motion:'[Observed:frame_01] follow',subject_trajectory:'[Observed:frame_01] forward',actions:'[Observed:frame_01] walk',performance:'[Observed:frame_01] relaxed',lighting:'[Observed:frame_01] daylight',rhythm:'[Observed:frame_01] slow'}]};
 assert.throws(()=>validateEvidenceAgainstTreatment(treatment,base as never,[{id:'V1',structure:{} as never,product_showcase:[{feature:'wool',action:'touch',camera_focus:'fabric',evidence:'internet'}]}] as never,new Set(['product_01'])),/product_showcase/i);
});

test('actual variants cannot be identical behind different structure labels',()=>{
 const variant=(id:'V1'|'V2'|'V3',label:string)=>({id,name:id,creative_direction:'same',timeline:[{start_state:'enter',end_state:'hold',transition:'walk',duration:4,camera_state:'eye follow',subject_position:'forward'},{start_state:'hold',end_state:'settle',transition:'stop',duration:4,camera_state:'eye follow',subject_position:'forward'}],performance:{gaze:'same'},product_showcase:[{feature:'shape',action:'hold',camera_focus:'bag',evidence:'product_01'},{feature:'ratio',action:'turn',camera_focus:'body',evidence:'product_01'}],seedance_prompt:'same',negative_prompt:'none',structure:{camera_height:label,camera_trajectory:label,subject_trajectory:label,performance:label,framing:label,entrance:label,ending:label,environment_interaction:label,product_interaction:label}});
 assert.throws(()=>checkPlan({project_id:'p',mode:'live',skill_sha256:'x',reference_analysis:{},shot_dna:{keep:[],mutate:[]},variants:[variant('V1','one'),variant('V2','two'),variant('V3','three')],limitations:[]} as Plan),/actual|实际|内容/i);
});

test('prompt compiler drops optional details before required motion',()=>{
 const prompt=compileSeedancePrompt({subject:'woman with black bag',camera:'eye-level lateral follow',beats:['walk two steps with sustained bag contact','gaze then head then shoulders turn','stop on support foot and let bag settle'],important:['asymmetric arm swing','small facial change'],optional:['soft daylight '.repeat(300)]});
 assert.ok(prompt.length<=1800);
 assert.match(prompt,/sustained bag contact/);
 assert.match(prompt,/support foot/);
});

test('export package contains exactly seven safe files and no source assets',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'director-export-'));
 await mkdir(path.join(root,'uploads'),{recursive:true});await writeFile(path.join(root,'uploads','model.jpg'),'asset');
 const task={id:'11111111-1111-4111-8111-111111111111',project_id:'p',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),requirement:'test',assets:[{name:'model.jpg',file:'uploads/model.jpg',mime:'image/jpeg',kind:'model'}],status:'COMPLETED',appMode:'director',provider:null,director:'deepseek',logs:[],results:[],plan:{project_id:'p',mode:'live',skill_sha256:'x',reference_analysis:{},shot_dna:{keep:[],mutate:[]},limitations:[],variants:['V1','V2','V3'].map((id)=>({id,name:id,creative_direction:'direction',timeline:[{start_state:'a',end_state:'b',transition:'move',duration:8},{start_state:'b',end_state:'c',transition:'settle',duration:0.01}],performance:{gaze:'soft'},product_showcase:[{feature:'shape',action:'hold',camera_focus:'bag',evidence:'product_01'},{feature:'ratio',action:'turn',camera_focus:'body',evidence:'product_01'}],seedance_prompt:'prompt',negative_prompt:'negative',structure:{camera_height:'eye',camera_trajectory:'follow',subject_trajectory:'walk',performance:'soft',framing:'medium',entrance:'left',ending:'hold',environment_interaction:'street',product_interaction:'hold'}}))}} as Task;
 const result=await createExportPackage(task,root,{reference_evidence:{scene:'Unknown'}});
 assert.deepEqual((await readdir(path.join(root,'exports'))).filter(x=>x!=='creative-package.zip').sort(),[...EXPORT_FILES].sort());
 const zip=await readFile(result.zipPath);
 assert.ok(zip.length>0);
 assert.doesNotMatch(zip.toString('latin1'),/uploads\/|reference\/frames|DEEPSEEK_API_KEY/);
 const manifest=JSON.parse(await readFile(path.join(root,'exports','assets-manifest.json'),'utf8')) as Array<Record<string,string>>;
 assert.equal(manifest[0].type,'model');
});

test('existing provider task id is reused without a second paid submission',async()=>{
 let creates=0;
 const provider={createTask:async()=>{creates++;return {id:'new-task'};}} as never;
 const input={taskId:'t',variant:{id:'V1'} as never,assets:[]};
 const existing={id:'V1',name:'V1',status:'generating' as const,providerTaskId:'existing-task'};
 const reused=await getOrCreateProviderTask(provider,input,existing);
 assert.equal(reused.id,'existing-task');
 assert.equal(creates,0);
});
