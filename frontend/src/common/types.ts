export type UserRole = 'ADMIN' | 'RESEARCHER' | 'TECHNICIAN' | 'REVIEWER' | 'VIEWER';

export type SampleStatus = 'REGISTERED' | 'IN_STORAGE' | 'IN_USE' | 'DEPLETED' | 'QUARANTINED' | 'DISPOSED' | 'MISSING';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface User {
  user_id: number;
  display_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface SampleType {
  sample_type_id: number;
  type_code: string;
  type_name: string;
  description?: string;
  is_active: boolean;
}

export interface StorageLocation {
  storage_location_id: number;
  location_code: string;
  facility: string;
  room?: string;
  unit_type: string;
  unit_label?: string;
  rack?: string;
  box?: string;
  slot?: string;
  temperature_min_c?: number;
  temperature_max_c?: number;
  is_active: boolean;
}

export interface Sample {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  sample_type_id: number;
  source_description?: string;
  collected_at?: string;
  registered_at: string;
  quantity_value: number;
  quantity_unit: string;
  sample_status: SampleStatus;
  current_storage_location_id?: number;
  created_by?: number;
  notes?: string;
  updated_at: string;
}

export interface SampleRelationship {
  relationship_id: number;
  parent_sample_id: number;
  child_sample_id: number;
  transformation_type: string;
  transformed_at: string;
  quantity_transferred?: number;
  quantity_unit?: string;
  recorded_by?: number;
  notes?: string;
}

export interface AIAnalysis {
  ai_analysis_id: number;
  sample_id: number;
  predicted_risk: RiskLevel;
  confidence: number;
  class_probabilities?: Record<string, number>;
  important_factors: Array<{ factor: string; contribution: number }> | Record<string, any>;
  model_name: string;
  model_version: string;
  feature_schema_version: string;
  analysed_at: string;
  review_feedback?: 'agree' | 'disagree' | 'needs_review';
  review_notes?: string;
}
