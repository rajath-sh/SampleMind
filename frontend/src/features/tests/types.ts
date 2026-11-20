export interface TestListItem {
  sample_test_id: number;
  sample_id: number;
  sample_code: string;
  sample_name: string;
  sample_type_code: string;
  sample_status?: string;
  test_type: string;
  test_status: string;
  result_value?: number;
  result_unit?: string;
  result_interpretation?: string;
  performed_by_name?: string;
  requested_at?: string;
  performed_at?: string;
  created_at: string;
}

export interface TestDetail {
  sample_test_id: number;
  sample_id: number;
  sample_code: string;
  sample_name: string;
  sample_type_code: string;
  sample_type_name: string;
  sample_status: string;
  sample_storage_location?: string;
  test_type: string;
  test_status: string;
  requested_at?: string;
  performed_at?: string;
  performed_by?: number;
  performed_by_name?: string;
  observation?: string;
  result_value?: number;
  result_unit?: string;
  result_interpretation?: string;
  quantity_consumed?: number;
  sample_remaining_quantity?: number;
  sample_quarantined_by_test?: boolean;
  cancellation_reason?: string;
  created_at: string;
}

export interface TestCreatePayload {
  sample_id: number;
  test_type: string;
  test_status?: string;
  requested_at?: string;
  performed_at?: string;
  performed_by?: number;
  observation?: string;
  result_value?: number;
  result_unit?: string;
  result_interpretation?: string;
  quantity_consumed?: number;
  auto_quarantine_on_failure?: boolean;
}

export interface TestUpdatePayload {
  test_status?: string;
  performed_at?: string;
  performed_by?: number;
  observation?: string;
  result_value?: number;
  result_unit?: string;
  result_interpretation?: string;
  quantity_consumed?: number;
  auto_quarantine_on_failure?: boolean;
  cancellation_reason?: string;
}

export interface PaginatedTestsResponse {
  items: TestListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// =============================================================================
// Phase 2: Scientific Acceptance Criteria & Decision Engine
// =============================================================================

export interface QCEvaluationRequest {
  test_type: string;
  result_value: number;
  result_unit?: string;
}

export interface QCEvaluationResponse {
  test_type: string;
  result_value: number;
  result_unit?: string;
  recommended_interpretation: string;
  compliance_level: 'ACCEPTABLE' | 'CONDITIONAL' | 'REJECTED';
  confidence_score: number;
  parameter_name: string;
  reference_standard: string;
  threshold_criteria: string;
  laboratory_guidance: string;
}

// =============================================================================
// Phase 2: Multi-Assay Specimen Clearance & Certificate of Analysis (CoA)
// =============================================================================

export interface EvaluatedAssaySummary {
  sample_test_id: number;
  test_type: string;
  test_status: string;
  result_value?: number;
  result_unit?: string;
  result_interpretation?: string;
  performed_at?: string;
  performed_by_name?: string;
  tolerance_status: 'PASS' | 'FAIL' | 'BORDERLINE' | 'PENDING';
}

export interface SpecimenClearanceDossier {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  sample_type_name: string;
  sample_status: string;
  storage_location?: string;
  clearance_status: 'RELEASED_FOR_STUDY' | 'CONDITIONAL_APPROVAL' | 'REJECTED_QC_HOLD' | 'TESTING_PENDING' | 'INSUFFICIENT_TESTS';
  clearance_decision: string;
  can_release: boolean;
  total_tests_conducted: number;
  passed_tests_count: number;
  failed_tests_count: number;
  borderline_tests_count: number;
  pending_tests_count: number;
  evaluated_assays: EvaluatedAssaySummary[];
  certificate_id: string;
  certified_at: string;
  quality_specifications_met: boolean;
}

// =============================================================================
// Phase 2: Statistical Quality Control & Instrument Drift Monitoring
// =============================================================================

export interface InstrumentQCReport {
  test_type: string;
  measurement_unit?: string;
  run_count: number;
  mean_value: number;
  std_deviation: number;
  coeff_of_variation_pct: number;
  min_value: number;
  max_value: number;
  latest_reading?: number;
  latest_z_score?: number;
  warning_count_2sigma: number;
  action_count_3sigma: number;
  control_status: 'STABLE' | 'MARGINAL' | 'DRIFT_DETECTED' | 'INSUFFICIENT_DATA';
  recommended_action: string;
}

// =============================================================================
// Phase 2: High-Throughput Batch Assay Scheduling
// =============================================================================

export interface BatchTestCreatePayload {
  sample_ids: number[];
  test_type: string;
  batch_run_identifier?: string;
  quantity_consumed_per_sample?: number;
  result_unit?: string;
  observation?: string;
  requested_at?: string;
}

export interface BatchSkippedItem {
  sample_id: number;
  sample_code: string;
  reason: string;
  error_code: string;
}

export interface BatchTestCreateResponse {
  batch_run_identifier: string;
  scheduled_count: number;
  skipped_count: number;
  created_tests: TestListItem[];
  skipped_samples: BatchSkippedItem[];
}

// =============================================================================
// Phase 3: Analytical Laboratory Quality & Operational Intelligence
// =============================================================================

export interface TestTypeBreakdownItem {
  test_type: string;
  count: number;
  optimal_count: number;
  pass_count: number;
  borderline_count: number;
  fail_count: number;
}

export interface QCAlertItem {
  sample_test_id: number;
  sample_id: number;
  sample_code: string;
  test_type: string;
  result_value?: number;
  result_unit?: string;
  result_interpretation: string;
  performed_at?: string;
}

export interface TestQualityMetricsResponse {
  total_tests: number;
  completed_tests: number;
  in_progress_tests: number;
  requested_tests: number;
  cancelled_tests: number;
  pass_rate_pct: number;
  contamination_rate_pct: number;
  quarantined_samples_count: number;
  avg_turnaround_hours?: number;
  test_type_breakdown: TestTypeBreakdownItem[];
  recent_qc_alerts: QCAlertItem[];
}

