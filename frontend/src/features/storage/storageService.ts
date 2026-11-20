import { apiRequest } from '../../common/apiClient';
import {
  StorageLocation,
  StorageLocationWithSamples,
  OccupancyGridResponse,
  Equipment,
  StorageLocationCreatePayload,
  EquipmentCreatePayload,
} from './types';

interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export const storageService = {
  async listLocations(unitType?: string): Promise<StorageLocation[]> {
    const query = unitType ? `?unit_type=${encodeURIComponent(unitType)}` : '';
    const res = await apiRequest<ApiResponseEnvelope<StorageLocation[]>>(`/storage/locations${query}`);
    return res.data || [];
  },

  async getLocationDetail(locationId: number): Promise<StorageLocationWithSamples> {
    const res = await apiRequest<ApiResponseEnvelope<StorageLocationWithSamples>>(`/storage/locations/${locationId}`);
    return res.data;
  },

  async createLocation(payload: StorageLocationCreatePayload): Promise<StorageLocation> {
    const res = await apiRequest<ApiResponseEnvelope<StorageLocation>>('/storage/locations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async getOccupancyGrid(unitLabel: string, box?: string): Promise<OccupancyGridResponse> {
    const query = box ? `?box=${encodeURIComponent(box)}` : '';
    const res = await apiRequest<ApiResponseEnvelope<OccupancyGridResponse>>(
      `/storage/occupancy-grid/${encodeURIComponent(unitLabel)}${query}`
    );
    return res.data;
  },

  async listEquipment(statusFilter?: string): Promise<Equipment[]> {
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    const res = await apiRequest<ApiResponseEnvelope<Equipment[]>>(`/equipment${query}`);
    return res.data || [];
  },

  async registerEquipment(payload: EquipmentCreatePayload): Promise<Equipment> {
    const res = await apiRequest<ApiResponseEnvelope<Equipment>>('/equipment', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async updateEquipmentStatus(equipmentId: number, status: string, notes?: string): Promise<Equipment> {
    const res = await apiRequest<ApiResponseEnvelope<Equipment>>(`/equipment/${equipmentId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ equipment_status: status, notes }),
    });
    return res.data;
  },
};
