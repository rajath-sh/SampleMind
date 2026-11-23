import { apiRequest } from '../../common/apiClient';
import {
  SiteSummary,
  SiteCreatePayload,
  SiteUpdatePayload,
  AncientSpecimenListItem,
  AncientSpecimenDetail,
  AncientSpecimenCreatePayload,
  AncientSpecimenUpdatePayload,
} from './types';

interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export const ancientService = {
  async listSites(params?: { country?: string; search?: string }): Promise<SiteSummary[]> {
    const query = new URLSearchParams();
    if (params?.country) query.append('country', params.country);
    if (params?.search) query.append('search', params.search);

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<ApiResponseEnvelope<SiteSummary[]>>(`/ancient/sites${qs}`);
    return res.data || [];
  },

  async getSite(siteId: number): Promise<SiteSummary> {
    const res = await apiRequest<ApiResponseEnvelope<SiteSummary>>(`/ancient/sites/${siteId}`);
    return res.data;
  },

  async createSite(payload: SiteCreatePayload): Promise<SiteSummary> {
    const res = await apiRequest<ApiResponseEnvelope<SiteSummary>>('/ancient/sites', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async updateSite(siteId: number, payload: SiteUpdatePayload): Promise<SiteSummary> {
    const res = await apiRequest<ApiResponseEnvelope<SiteSummary>>(`/ancient/sites/${siteId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async deleteSite(siteId: number): Promise<boolean> {
    const res = await apiRequest<ApiResponseEnvelope<boolean>>(`/ancient/sites/${siteId}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  async listAncientSpecimens(params?: {
    siteId?: number;
    datingMethod?: string;
    minAge?: number;
    maxAge?: number;
    search?: string;
  }): Promise<AncientSpecimenListItem[]> {
    const query = new URLSearchParams();
    if (params?.siteId) query.append('site_id', params.siteId.toString());
    if (params?.datingMethod) query.append('dating_method', params.datingMethod);
    if (params?.minAge !== undefined) query.append('min_age', params.minAge.toString());
    if (params?.maxAge !== undefined) query.append('max_age', params.maxAge.toString());
    if (params?.search) query.append('search', params.search);

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiRequest<ApiResponseEnvelope<AncientSpecimenListItem[]>>(`/ancient/specimens${qs}`);
    return res.data || [];
  },

  async getAncientSpecimen(sampleId: number): Promise<AncientSpecimenDetail> {
    const res = await apiRequest<ApiResponseEnvelope<AncientSpecimenDetail>>(`/ancient/specimens/${sampleId}`);
    return res.data;
  },

  async createAncientSpecimen(payload: AncientSpecimenCreatePayload): Promise<AncientSpecimenDetail> {
    const res = await apiRequest<ApiResponseEnvelope<AncientSpecimenDetail>>('/ancient/specimens', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async updateAncientSpecimen(sampleId: number, payload: AncientSpecimenUpdatePayload): Promise<AncientSpecimenDetail> {
    const res = await apiRequest<ApiResponseEnvelope<AncientSpecimenDetail>>(`/ancient/specimens/${sampleId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async deleteAncientSpecimen(sampleId: number): Promise<boolean> {
    const res = await apiRequest<ApiResponseEnvelope<boolean>>(`/ancient/specimens/${sampleId}`, {
      method: 'DELETE',
    });
    return res.data;
  },
};
