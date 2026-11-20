import { apiRequest } from '../../common/apiClient';
import {
  ModelRegistryInfo,
  AIAnalysisResponse,
  AIReviewPayload,
  RiskDistributionResponse,
} from './types';

interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export const aiService = {
  async getActiveModel(): Promise<ModelRegistryInfo> {
    const res = await apiRequest<ApiResponseEnvelope<ModelRegistryInfo>>('/ai/models');
    return res.data;
  },

  async predictSampleRisk(sampleId: number): Promise<AIAnalysisResponse> {
    const res = await apiRequest<ApiResponseEnvelope<AIAnalysisResponse>>(`/ai/predict/${sampleId}`, {
      method: 'POST',
    });
    return res.data;
  },

  async getSampleAnalyses(sampleId: number): Promise<AIAnalysisResponse[]> {
    const res = await apiRequest<ApiResponseEnvelope<AIAnalysisResponse[]>>(`/ai/analyses/${sampleId}`);
    return res.data || [];
  },

  async reviewAnalysis(analysisId: number, payload: AIReviewPayload): Promise<AIAnalysisResponse> {
    const res = await apiRequest<ApiResponseEnvelope<AIAnalysisResponse>>(`/ai/review/${analysisId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async getRiskDistribution(): Promise<RiskDistributionResponse> {
    const res = await apiRequest<ApiResponseEnvelope<RiskDistributionResponse>>('/ai/risk-distribution');
    return res.data;
  },
};
