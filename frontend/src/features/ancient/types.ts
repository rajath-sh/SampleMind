export interface SiteSummary {
  archaeological_site_id: number;
  site_code: string;
  site_name: string;
  region?: string;
  country?: string;
  context_notes?: string;
  specimen_count: number;
  created_at: string;
}

export interface SiteCreatePayload {
  site_code: string;
  site_name: string;
  region?: string;
  country?: string;
  context_notes?: string;
}

export interface SiteUpdatePayload {
  site_name?: string;
  region?: string;
  country?: string;
  context_notes?: string;
}

export interface AncientSpecimenListItem {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  sample_type_code: string;
  status: string;
  archaeological_site_id?: number;
  site_code?: string;
  site_name?: string;
  country?: string;
  estimated_age_years?: number;
  age_uncertainty_years?: number;
  dating_method?: string;
  preservation_state?: string;
  excavation_layer?: string;
}

export interface AncientSpecimenDetail {
  sample_id: number;
  sample_code: string;
  sample_name: string;
  sample_type_code: string;
  sample_type_name?: string;
  storage_location_code?: string;
  status: string;
  source_description?: string;
  archaeological_site_id?: number;
  site_code?: string;
  site_name?: string;
  region?: string;
  country?: string;
  estimated_age_years?: number;
  age_uncertainty_years?: number;
  dating_method?: string;
  excavation_layer?: string;
  depth_cm?: number;
  preservation_state?: string;
  context_reference?: string;
}

export interface AncientSpecimenCreatePayload {
  sample_id: number;
  archaeological_site_id?: number;
  estimated_age_years?: number;
  age_uncertainty_years?: number;
  dating_method?: string;
  excavation_layer?: string;
  depth_cm?: number;
  preservation_state?: string;
  context_reference?: string;
}

export interface AncientSpecimenUpdatePayload {
  archaeological_site_id?: number;
  estimated_age_years?: number;
  age_uncertainty_years?: number;
  dating_method?: string;
  excavation_layer?: string;
  depth_cm?: number;
  preservation_state?: string;
  context_reference?: string;
}
