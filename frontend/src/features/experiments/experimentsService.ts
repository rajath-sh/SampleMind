import { apiRequest } from '../../common/apiClient';
import {
  ExperimentDetail,
  ResultDetail,
  ExperimentCreatePayload,
  ExperimentUpdatePayload,
  ExperimentSampleAttachPayload,
  ResultCreatePayload,
  ResultVerifyPayload,
  PaginatedExperimentsResponse,
  PaginatedResultsResponse,
} from './types';

interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export const experimentsService = {
  async listExperiments(params?: {
    status?: string;
    leadResearcherId?: number;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedExperimentsResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.leadResearcherId) query.append('lead_researcher_id', params.leadResearcherId.toString());
    if (params?.search) query.append('search', params.search);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('page_size', params.pageSize.toString());

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<PaginatedExperimentsResponse>(`/experiments${qs}`);
    return res;
  },

  async getExperimentDetail(experimentId: number): Promise<ExperimentDetail> {
    const res = await apiRequest<ApiResponseEnvelope<ExperimentDetail>>(`/experiments/${experimentId}`);
    return res.data;
  },

  async createExperiment(payload: ExperimentCreatePayload): Promise<ExperimentDetail> {
    const res = await apiRequest<ApiResponseEnvelope<ExperimentDetail>>('/experiments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async updateExperiment(experimentId: number, payload: ExperimentUpdatePayload): Promise<ExperimentDetail> {
    const res = await apiRequest<ApiResponseEnvelope<ExperimentDetail>>(`/experiments/${experimentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async attachSample(experimentId: number, payload: ExperimentSampleAttachPayload): Promise<boolean> {
    const res = await apiRequest<ApiResponseEnvelope<boolean>>(`/experiments/${experimentId}/samples`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async attachEquipment(experimentId: number, payload: { equipment_id: number; usage_notes?: string }): Promise<boolean> {
    const res = await apiRequest<ApiResponseEnvelope<boolean>>(`/experiments/${experimentId}/equipment`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async getExperimentResults(experimentId: number): Promise<ResultDetail[]> {
    const res = await apiRequest<ApiResponseEnvelope<ResultDetail[]>>(`/experiments/${experimentId}/results`);
    return res.data || [];
  },

  async createResult(experimentId: number, payload: ResultCreatePayload): Promise<ResultDetail> {
    const res = await apiRequest<ApiResponseEnvelope<ResultDetail>>(`/experiments/${experimentId}/results`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async listResults(params?: {
    sampleId?: number;
    experimentId?: number;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResultsResponse> {
    const query = new URLSearchParams();
    if (params?.sampleId) query.append('sample_id', params.sampleId.toString());
    if (params?.experimentId) query.append('experiment_id', params.experimentId.toString());
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('page_size', params.pageSize.toString());

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<PaginatedResultsResponse>(`/results${qs}`);
    return res;
  },

  async verifyResult(resultId: number, payload: ResultVerifyPayload): Promise<ResultDetail> {
    const res = await apiRequest<ApiResponseEnvelope<ResultDetail>>(`/results/${resultId}/verify`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async updateResult(resultId: number, payload: {
    result_title?: string;
    result_value?: number;
    result_unit?: string;
    interpretation?: string;
    observation?: string;
    is_final?: boolean;
  }): Promise<ResultDetail> {
    const res = await apiRequest<ApiResponseEnvelope<ResultDetail>>(`/results/${resultId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async deleteExperiment(experimentId: number): Promise<boolean> {
    const res = await apiRequest<ApiResponseEnvelope<boolean>>(`/experiments/${experimentId}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  async deleteResult(resultId: number): Promise<boolean> {
    const res = await apiRequest<ApiResponseEnvelope<boolean>>(`/results/${resultId}`, {
      method: 'DELETE',
    });
    return res.data;
  },
};
