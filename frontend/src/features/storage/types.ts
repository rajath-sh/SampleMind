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
  sample_count: number;
}

export interface SampleBriefInStorage {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  sample_status: string;
  quantity_value: number;
  quantity_unit: string;
}

export interface StorageLocationWithSamples extends StorageLocation {
  samples: SampleBriefInStorage[];
}

export interface BoxOccupancySlot {
  storage_location_id: number;
  location_code: string;
  specimens: SampleBriefInStorage[];
  slot: string;
  occupied: boolean;
  sample_id?: number;
  sample_code?: string;
  sample_name?: string;
  sample_status?: string;
}

export interface OccupancyGridResponse {
  unit_label: string;
  rack?: string;
  box?: string;
  total_slots: number;
  occupied_slots: number;
  available_slots: number;
  occupancy_percentage: number;
  slots: BoxOccupancySlot[];
}

export interface Equipment {
  equipment_id: number;
  equipment_code: string;
  equipment_name: string;
  manufacturer?: string;
  model_number?: string;
  equipment_status: string;
  last_calibrated_at?: string;
  calibration_due_at?: string;
  notes?: string;
}

export interface EquipmentCreatePayload {
  equipment_code: string;
  equipment_name: string;
  manufacturer?: string;
  model_number?: string;
  equipment_status?: string;
  notes?: string;
}

export interface StorageLocationCreatePayload {
  location_code: string;
  facility: string;
  room?: string;
  unit_type?: string;
  unit_label?: string;
  rack?: string;
  box?: string;
  slot?: string;
  temperature_min_c?: number;
  temperature_max_c?: number;
}

export interface StorageLocationUpdatePayload {
  facility?: string;
  room?: string;
  unit_type?: string;
  unit_label?: string;
  rack?: string;
  box?: string;
  slot?: string;
  temperature_min_c?: number;
  temperature_max_c?: number;
  is_active?: boolean;
}

export interface EquipmentUpdatePayload {
  equipment_name?: string;
  manufacturer?: string;
  model_number?: string;
  equipment_status?: string;
  notes?: string;
  last_calibrated_at?: string;
  calibration_due_at?: string;
}
