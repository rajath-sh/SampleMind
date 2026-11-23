import { apiRequest } from '../../common/apiClient';
import {
  TestDetail,
  TestCreatePayload,
  TestUpdatePayload,
  PaginatedTestsResponse,
  QCEvaluationRequest,
  QCEvaluationResponse,
  SpecimenClearanceDossier,
  InstrumentQCReport,
  BatchTestCreatePayload,
  BatchTestCreateResponse,
  TestQualityMetricsResponse,
} from './types';

interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export const testsService = {
  async listTests(params?: {
    sampleId?: number;
    status?: string;
    outcome?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedTestsResponse> {
    const query = new URLSearchParams();
    if (params?.sampleId) query.append('sample_id', params.sampleId.toString());
    if (params?.status) query.append('status', params.status);
    if (params?.outcome) query.append('outcome', params.outcome);
    if (params?.search) query.append('search', params.search);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('page_size', params.pageSize.toString());

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<PaginatedTestsResponse>(`/tests${qs}`);
    return res;
  },

  async getTestDetail(testId: number): Promise<TestDetail> {
    const res = await apiRequest<ApiResponseEnvelope<TestDetail>>(`/tests/${testId}`);
    return res.data;
  },

  async createTest(payload: TestCreatePayload): Promise<TestDetail> {
    const res = await apiRequest<ApiResponseEnvelope<TestDetail>>('/tests', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async updateTest(testId: number, payload: TestUpdatePayload): Promise<TestDetail> {
    const res = await apiRequest<ApiResponseEnvelope<TestDetail>>(`/tests/${testId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async deleteTest(testId: number): Promise<void> {
    await apiRequest<ApiResponseEnvelope<{ deleted: boolean }>>(`/tests/${testId}`, {
      method: 'DELETE',
    });
  },

  // =========================================================================
  // Phase 2: Scientific Features
  // =========================================================================

  async evaluateQC(payload: QCEvaluationRequest): Promise<QCEvaluationResponse> {
    const res = await apiRequest<ApiResponseEnvelope<QCEvaluationResponse>>('/tests/evaluate-qc', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async getSpecimenClearance(sampleId: number): Promise<SpecimenClearanceDossier> {
    const res = await apiRequest<ApiResponseEnvelope<SpecimenClearanceDossier>>(`/tests/clearance/${sampleId}`);
    return res.data;
  },

  async getInstrumentDrift(): Promise<InstrumentQCReport[]> {
    const res = await apiRequest<ApiResponseEnvelope<InstrumentQCReport[]>>('/tests/analytics/instrument-drift');
    return res.data;
  },

  async createBatchTests(payload: BatchTestCreatePayload): Promise<BatchTestCreateResponse> {
    const res = await apiRequest<ApiResponseEnvelope<BatchTestCreateResponse>>('/tests/batch', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async getQualityMetrics(): Promise<TestQualityMetricsResponse> {
    const res = await apiRequest<ApiResponseEnvelope<TestQualityMetricsResponse>>('/tests/quality-metrics');
    return res.data;
  },
};
