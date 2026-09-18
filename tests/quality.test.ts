import test from 'node:test';
import assert from 'node:assert/strict';
import { qcFrameCount, validateVisualQuality, evaluateQualitySkill } from '../packages/skills/quality';
import type { Variant } from '../packages/shared/types';

function result(){return {dimensions:{motion_naturalness:22,human_feeling:22,product_fidelity:22,camera_execution:22},evidence:['motion_naturalness','human_feeling','product_fidelity','camera_execution'].map(dimension=>({dimension,description:'Visible frame comparison',status:'observed',severity:'none',confidence:'high',frame_ids:['qc_frame_01'],reference_ids:dimension==='product_fidelity'?['product_01']:[]})),recommendations:[]};}
const validate=(value:unknown)=>validateVisualQuality(value,new Set(['qc_frame_01']),new Set(['product_01']),'V1',0);
test('QC frames bounded to 16 / 24',()=>{assert.equal(qcFrameCount(10),16);assert.equal(qcFrameCount(10.1),24);assert.equal(qcFrameCount(120),24);});
test('QC server computes score, pass and retry',()=>{const report=validate(result());assert.equal(report.overall_score,88);assert.equal(report.passed,true);assert.equal(report.retry_required,false);assert.equal(report.evaluation_mode,'visual');const bad=result();bad.evidence[0].severity='high';const failure=validate(bad);assert.equal(failure.passed,false);assert.equal(failure.retry_required,true);});
test('QC rejects fabricated image evidence and model computed pass',()=>{const bad=result();bad.evidence[0].frame_ids=['qc_frame_99'];assert.throws(()=>validate(bad),/unknown image/);assert.throws(()=>validate({...result(),passed:true}));});
test('QC uncertain cannot prove a defect or trigger paid retry',()=>{const uncertain=result();Object.assign(uncertain.evidence[0],{status:'uncertain',severity:'none',confidence:'low',frame_ids:[]});const report=validate(uncertain);assert.equal(report.passed,false);assert.equal(report.retry_required,false);uncertain.evidence[0].severity='high';assert.throws(()=>validate(uncertain));});
test('non-critical uncertain detail can coexist with observed evidence for its dimension',()=>{const value=result();value.evidence.push({dimension:'motion_naturalness',description:'A small hand detail is uncertain',status:'uncertain',severity:'none',confidence:'low',frame_ids:[],reference_ids:[]});const report=validate(value);assert.equal(report.passed,true);assert.equal(report.retry_required,false);});
test('QC requires reference image for product comparison and evidence for every dimension',()=>{const bad=result();bad.evidence[2].reference_ids=[];assert.throws(()=>validate(bad));const missing=result();missing.evidence[2]=missing.evidence[1];assert.throws(()=>validate(missing),/four dimensions/);});
test('QC live rejects simulations and missing key without fake scoring',async()=>{const variant={id:'V1'} as Variant;await assert.rejects(evaluateQualitySkill('unused',variant,0,{simulatedScore:100}),/forbidden/);await assert.rejects(evaluateQualitySkill('unused',variant,0,{env:{}}),/UNAVAILABLE/);const demo=await evaluateQualitySkill('unused',variant,0,{mode:'mock',simulatedScore:80});assert.equal(demo.evaluation_mode,'mock');});

test('Quality Agent v2 supports canonical dimensions and calculates reference similarity score', () => {
  const v2Raw = {
    dimensions: {
      motion_naturalness: 24,
      human_realism: 23,
      product_consistency: 22,
      commercial_quality: 21,
    },
    reference_similarity: {
      camera_similarity: 22,
      motion_similarity: 21,
      composition_similarity: 20,
      product_presentation_similarity: 23,
    },
    evidence: [
      { dimension: 'motion_naturalness', description: 'Gait is smooth with natural arm swing', status: 'observed', severity: 'none', confidence: 'high', frame_ids: ['qc_frame_01'], reference_ids: ['ref_frame_01'] },
      { dimension: 'human_realism', description: 'Relaxed facial expression with gaze leading turn', status: 'observed', severity: 'none', confidence: 'high', frame_ids: ['qc_frame_01'], reference_ids: [] },
      { dimension: 'product_consistency', description: 'Product silhouette matches reference product_01', status: 'observed', severity: 'none', confidence: 'high', frame_ids: ['qc_frame_01'], reference_ids: ['product_01'] },
      { dimension: 'commercial_quality', description: 'Camera tracks waistline steadily', status: 'observed', severity: 'none', confidence: 'high', frame_ids: ['qc_frame_01'], reference_ids: ['ref_frame_01'] },
    ],
    recommendations: ['Keep product focus clear'],
  };

  const frameIds = new Set(['qc_frame_01']);
  const referenceIds = new Set(['product_01', 'ref_frame_01']);
  const report = validateVisualQuality(v2Raw, frameIds, referenceIds, 'V1', 0);

  assert.equal(report.dimensions.motion_naturalness, 24);
  assert.equal(report.dimensions.human_realism, 23);
  assert.equal(report.dimensions.product_consistency, 22);
  assert.equal(report.dimensions.commercial_quality, 21);
  assert.equal(report.overall_score, 90);
  assert.equal(report.passed, true);
  assert.equal(report.reference_similarity_score, 86);
  assert.equal(report.reference_similarity?.camera_similarity, 22);
  assert.equal(report.reference_similarity?.motion_similarity, 21);
});