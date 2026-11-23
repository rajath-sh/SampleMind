import { apiRequest } from '../../common/apiClient';
import {
  IncidentDetail,
  IncidentCreatePayload,
  IncidentUpdatePayload,
  IncidentBlastRadiusResponse,
  PaginatedIncidentsResponse,
} from './types';

interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export const incidentsService = {
  async listIncidents(params?: {
    severity?: string;
    status?: string;
    sampleId?: number;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedIncidentsResponse> {
    const query = new URLSearchParams();
    if (params?.severity) query.append('severity', params.severity);
    if (params?.status) query.append('status', params.status);
    if (params?.sampleId) query.append('sample_id', params.sampleId.toString());
    if (params?.search) query.append('search', params.search);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('page_size', params.pageSize.toString());

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<PaginatedIncidentsResponse>(`/incidents${qs}`);
    return res;
  },

  async getIncident(incidentId: number): Promise<IncidentDetail> {
    const res = await apiRequest<ApiResponseEnvelope<IncidentDetail>>(`/incidents/${incidentId}`);
    return res.data;
  },

  async createIncident(payload: IncidentCreatePayload): Promise<IncidentDetail> {
    const res = await apiRequest<ApiResponseEnvelope<IncidentDetail>>('/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async updateIncident(incidentId: number, payload: IncidentUpdatePayload): Promise<IncidentDetail> {
    const res = await apiRequest<ApiResponseEnvelope<IncidentDetail>>(`/incidents/${incidentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async deleteIncident(incidentId: number): Promise<{ incident_id: number; deleted: boolean }> {
    const res = await apiRequest<ApiResponseEnvelope<{ incident_id: number; deleted: boolean }>>(`/incidents/${incidentId}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  async getDownstreamImpact(incidentId: number): Promise<IncidentBlastRadiusResponse> {
    const res = await apiRequest<ApiResponseEnvelope<IncidentBlastRadiusResponse>>(`/incidents/${incidentId}/downstream-impact`);
    return res.data;
  },
};
