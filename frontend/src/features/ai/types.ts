export interface ModelRegistryInfo {
  model_registry_id: number;
  model_name: string;
  model_version: string;
  artifact_uri: string;
  trained_at: string;
  training_data_version: string;
  feature_schema_version: string;
  metrics: { method?: string };
  is_active: boolean;
}

export interface ContributingFactor {
  factor: string;
  weight: number;
  impact: 'risk_increasing' | 'risk_mitigating' | 'neutral';
  detail: string;
}

export interface AIAnalysisResponse {
  ai_analysis_id: number;
  sample_id: number;
  sample_code: string;
  sample_name: string;
  predicted_risk: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number | null;
  class_probabilities: Record<string, number>;
  legacy: boolean;
  important_factors: ContributingFactor[];
  model_name: string;
  model_version: string;
  feature_schema_version: string;
  analysed_at: string;
  reviewed_by?: number;
  reviewed_by_name?: string;
  reviewed_at?: string;
  review_feedback?: 'agree' | 'disagree' | 'needs_review';
  review_notes?: string;
  input_snapshot?: Record<string, unknown>;
}

export interface AIReviewPayload {
  review_feedback: 'agree' | 'disagree' | 'needs_review';
  review_notes: string;
}

export interface RiskDistributionResponse {
  total_samples: number;
  assessed_samples: number;
  unassessed_samples: number;
  counts: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
  };
  percentages: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
  };
}
