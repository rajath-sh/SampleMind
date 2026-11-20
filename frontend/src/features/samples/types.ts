export interface SampleType {
  sample_type_id: number;
  type_code: string;
  type_name: string;
  description?: string;
  is_active: boolean;
}

export interface SampleListItem {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  sample_type_id: number;
  sample_type_code: string;
  sample_type_name: string;
  quantity_value: number;
  quantity_unit: string;
  sample_status: string;
  current_storage_location_id?: number;
  current_storage_location_code?: string;
  is_ancient: boolean;
  registered_at: string;
}

export interface SampleRelationshipSummary {
  relationship_id: number;
  related_sample_id: number;
  related_sample_code: string;
  related_sample_name: string;
  transformation_type: string;
  quantity_transferred?: number;
  quantity_unit?: string;
  transformed_at: string;
}

export interface StorageHistoryItem {
  storage_history_id: number;
  sample_id: number;
  storage_location_id?: number;
  location_code?: string;
  facility?: string;
  unit_label?: string;
  slot?: string;
  moved_at: string;
  moved_by_name?: string;
  reason?: string;
}

export interface SampleQCTestItem {
  sample_test_id: number;
  test_type: string;
  test_status: string;
  result_value?: number;
  result_unit?: string;
  result_interpretation?: string;
  performed_at?: string;
  created_at: string;
}

export interface SampleDetail {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  sample_type_id: number;
  sample_type_code: string;
  sample_type_name: string;
  quantity_value: number;
  quantity_unit: string;
  sample_status: string;
  source_description?: string;
  collected_at?: string;
  registered_at: string;
  updated_at: string;
  current_storage_location_id?: number;
  current_storage_location_code?: string;
  facility?: string;
  room?: string;
  slot?: string;
  created_by?: number;
  created_by_name?: string;
  notes?: string;
  is_ancient: boolean;
  ancestor_count: number;
  descendant_count: number;
  parents: SampleRelationshipSummary[];
  children: SampleRelationshipSummary[];
  qc_tests?: SampleQCTestItem[];
}

export interface SampleCreatePayload {
  sample_code: string;
  sample_name: string;
  sample_type_id: number;
  quantity_value: number;
  quantity_unit: string;
  sample_status?: string;
  source_description?: string;
  current_storage_location_id?: number;
  notes?: string;
}

export interface SampleUpdatePayload {
  sample_name?: string;
  source_description?: string;
  quantity_value?: number;
  quantity_unit?: string;
  sample_status?: string;
  current_storage_location_id?: number;
  notes?: string;
  movement_reason?: string;
}

export interface SampleDerivationPayload {
  child_sample_code: string;
  child_sample_name: string;
  child_sample_type_id: number;
  quantity_transferred: number;
  quantity_unit: string;
  transformation_type: string;
  child_storage_location_id?: number;
  notes?: string;
}

export interface SampleDerivationResponse {
  parent_sample_id: number;
  parent_sample_code: string;
  parent_remaining_quantity: number;
  parent_status: string;
  child_sample_id: number;
  child_sample_code: string;
  child_sample_name: string;
  transformation_type: string;
  relationship_id: number;
  derived_at: string;
}

export interface PaginatedSamplesResponse {
  items: SampleListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface QuantityHistoryItem {
  transaction_id?: number | null;
  transaction_type: string;
  quantity_delta: number;
  balance_after: number;
  quantity_unit: string;
  event_timestamp: string;
  performed_by_name?: string | null;
  reference_sample_id?: number | null;
  reference_sample_code?: string | null;
  reference_sample_name?: string | null;
  transformation_type?: string | null;
  notes?: string | null;
}

export interface SampleQuantityHistoryResponse {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  current_quantity: number;
  initial_quantity: number;
  quantity_unit: string;
  total_deducted: number;
  utilization_pct: number;
  derivation_count: number;
  transactions: QuantityHistoryItem[];
}

export interface ChainOfCustodyStep {
  step_number: number;
  storage_history_id?: number | null;
  event_timestamp: string;
  action_label: string;
  from_location_code?: string | null;
  to_location_code?: string | null;
  from_facility?: string | null;
  to_facility?: string | null;
  to_unit_label?: string | null;
  to_slot?: string | null;
  moved_by_name?: string | null;
  reason?: string | null;
  elapsed_time_human?: string | null;
}

export interface ChainOfCustodyResponse {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  current_location_code?: string | null;
  current_status: string;
  total_movements: number;
  steps: ChainOfCustodyStep[];
}

export interface SampleQualityMetrics {
  total_samples: number;
  available_samples: number;
  low_volume_samples: number;
  quarantined_samples: number;
  missing_samples: number;
  depleted_samples: number;
  low_volume_threshold: number;
}

export interface IntegrityAlertItem {
  rule_code: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  sample_id: number;
  sample_code: string;
  sample_name: string;
  description: string;
  remedy: string;
}

export interface SampleIntegrityAlerts {
  total_alerts: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  alerts: IntegrityAlertItem[];
}

export interface ReadinessCheckItem {
  check_id: string;
  name: string;
  passed: boolean;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  score_points: number;
  max_points: number;
  message: string;
}

export interface SampleReadiness {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  overall_status: 'READY' | 'NEEDS_REVIEW' | 'UNAVAILABLE';
  readiness_score: number;
  checks: ReadinessCheckItem[];
  recommendations: string[];
}

export interface MaterialFlowNode {
  id: string;
  label: string;
  category: 'source' | 'transformation' | 'destination';
  total_volume: number;
  sample_count: number;
  color: string;
}

export interface MaterialFlowLink {
  source_id: string;
  target_id: string;
  flow_volume: number;
  sample_count: number;
  flow_label: string;
}

export interface MaterialFlowResponse {
  nodes: MaterialFlowNode[];
  links: MaterialFlowLink[];
  total_samples: number;
  total_transformations: number;
  total_volume_processed: number;
}

export interface CryoWellSlot {
  row_label: string;
  col_label: number;
  slot_code: string;
  is_focal: boolean;
  is_occupied: boolean;
  sample_id?: number | null;
  sample_code?: string | null;
  sample_name?: string | null;
  sample_status?: string | null;
  sample_type_code?: string | null;
  quantity_value?: number | null;
  quantity_unit?: string | null;
}

export interface CryoSpatialMapResponse {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  storage_location_id?: number | null;
  location_code: string;
  facility: string;
  room?: string | null;
  unit_type: string;
  unit_label?: string | null;
  rack?: string | null;
  box?: string | null;
  temperature_celsius?: number | null;
  total_slots: number;
  occupied_slots: number;
  occupancy_pct: number;
  focal_slot_code: string;
  grid_rows: number;
  grid_cols: number;
  wells: CryoWellSlot[];
}


