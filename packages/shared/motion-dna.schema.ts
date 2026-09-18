import { z } from 'zod';

export const FORBIDDEN_MOTION_WORDS = [
  '自然走路',
  '高级展示',
  '优雅动作',
  '走秀风格',
  '高级感',
  '完美展示',
  '随意走动',
  '大方展示',
  'natural walk',
  'walks naturally',
  'walk naturally',
  'elegant movement',
  'luxury showcase',
  'premium feeling',
  'model walks casually',
  'moves gracefully',
] as const;

export function containsForbiddenMotionWord(text: string): string | null {
  const lower = text.toLowerCase();
  for (const word of FORBIDDEN_MOTION_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      return word;
    }
  }
  return null;
}

export function validateActionLanguage(text: string): void {
  const matched = containsForbiddenMotionWord(text);
  if (matched) {
    throw new Error(
      `动作描述包含禁止的模糊词汇 "${matched}"。必须转换为导演级可执行语言（例如：先视线转移、再转头带动肩躯干、重心转移至支撑脚、非对称手臂摆动、商品持续物理接触或惯性回落沉降）。`
    );
  }
}

export const motionEvidenceItemSchema = z.object({
  frames: z.array(z.string()),
  confidence: z.number().min(0).max(1),
}).strict().superRefine((val, ctx) => {
  if (val.confidence > 0 && val.frames.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: '有置信度的动作证据必须提供对应的帧 ID 列表 (frames)',
    });
  }
});

export const motionDimensionSchema = z.object({
  action: z.string().min(1),
  evidence: motionEvidenceItemSchema,
}).strict().superRefine((val, ctx) => {
  const isUnknown = /unknown|未知|未见|无法确认|not visible|not observable/i.test(val.action);
  if (isUnknown) {
    if (val.evidence.frames.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: '无法观察 (UNKNOWN) 的动作不得引用具体帧 ID',
      });
    }
  } else {
    const forbidden = containsForbiddenMotionWord(val.action);
    if (forbidden) {
      ctx.addIssue({
        code: 'custom',
        message: `动作描述不能包含模糊词汇 "${forbidden}"，需提供具体生理/物理运动分解`,
      });
    }
    if (val.evidence.frames.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: '具体观察动作必须提供至少一个有效证据帧 ID；如无法观察请标明 UNKNOWN',
      });
    }
  }
});

export const subjectMotionSchema = z.object({
  gait: motionDimensionSchema,
  body_posture: motionDimensionSchema,
  head_direction: motionDimensionSchema,
  eye_direction: motionDimensionSchema,
  shoulder_movement: motionDimensionSchema,
  arm_behavior: motionDimensionSchema,
  hand_interaction: motionDimensionSchema,
  weight_transfer: motionDimensionSchema,
  tempo: motionDimensionSchema,
}).strict();

export const cameraMotionSchema = z.object({
  movement: motionDimensionSchema,
  speed: motionDimensionSchema,
  tracking: motionDimensionSchema,
  stabilization: motionDimensionSchema,
}).strict();

export const emotionMotionSchema = z.object({
  facial_expression: motionDimensionSchema,
  energy_level: motionDimensionSchema,
}).strict();

export const motionDnaSchema = z.object({
  subject_motion: subjectMotionSchema,
  camera_motion: cameraMotionSchema,
  emotion: emotionMotionSchema,
}).strict();

export type MotionEvidenceItem = z.infer<typeof motionEvidenceItemSchema>;
export type MotionDimension = z.infer<typeof motionDimensionSchema>;
export type SubjectMotion = z.infer<typeof subjectMotionSchema>;
export type CameraMotion = z.infer<typeof cameraMotionSchema>;
export type EmotionMotion = z.infer<typeof emotionMotionSchema>;
export type MotionDna = z.infer<typeof motionDnaSchema>;

export function mockMotionDna(): MotionDna {
  const item = (action: string, frames: string[] = ['frame_01'], confidence = 0.85) => ({
    action,
    evidence: { frames, confidence },
  });

  return {
    subject_motion: {
      gait: item('左脚先行向前跨出半步，脚跟先着地后平滑过渡到前脚掌推进'),
      body_posture: item('躯干略微前倾约5度，脊柱保持挺直，站定前微幅下沉'),
      head_direction: item('头部向右转动约30度，转颈动作明显滞后于眼部视线'),
      eye_direction: item('视线先看向右侧镜面反射，停留约1秒后平缓移回正前方'),
      shoulder_movement: item('左肩微耸并略微后张，与右肩呈自然非对称动态'),
      arm_behavior: item('右臂随步态向前自然摆动15度，左臂屈肘持物保持相对稳定'),
      hand_interaction: item('右手拇指与食指轻触外套门襟纽扣边缘平稳滑过'),
      weight_transfer: item('身体重心自左脚后跟平滑过渡至右足弓，无突兀停滞'),
      tempo: item('4秒内完成两步中速步态，第5秒自然减速停顿定格'),
    },
    camera_motion: {
      movement: item('低机位自右向左平滑匀速横移，高度保持在腰部水平'),
      speed: item('低速移动，与人物行走与停顿速度保持平稳同步'),
      tracking: item('横向跟随主体移动，主体持续保持在画面居中偏侧三分之一处'),
      stabilization: item('轨道平稳滑行感，无手持抖动与突发加速度'),
    },
    emotion: {
      facial_expression: item('眼神专注平静，嘴角在停步时自然舒展形成微笑'),
      energy_level: item('沉稳专业导购气质，节奏克制而富有呼吸感'),
    },
  };
}
