export interface ActivityFeedItem {
  audit_log_id: number;
  actor_name: string;
  actor_role?: string;
  action: string;
  entity_type: string;
  entity_id?: number;
  occurred_at: string;
  details?: Record<string, any>;
}

export interface DashboardMetrics {
  total_samples: number;
  active_samples: number;
  quarantined_samples: number;
  depleted_samples: number;
  total_storage_locations: number;
  occupied_storage_locations: number;
  storage_occupancy_percent: number;
  total_equipment: number;
  equipment_in_use: number;
  total_experiments: number;
  active_experiments: number;
  total_tests: number;
  tests_passed: number;
  tests_failed: number;
  open_incidents: number;
  critical_incidents: number;
  high_risk_ai_predictions: number;
  pending_ai_reviews: number;
  ancient_specimens_count: number;
  recent_activities: ActivityFeedItem[];
}

export interface SampleTypeDistribution {
  sample_type_id: number;
  type_code: string;
  type_name: string;
  sample_count: number;
  total_quantity: number;
  percentage_of_total: number;
}

export interface StorageOccupancyItem {
  facility: string;
  unit_type: string;
  total_locations: number;
  occupied_locations: number;
  available_locations: number;
  occupancy_percentage: number;
}

export interface IncidentTrendItem {
  severity: string;
  count: number;
  open_count: number;
  resolved_count: number;
  percentage: number;
}

export interface ExperimentOutcomeReport {
  status: string;
  count: number;
  results_count: number;
  finalized_results_count: number;
}

// ==============================================================================
// Overview Command Centre Enhanced Types
// ==============================================================================

export interface OverviewKpiData {
  total_samples: number;
  active_samples: number;
  quarantined_samples: number;
  depleted_samples: number;
  total_storage_locations: number;
  occupied_storage_locations: number;
  storage_occupancy_percent: number;
  total_equipment: number;
  equipment_in_use: number;
  total_experiments: number;
  active_experiments: number;
  total_tests: number;
  tests_passed: number;
  tests_failed: number;
  qc_pass_rate_percent: number;
  open_incidents: number;
  critical_incidents: number;
  high_risk_ai_predictions: number;
  pending_ai_reviews: number;
  ancient_specimens_count: number;
  total_results: number;
  locked_results: number;
  draft_results: number;
  calculation_period: string;
  last_refreshed_at: string;
}

export interface WorkflowStageMetric {
  stage_key: string;
  stage_name: string;
  count: number;
  unit_label: string;
  description: string;
  conversion_rate_percent?: number;
  dropoff_count?: number;
  active_subcount?: number;
  subcount_label?: string;
}

export interface WorkflowPulseData {
  stages: WorkflowStageMetric[];
  pipeline_summary: string;
  generated_at: string;
}

export interface IntegrityFinding {
  rule_id: string;
  rule_name: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  category: string;
  entity_type: string;
  record_id?: number;
  record_code?: string;
  description: string;
  root_cause_explanation: string;
  suggested_remedy: string;
  action_route: string;
}

export interface IntegrityCategoryScore {
  category: string;
  total_checks: number;
  passed: number;
  warnings: number;
  errors: number;
  compliance_score_percent: number;
}

export interface IntegrityScanData {
  scan_id: string;
  scanned_at: string;
  total_checks_performed: number;
  passed_checks: number;
  warning_checks: number;
  error_checks: number;
  overall_integrity_status: 'OPTIMAL' | 'ATTENTION_REQUIRED' | 'DEVIANT';
  category_scores: IntegrityCategoryScore[];
  findings: IntegrityFinding[];
}

export interface OperationalStatusData {
  api_status: string;
  database_engine: string;
  database_mode: string;
  total_relations: number;
  relations_verified: boolean;
  ping_latency_ms: number;
  last_scan_timestamp?: string;
  uptime_seconds: number;
  server_time: string;
}

export interface DatabaseInsightData {
  metric_key: string;
  metric_title: string;
  entity_name: string;
  target_table: string;
  sql_query: string;
  query_plan_summary: string;
  relational_concept: string;
  join_explanation?: string;
  count_inflation_risk_explanation?: string;
  performance_notes: string;
  example_output: Record<string, any>;
}
