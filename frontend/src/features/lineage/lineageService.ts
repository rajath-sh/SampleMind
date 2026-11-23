import { apiRequest } from '../../common/apiClient';
import {
  LineageNodeItem,
  LineageGraphResponse,
  RelationshipCreatePayload,
  RelationshipResponse,
} from './types';

interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export const lineageService = {
  async getLineageGraph(
    sampleId: number,
    direction: 'all' | 'upstream' | 'downstream' = 'all',
    maxDepth: number = 10
  ): Promise<LineageGraphResponse> {
    const res = await apiRequest<ApiResponseEnvelope<LineageGraphResponse>>(
      `/lineage/${sampleId}?direction=${direction}&max_depth=${maxDepth}`
    );
    return res.data;
  },

  async getAncestors(sampleId: number, maxDepth: number = 10): Promise<LineageNodeItem[]> {
    const res = await apiRequest<ApiResponseEnvelope<LineageNodeItem[]>>(
      `/lineage/${sampleId}/ancestors?max_depth=${maxDepth}`
    );
    return res.data || [];
  },

  async getDescendants(sampleId: number, maxDepth: number = 10): Promise<LineageNodeItem[]> {
    const res = await apiRequest<ApiResponseEnvelope<LineageNodeItem[]>>(
      `/lineage/${sampleId}/descendants?max_depth=${maxDepth}`
    );
    return res.data || [];
  },

  async createRelationship(payload: RelationshipCreatePayload): Promise<RelationshipResponse> {
    const res = await apiRequest<ApiResponseEnvelope<RelationshipResponse>>('/lineage/relationships', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async deleteRelationship(relationshipId: number): Promise<void> {
    await apiRequest<ApiResponseEnvelope<{ relationship_id: number; deleted: boolean }>>(
      `/lineage/relationships/${relationshipId}`,
      { method: 'DELETE' }
    );
  },
};
