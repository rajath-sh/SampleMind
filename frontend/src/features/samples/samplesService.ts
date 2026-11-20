import { apiRequest } from '../../common/apiClient';
import {
  SampleType,
  SampleDetail,
  StorageHistoryItem,
  SampleCreatePayload,
  SampleUpdatePayload,
  SampleDerivationPayload,
  SampleDerivationResponse,
  PaginatedSamplesResponse,
  SampleQuantityHistoryResponse,
  ChainOfCustodyResponse,
  SampleQualityMetrics,
  SampleIntegrityAlerts,
  SampleReadiness,
  MaterialFlowResponse,
  CryoSpatialMapResponse,
} from './types';

interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export const samplesService = {
  async listSampleTypes(): Promise<SampleType[]> {
    const res = await apiRequest<ApiResponseEnvelope<SampleType[]>>('/samples/types');
    return res.data || [];
  },

  async listSamples(params?: {
    search?: string;
    typeId?: number;
    status?: string;
    lowVolumeOnly?: boolean;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedSamplesResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.typeId) query.append('type_id', params.typeId.toString());
    if (params?.status) query.append('status', params.status);
    if (params?.lowVolumeOnly) query.append('low_volume_only', 'true');
    if (params?.sortBy) query.append('sort_by', params.sortBy);
    if (params?.sortDir) query.append('sort_dir', params.sortDir);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('page_size', params.pageSize.toString());

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<PaginatedSamplesResponse>(`/samples${qs}`);
    return res;
  },

  async getSampleDetail(sampleId: number): Promise<SampleDetail> {
    const res = await apiRequest<ApiResponseEnvelope<SampleDetail>>(`/samples/${sampleId}`);
    return res.data;
  },

  async createSample(payload: SampleCreatePayload): Promise<SampleDetail> {
    const res = await apiRequest<ApiResponseEnvelope<SampleDetail>>('/samples', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async updateSample(sampleId: number, payload: SampleUpdatePayload): Promise<SampleDetail> {
    const res = await apiRequest<ApiResponseEnvelope<SampleDetail>>(`/samples/${sampleId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async deriveChildSample(sampleId: number, payload: SampleDerivationPayload): Promise<SampleDerivationResponse> {
    const res = await apiRequest<ApiResponseEnvelope<SampleDerivationResponse>>(`/samples/${sampleId}/derive`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async getStorageHistory(sampleId: number): Promise<StorageHistoryItem[]> {
    const res = await apiRequest<ApiResponseEnvelope<StorageHistoryItem[]>>(`/samples/${sampleId}/storage-history`);
    return res.data || [];
  },

  async getQuantityHistory(sampleId: number): Promise<SampleQuantityHistoryResponse> {
    const res = await apiRequest<ApiResponseEnvelope<SampleQuantityHistoryResponse>>(`/samples/${sampleId}/quantity-history`);
    return res.data;
  },

  async getChainOfCustody(sampleId: number): Promise<ChainOfCustodyResponse> {
    const res = await apiRequest<ApiResponseEnvelope<ChainOfCustodyResponse>>(`/samples/${sampleId}/chain-of-custody`);
    return res.data;
  },

  async getQualityMetrics(threshold: number = 10.0): Promise<SampleQualityMetrics> {
    const res = await apiRequest<ApiResponseEnvelope<SampleQualityMetrics>>(`/samples/metrics/quality-summary?threshold=${threshold}`);
    return res.data;
  },

  async getIntegrityAlerts(): Promise<SampleIntegrityAlerts> {
    const res = await apiRequest<ApiResponseEnvelope<SampleIntegrityAlerts>>('/samples/metrics/integrity-alerts');
    return res.data;
  },

  async getSampleReadiness(sampleId: number): Promise<SampleReadiness> {
    const res = await apiRequest<ApiResponseEnvelope<SampleReadiness>>(`/samples/${sampleId}/readiness`);
    return res.data;
  },

  async getMaterialFlow(): Promise<MaterialFlowResponse> {
    const res = await apiRequest<ApiResponseEnvelope<MaterialFlowResponse>>('/samples/visualisations/material-flow');
    return res.data;
  },

  async getCryoSpatialMap(sampleId: number): Promise<CryoSpatialMapResponse> {
    const res = await apiRequest<ApiResponseEnvelope<CryoSpatialMapResponse>>(`/samples/${sampleId}/cryo-spatial-map`);
    return res.data;
  },
};
