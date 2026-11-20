export interface LineageNodeItem {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  sample_type_code: string;
  sample_type_name: string;
  sample_status: string;
  quantity_value: number;
  quantity_unit: string;
  storage_location_code?: string;
  generation: number;
  is_root: boolean;
  is_leaf: boolean;
  is_focus: boolean;
  is_ancient: boolean;
}

export interface LineageEdgeItem {
  relationship_id: number;
  source: number;
  target: number;
  source_code: string;
  target_code: string;
  transformation_type: string;
  quantity_transferred?: number;
  quantity_unit?: string;
  transformed_at: string;
  notes?: string;
}

export interface LineageGraphResponse {
  focus_sample_id: number;
  focus_sample_code: string;
  direction: string;
  max_depth: number;
  total_nodes: number;
  total_edges: number;
  nodes: LineageNodeItem[];
  edges: LineageEdgeItem[];
}

export interface RelationshipCreatePayload {
  parent_sample_id: number;
  child_sample_id: number;
  transformation_type: string;
  quantity_transferred?: number;
  quantity_unit?: string;
  notes?: string;
}

export interface RelationshipResponse {
  relationship_id: number;
  parent_sample_id: number;
  parent_sample_code: string;
  child_sample_id: number;
  child_sample_code: string;
  transformation_type: string;
  quantity_transferred?: number;
  quantity_unit?: string;
  transformed_at: string;
  recorded_by?: number;
  notes?: string;
}
