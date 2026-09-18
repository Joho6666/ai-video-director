import test from 'node:test';
import assert from 'node:assert/strict';
import {
  motionDnaSchema,
  containsForbiddenMotionWord,
  validateActionLanguage,
  type MotionDna,
} from '../packages/shared/motion-dna.schema';

function sampleValidMotionDna(): MotionDna {
  const item = (action: string, frames: string[] = ['frame_01'], confidence = 0.85) => ({
    action,
    evidence: { frames, confidence },
  });

  return {
    subject_motion: {
      gait: item('左脚先行向前跨出半步，脚跟先着地后过渡到前脚掌'),
      body_posture: item('躯干前倾约5度，脊柱保持挺直，站定时微幅下沉'),
      head_direction: item('头部向右转动约30度，转颈动作滞后于视线'),
      eye_direction: item('视线先看向右侧镜面，停留1秒后收回正前方'),
      shoulder_movement: item('左肩微耸并略微后张，与右肩呈非对称形态'),
      arm_behavior: item('右臂随步态向前摆动15度，左臂屈肘持物保持稳定'),
      hand_interaction: item('右手拇指与食指轻触外套门襟纽扣边缘滑过'),
      weight_transfer: item('重心自左脚后跟平滑过渡至右足弓，换步无停滞滑步'),
      tempo: item('4秒内完成两步中速步态，第5秒减速停顿定格'),
    },
    camera_motion: {
      movement: item('低机位自左向右匀速平移，高度保持在腰部水平'),
      speed: item('低速移动，与人物行走速度保持绝对同步'),
      tracking: item('横向跟随主体移动，主体持续保持在画面右三分之一处'),
      stabilization: item('轨道平稳滑行，无手持呼吸晃动'),
    },
    emotion: {
      facial_expression: item('眼神专注平静，嘴角在停步时自然舒展微笑'),
      energy_level: item('沉稳专业导购气质，节奏克制而富有呼吸感'),
    },
  };
}

test('Motion DNA v2 passes valid actionable structured data', () => {
  const data = sampleValidMotionDna();
  assert.equal(motionDnaSchema.safeParse(data).success, true);
});

test('Motion DNA v2 rejects forbidden vague phrasing', () => {
  const data = sampleValidMotionDna();
  data.subject_motion.gait.action = '模特自然走路展示衣服';
  assert.equal(containsForbiddenMotionWord(data.subject_motion.gait.action), '自然走路');
  assert.throws(
    () => validateActionLanguage(data.subject_motion.gait.action),
    /包含禁止的模糊词汇/
  );
  const result = motionDnaSchema.safeParse(data);
  assert.equal(result.success, false);
});

test('Motion DNA v2 rejects observed actions missing frame evidence', () => {
  const data = sampleValidMotionDna();
  data.subject_motion.hand_interaction.evidence.frames = [];
  const result = motionDnaSchema.safeParse(data);
  assert.equal(result.success, false);
});

test('Motion DNA v2 rejects UNKNOWN action citing frame evidence', () => {
  const data = sampleValidMotionDna();
  data.subject_motion.hand_interaction.action = 'UNKNOWN: 画面被遮挡无法观察';
  data.subject_motion.hand_interaction.evidence.frames = ['frame_05'];
  const result = motionDnaSchema.safeParse(data);
  assert.equal(result.success, false);
});

test('Motion DNA v2 accepts legitimate UNKNOWN action with empty frames', () => {
  const data = sampleValidMotionDna();
  data.subject_motion.hand_interaction.action = 'UNKNOWN: 手部动作在抽样帧中被柜台遮挡未见';
  data.subject_motion.hand_interaction.evidence.frames = [];
  data.subject_motion.hand_interaction.evidence.confidence = 0;
  const result = motionDnaSchema.safeParse(data);
  assert.equal(result.success, true);
});