export interface ExperimentSampleItem {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  sample_type_code: string;
  usage_role: string;
  quantity_used?: number;
  quantity_unit?: string;
  added_at: string;
  notes?: string;
}

export interface ExperimentEquipmentItem {
  experiment_equipment_id: number;
  equipment_id: number;
  equipment_code: string;
  equipment_name: string;
  equipment_status: string;
  usage_notes?: string;
}

export interface ResultDetail {
  experiment_result_id: number;
  experiment_id: number;
  experiment_code: string;
  result_code: string;
  result_title: string;
  observation?: string;
  result_value?: number;
  result_unit?: string;
  interpretation?: string;
  recorded_by?: number;
  recorded_by_name?: string;
  recorded_at: string;
  is_final: boolean;
}

export interface ExperimentListItem {
  experiment_id: number;
  experiment_code: string;
  experiment_name: string;
  protocol_reference?: string;
  status: string;
  lead_researcher_name?: string;
  sample_count: number;
  equipment_count: number;
  result_count: number;
  planned_start?: string;
  planned_end?: string;
  created_at: string;
}

export interface ExperimentDetail {
  experiment_id: number;
  experiment_code: string;
  experiment_name: string;
  objective?: string;
  protocol_reference?: string;
  created_by: number;
  created_by_name?: string;
  lead_researcher_id?: number;
  lead_researcher_name?: string;
  status: string;
  planned_start?: string;
  planned_end?: string;
  actual_start?: string;
  actual_end?: string;
  created_at: string;
  samples: ExperimentSampleItem[];
  equipment: ExperimentEquipmentItem[];
  results: ResultDetail[];
}

export interface ExperimentCreatePayload {
  experiment_code: string;
  experiment_name: string;
  objective?: string;
  protocol_reference?: string;
  lead_researcher_id?: number;
  status?: string;
  samples?: {
    sample_id: number;
    usage_role: string;
    quantity_used?: number;
    quantity_unit?: string;
    notes?: string;
  }[];
  equipment_ids?: number[];
}

export interface ExperimentUpdatePayload {
  experiment_name?: string;
  objective?: string;
  protocol_reference?: string;
  lead_researcher_id?: number;
  status?: string;
}

export interface ExperimentSampleAttachPayload {
  sample_id: number;
  usage_role?: string;
  quantity_used?: number;
  quantity_unit?: string;
  notes?: string;
}

export interface ResultCreatePayload {
  result_code: string;
  result_title: string;
  observation?: string;
  result_value?: number;
  result_unit?: string;
  interpretation?: string;
  is_final?: boolean;
}

export interface ResultVerifyPayload {
  is_final: boolean;
  verification_notes?: string;
}

export interface PaginatedExperimentsResponse {
  items: ExperimentListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PaginatedResultsResponse {
  items: ResultDetail[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
