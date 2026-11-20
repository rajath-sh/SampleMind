import { apiRequest } from '../../common/apiClient';
import {
  DashboardMetrics,
  SampleTypeDistribution,
  StorageOccupancyItem,
  IncidentTrendItem,
  ExperimentOutcomeReport,
  ActivityFeedItem,
  OverviewKpiData,
  WorkflowPulseData,
  IntegrityScanData,
  OperationalStatusData,
  DatabaseInsightData,
} from './types';

interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export const analyticsService = {
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const res = await apiRequest<ApiResponseEnvelope<DashboardMetrics>>('/analytics/dashboard');
    return res.data;
  },

  async getOverviewKpis(): Promise<OverviewKpiData> {
    const res = await apiRequest<ApiResponseEnvelope<OverviewKpiData>>('/analytics/overview-kpis');
    return res.data;
  },

  async getWorkflowPulse(): Promise<WorkflowPulseData> {
    const res = await apiRequest<ApiResponseEnvelope<WorkflowPulseData>>('/analytics/workflow-pulse');
    return res.data;
  },

  async runIntegrityScan(): Promise<IntegrityScanData> {
    const res = await apiRequest<ApiResponseEnvelope<IntegrityScanData>>('/analytics/integrity-scan', {
      method: 'POST',
    });
    return res.data;
  },

  async getOperationalStatus(): Promise<OperationalStatusData> {
    const res = await apiRequest<ApiResponseEnvelope<OperationalStatusData>>('/analytics/operational-status');
    return res.data;
  },

  async getDatabaseInsight(metricKey: string): Promise<DatabaseInsightData> {
    const res = await apiRequest<ApiResponseEnvelope<DatabaseInsightData>>(`/analytics/database-insight/${metricKey}`);
    return res.data;
  },

  async getSamplesByType(): Promise<SampleTypeDistribution[]> {
    const res = await apiRequest<ApiResponseEnvelope<SampleTypeDistribution[]>>('/analytics/reports/samples-by-type');
    return res.data || [];
  },

  async getStorageOccupancy(): Promise<StorageOccupancyItem[]> {
    const res = await apiRequest<ApiResponseEnvelope<StorageOccupancyItem[]>>('/analytics/reports/storage-occupancy');
    return res.data || [];
  },

  async getIncidentTrends(startDate?: string, endDate?: string): Promise<IncidentTrendItem[]> {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    const res = await apiRequest<ApiResponseEnvelope<IncidentTrendItem[]>>(`/analytics/reports/incident-trends${queryString}`);
    return res.data || [];
  },

  async getExperimentOutcomes(): Promise<ExperimentOutcomeReport[]> {
    const res = await apiRequest<ApiResponseEnvelope<ExperimentOutcomeReport[]>>('/analytics/reports/experiment-outcomes');
    return res.data || [];
  },

  async getActivityFeed(limit: number = 50): Promise<ActivityFeedItem[]> {
    const res = await apiRequest<ApiResponseEnvelope<ActivityFeedItem[]>>(`/analytics/reports/activity-feed?limit=${limit}`);
    return res.data || [];
  },
};
