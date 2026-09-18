export type BenchmarkCategory = 'womenswear' | 'beauty' | 'food' | 'digital' | 'lifestyle';

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
}

export interface EvaluationScores {
  motion_naturalness: number; // 0-25
  human_realism: number;      // 0-25
  product_consistency: number;// 0-25
  commercial_quality: number; // 0-25
  director_score: number;     // 0-100
}

export interface BenchmarkComparisonResult {
  case_id: string;
  case_name: string;
  category: BenchmarkCategory;
  baseline_scores: EvaluationScores;
  director_scores: EvaluationScores;
  score_delta: number;
  motion_delta: number;
  human_delta: number;
  product_delta: number;
  camera_delta: number;
  highlights: string[];
}