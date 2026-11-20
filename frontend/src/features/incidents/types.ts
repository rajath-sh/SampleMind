export interface IncidentListItem {
  incident_id: number;
  incident_code: string;
  incident_type: string;
  severity: string;
  status: string;
  description: string;
  sample_id?: number;
  sample_code?: string;
  sample_name?: string;
  storage_location_id?: number;
  storage_location_code?: string;
  occurred_at: string;
  reported_at: string;
  reported_by_name?: string;
  assigned_to_name?: string;
}

export interface IncidentDetail {
  incident_id: number;
  incident_code: string;
  incident_type: string;
  severity: string;
  status: string;
  description: string;
  occurred_at: string;
  reported_at: string;
  reported_by: number;
  reported_by_name?: string;
  assigned_to?: number;
  assigned_to_name?: string;
  sample_id?: number;
  sample_code?: string;
  sample_name?: string;
  sample_status?: string;
  storage_location_id?: number;
  storage_location_code?: string;
  resolution_notes?: string;
  closed_at?: string;
}

export interface IncidentCreatePayload {
  incident_code: string;
  sample_id?: number;
  storage_location_id?: number;
  incident_type: string;
  severity: string;
  description: string;
  occurred_at: string;
  assigned_to?: number;
  quarantine_descendants?: boolean;
}

export interface IncidentUpdatePayload {
  status?: string;
  severity?: string;
  assigned_to?: number;
  resolution_notes?: string;
  closed_at?: string;
}

export interface BlastRadiusSampleItem {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  generation_distance: number;
  transformation_type: string;
  current_status: string;
  storage_location_code?: string;
}

export interface BlastRadiusExperimentItem {
  experiment_id: number;
  experiment_code: string;
  experiment_name: string;
  status: string;
  usage_role: string;
  associated_sample_code: string;
}

export interface BlastRadiusResultItem {
  experiment_result_id: number;
  result_code: string;
  result_title: string;
  experiment_code: string;
  observation?: string;
  result_value?: number;
  result_unit?: string;
  interpretation?: string;
  is_final: boolean;
}

export interface IncidentBlastRadiusResponse {
  incident_id: number;
  incident_code: string;
  root_sample_id?: number;
  root_sample_code?: string;
  severity: string;
  downstream_samples: BlastRadiusSampleItem[];
  affected_experiments: BlastRadiusExperimentItem[];
  affected_results: BlastRadiusResultItem[];
  total_samples_at_risk: number;
  total_experiments_compromised: number;
  total_results_tainted: number;
  max_generation_depth: number;
}

export interface PaginatedIncidentsResponse {
  items: IncidentListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
