export type BenchmarkCategory = 'womenswear' | 'beauty' | 'food' | 'digital' | 'lifestyle';

export type BenchmarkMode = 'synthetic' | 'real' | 'motion_ablation' | 'retry';

export type BenchmarkOutcome = 'PROMISING' | 'MARGINAL IMPROVEMENT' | 'NO VERIFIED ADVANTAGE';

export interface BenchmarkCase {
  id: string;
  category: BenchmarkCategory;
  name: string;
  description: string;
  requirement: string;
  target_features: string[];
  baseline_prompt: string;
  director_config: {
    reference_motion_focus: string;
    showcases: Array<{ feature: string; action: string; camera_focus: string }>;
  };
  reference_video?: string;
  model_image?: string;
  product_image?: string;
}

export interface EvaluationScores {
  motion_naturalness: number; // 0-25
  human_realism: number;      // 0-25
  product_consistency: number;// 0-25
  commercial_quality: number; // 0-25
  director_score: number;     // 0-100
}

export interface CaseComparison {
  case_id: string;
  case_name: string;
  category: BenchmarkCategory;
  baseline: {
    score: number;
    dimensions: EvaluationScores;
    reference_similarity: number;
    issues?: string[];
  };
  director: {
    score: number;
    dimensions: EvaluationScores;
    reference_similarity: number;
    issues?: string[];
  };
  delta: number;
  motion_delta: number;
  human_delta: number;
  product_delta: number;
  camera_delta: number;
  reference_similarity_delta: number;
  winner: 'baseline' | 'director' | 'tie';
  highlights: string[];
  /** v1.2 compatibility fields retained for existing consumers. */
  baseline_scores: EvaluationScores;
  director_scores: EvaluationScores;
  score_delta: number;
}

// Backward compatibility alias for v1.2
export type BenchmarkComparisonResult = CaseComparison;

export interface BlindAssignment {
  case_id: string;
  video_A_arm: 'baseline' | 'director';
  video_B_arm: 'baseline' | 'director';
}

export interface BenchmarkRunManifest {
  run_id: string;
  created_at: string;
  mode: BenchmarkMode;
  provider: string;
  model: string;
  duration: number;
  resolution: string;
  cases: Array<{
    case_id: string;
    baseline_prompt_hash: string;
    director_prompt_hash: string;
    asset_hashes: Record<string, string>;
    generation_task_ids?: {
      baseline?: string;
      director?: string;
    };
    blind_assignment: BlindAssignment;
  }>;
}

export type FailureCategory =
  | 'sliding_feet'
  | 'robotic_arm'
  | 'finger_distortion'
  | 'product_morph'
  | 'unnatural_turn'
  | 'camera_jump'
  | 'other';

export interface FailureRecord {
  failure_id: string;
  case_id: string;
  timestamp: string;
  provider: string;
  model: string;
  prompt_version: 'baseline' | 'director_v1' | 'retry_1' | 'retry_2' | string;
  video_sha256?: string;
  issues: Array<{
    category: FailureCategory;
    description: string;
    frame_ids?: string[];
  }>;
  severity: 'low' | 'medium' | 'high';
}

export interface FailureStats {
  total_failures: number;
  by_category: Record<FailureCategory, { count: number; percentage: number }>;
}

export interface BenchmarkSuiteResult {
  mode: BenchmarkMode;
  run_id: string;
  timestamp: string;
  provider: string;
  model: string;
  cases: CaseComparison[];
  average_baseline_score: number;
  average_director_score: number;
  average_delta: number;
  outcome: BenchmarkOutcome;
  report_markdown: string;
  status: 'COMPLETED' | 'UNAVAILABLE' | 'FAILED';
  error?: string;
}
