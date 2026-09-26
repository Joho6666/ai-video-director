import type { ViralCreativeDNA } from '../shared/types';

function observed(value: unknown): unknown {
  if (typeof value === 'string') return /^unknown/i.test(value) ? 'UNKNOWN' : value;
  if (value && typeof value === 'object' && 'status' in value) {
    const evidence = value as { status?: unknown; description?: unknown; frame_ids?: unknown };
    if (String(evidence.status).toLowerCase() === 'unknown') return 'UNKNOWN';
    return { description: evidence.description, frameIds: evidence.frame_ids };
  }
  return value ?? 'UNKNOWN';
}

/** Reuse the existing Director analysis; never call the model twice. */
export function deriveCreativeDNA(referenceAnalysis: unknown, shotDNA: unknown, motionDNA: unknown): ViralCreativeDNA {
  const first = Array.isArray(referenceAnalysis) && referenceAnalysis[0] && typeof referenceAnalysis[0] === 'object' ? referenceAnalysis[0] as Record<string, unknown> : {};
  const shot = shotDNA && typeof shotDNA === 'object' ? shotDNA as Record<string, unknown> : {};
  const keep = Array.isArray(shot.keep) ? shot.keep.filter((x): x is string => typeof x === 'string') : [];
  return {
    hook: { visualTrigger: observed(first.actions), evidence: observed(first.actions), duration: 'UNKNOWN' },
    pacing: { rhythm: observed(first.rhythm), cutFrequency: 'UNKNOWN', accelerationPattern: 'UNKNOWN' },
    camera: { dominantMovement: observed(first.camera_motion), cameraHeight: observed(first.camera_position), framingProgression: observed(first.shot_size) },
    performance: { entrance: observed(first.subject_trajectory), bodyMovement: observed(first.performance), productInteraction: observed(first.commercial_intent) },
    selling: { featureDemonstration: observed(first.commercial_intent), heroMoment: 'UNKNOWN', firstProductExposure: 'UNKNOWN' },
    visualStyle: { lighting: observed(first.lighting), composition: observed(first.composition), location: observed(first.scene) },
    shotDNA, motionDNA, preserve: keep, replace: ['original person', 'original product', 'original brand', 'original captions', 'original music', 'logos and watermarks'],
  };
}
