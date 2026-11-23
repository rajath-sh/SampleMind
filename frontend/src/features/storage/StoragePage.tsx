import { DatabaseConcept } from '../../components/DatabaseConcept';
import { CompactTable } from '../../components/CompactTable';
import { useAuth } from '../auth/AuthContext';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Warehouse,
  Wrench,
  Plus,
  RefreshCw,
  Thermometer,
  AlertCircle,
  Clock,
  X,
  Filter,
  Loader2,
  Edit2,
  Trash2,
  Search,
} from 'lucide-react';
import { storageService } from './storageService';
import {
  StorageLocation,
  Equipment,
  StorageLocationWithSamples,
  StorageLocationUpdatePayload,
  EquipmentUpdatePayload,
} from './types';

export const StoragePage: React.FC<{ initialTab?: 'locations' | 'equipment'; initialLocationId?: number }> = ({ initialTab = 'locations', initialLocationId }) => {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'RESEARCHER';
  const [activeTab, setActiveTab] = useState<'locations' | 'equipment'>(initialTab);

  // Storage state
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<StorageLocationWithSamples | null>(null);
  const [unitTypeFilter, setUnitTypeFilter] = useState<string>('');

  // Equipment state
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Loading & Error states
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState<boolean>(false);

  // Edit & Delete Modals & State
  const [editingLocation, setEditingLocation] = useState<StorageLocation | null>(null);
  const [editLocForm, setEditLocForm] = useState<StorageLocationUpdatePayload>({});
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [editEqForm, setEditEqForm] = useState<EquipmentUpdatePayload>({});
  const [residentSearch, setResidentSearch] = useState<string>('');

  // Forms
  const [newLocCode, setNewLocCode] = useState('');
  const [newLocFacility, setNewLocFacility] = useState('Central Bio-Repository');
  const [newLocRoom, setNewLocRoom] = useState('CRYO-101');
  const [newLocUnitType, setNewLocUnitType] = useState('freezer');
  const [newLocUnitLabel, setNewLocUnitLabel] = useState('FRZ-ULT-01');
  const [newLocRack, setNewLocRack] = useState('RACK-A');
  const [newLocBox, setNewLocBox] = useState('BOX-01');
  const [newLocSlot, setNewLocSlot] = useState('A01');
  const [newLocMinTemp, setNewLocMinTemp] = useState('-80.0');
  const [newLocMaxTemp, setNewLocMaxTemp] = useState('-70.0');

  const [newEqCode, setNewEqCode] = useState('');
  const [newEqName, setNewEqName] = useState('');
  const [newEqMfg, setNewEqMfg] = useState('');
  const [newEqModel, setNewEqModel] = useState('');
  const [newEqStatus, setNewEqStatus] = useState('available');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'locations') {
        const locs = await storageService.listLocations(unitTypeFilter || undefined);
        setLocations(locs);
      } else {
        const eq = await storageService.listEquipment(statusFilter || undefined);
        setEquipmentList(eq);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load storage and equipment data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, unitTypeFilter, statusFilter]);

  const handleViewLocationDetails = useCallback(async (locationId: number) => {
    try {
      const detail = await storageService.getLocationDetail(locationId);
      setSelectedLocation(detail);
    } catch (err: any) {
      setError(err.message || 'Failed to load location details.');
    }
  }, []);

  useEffect(() => {
    if (initialLocationId) void handleViewLocationDetails(initialLocationId);
  }, [initialLocationId, handleViewLocationDetails]);

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await storageService.createLocation({
        location_code: newLocCode,
        facility: newLocFacility,
        room: newLocRoom || undefined,
        unit_type: newLocUnitType,
        unit_label: newLocUnitLabel || undefined,
        rack: newLocRack || undefined,
        box: newLocBox || undefined,
        slot: newLocSlot || undefined,
        temperature_min_c: newLocMinTemp ? parseFloat(newLocMinTemp) : undefined,
        temperature_max_c: newLocMaxTemp ? parseFloat(newLocMaxTemp) : undefined,
      });
      setShowLocationModal(false);
      setNewLocCode('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create storage location.');
    }
  };

  const handleCreateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await storageService.registerEquipment({
        equipment_code: newEqCode,
        equipment_name: newEqName,
        manufacturer: newEqMfg || undefined,
        model_number: newEqModel || undefined,
        equipment_status: newEqStatus,
      });
      setShowEquipmentModal(false);
      setNewEqCode('');
      setNewEqName('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to register equipment.');
    }
  };

  const handleUpdateStatus = async (eqId: number, status: string) => {
    try {
      await storageService.updateEquipmentStatus(eqId, status);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update equipment status.');
    }
  };

  const handleOpenEditLocation = (loc: StorageLocation) => {
    setEditingLocation(loc);
    setEditLocForm({
      facility: loc.facility,
      room: loc.room || '',
      unit_type: loc.unit_type,
      unit_label: loc.unit_label || '',
      rack: loc.rack || '',
      box: loc.box || '',
      slot: loc.slot || '',
      temperature_min_c: loc.temperature_min_c,
      temperature_max_c: loc.temperature_max_c,
      is_active: loc.is_active,
    });
  };

  const handleSaveEditLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocation) return;
    try {
      await storageService.updateLocation(editingLocation.storage_location_id, editLocForm);
      setEditingLocation(null);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update storage location.');
    }
  };

  const handleDeleteLocation = async (locId: number) => {
    if (!window.confirm('Are you sure you want to delete this storage location?')) return;
    try {
      await storageService.deleteLocation(locId);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete storage location.');
    }
  };

  const handleOpenEditEquipment = (eq: Equipment) => {
    setEditingEquipment(eq);
    setEditEqForm({
      equipment_name: eq.equipment_name,
      manufacturer: eq.manufacturer || '',
      model_number: eq.model_number || '',
      equipment_status: eq.equipment_status,
      notes: eq.notes || '',
    });
  };

  const handleSaveEditEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEquipment) return;
    try {
      await storageService.updateEquipment(editingEquipment.equipment_id, editEqForm);
      setEditingEquipment(null);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update equipment.');
    }
  };

  const handleDeleteEquipment = async (eqId: number) => {
    if (!window.confirm('Are you sure you want to delete this equipment instrument?')) return;
    try {
      await storageService.deleteEquipment(eqId);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete equipment.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '4px' }}>
            Storage Infrastructure & Equipment
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
            Monitor physical cryogenic coordinates, 2D box occupancy grids, and analytical instrumentation calibration.
          </p>
        </div>

        {/* Primary Action Button */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={loadData}
            title="Refresh records"
            disabled={loading}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            <span>Refresh</span>
          </button>
          {activeTab === 'locations' ? (
            <button disabled={!canWrite}
              type="button"
              className="btn-primary"
              onClick={() => setShowLocationModal(true)}
            >
              <Plus size={16} />
              <span>Register Storage Location</span>
            </button>
          ) : (
            <button disabled={!canWrite}
              type="button"
              className="btn-primary"
              onClick={() => setShowEquipmentModal(true)}
            >
              <Plus size={16} />
              <span>Register Instrument</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid var(--color-border)',
        paddingBottom: '2px',
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('locations')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            fontSize: '14px',
            fontWeight: activeTab === 'locations' ? 600 : 400,
            color: activeTab === 'locations' ? 'var(--color-teal)' : 'var(--color-muted)',
            borderBottom: activeTab === 'locations' ? '2px solid var(--color-teal)' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          <Warehouse size={16} />
          <span>Storage Locations & 2D Grid ({locations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('equipment')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            fontSize: '14px',
            fontWeight: activeTab === 'equipment' ? 600 : 400,
            color: activeTab === 'equipment' ? 'var(--color-teal)' : 'var(--color-muted)',
            borderBottom: activeTab === 'equipment' ? '2px solid var(--color-teal)' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          <Wrench size={16} />
          <span>Laboratory Equipment Registry ({equipmentList.length})</span>
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backgroundColor: 'var(--color-danger-bg)',
          border: '1px solid #F5C6CB',
          borderRadius: 'var(--radius-control)',
          padding: '12px 16px',
          color: 'var(--color-danger)',
          fontSize: '13px',
        }}>
          <AlertCircle size={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* =========================================================================
          TAB 1: STORAGE LOCATIONS & 2D GRID
         ========================================================================= */}
      {activeTab === 'locations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Summary Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                Total Coordinates
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-ink)', marginTop: '4px' }}>
                {locations.length}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-teal)', marginTop: '4px' }}>
                Active in repository
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                Cryogenic Freezers
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-navy)', marginTop: '4px' }}>
                {locations.filter((l) => l.unit_type === 'freezer').length}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '4px' }}>
                -80°C Ultra-Low & -20°C
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                Resident Specimens
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-success)', marginTop: '4px' }}>
                {locations.reduce((acc, l) => acc + (l.sample_count || 0), 0)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '4px' }}>
                Linked physical samples
              </div>
            </div>
          </div>

          {/* Locations Table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#FAFCFB',
            }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>
                Storage Location Inventory
              </div>

              {/* Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={14} style={{ color: 'var(--color-muted)' }} />
                <select
                  value={unitTypeFilter}
                  onChange={(e) => setUnitTypeFilter(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-control)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: '#FFFFFF',
                    color: 'var(--color-ink)',
                  }}
                >
                  <option value="">All Unit Types</option>
                  <option value="freezer">Freezer</option>
                  <option value="cabinet">Cabinet</option>
                  <option value="bench">Bench</option>
                  <option value="shelf">Shelf</option>
                  <option value="liquid_nitrogen">Liquid Nitrogen</option>
                </select>
              </div>
            </div>

            <CompactTable label="storage locations" extra={[3, 4, 5]} showLens={false} help={<DatabaseConcept topic="storage" />}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-background)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Location Code</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Facility & Room</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Unit Type</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Coordinate Hierarchy</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Temp Range</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Stored Samples</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.length > 0 ? (
                  locations.map((loc) => (
                    <tr key={loc.storage_location_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                        <span className="font-mono badge-id" style={{ color: 'var(--color-teal)' }}>
                          {loc.location_code}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div>{loc.facility}</div>
                        {loc.room && <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Room: {loc.room}</div>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                          {loc.unit_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-ink)' }}>
                          {loc.unit_label || '—'} {loc.rack ? `/ ${loc.rack}` : ''} {loc.box ? `/ ${loc.box}` : ''} {loc.slot ? `/ ${loc.slot}` : ''}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {loc.temperature_min_c !== undefined && loc.temperature_min_c !== null ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#1E40AF', fontSize: '12px' }}>
                            <Thermometer size={13} />
                            {loc.temperature_min_c}°C to {loc.temperature_max_c}°C
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-muted)', fontSize: '12px' }}>Ambient</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={`badge ${loc.sample_count > 0 ? 'badge-success' : 'badge-neutral'}`}>
                          {loc.sample_count} {loc.sample_count === 1 ? 'Sample' : 'Samples'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleViewLocationDetails(loc.storage_location_id)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              borderRadius: '4px',
                              border: '1px solid var(--color-border)',
                              backgroundColor: '#FFFFFF',
                              cursor: 'pointer',
                              color: 'var(--color-teal)',
                              fontWeight: 500,
                            }}
                          >
                            Details
                          </button>
                          {canWrite && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditLocation(loc)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--color-border)',
                                  backgroundColor: '#FFFFFF',
                                  cursor: 'pointer',
                                  color: 'var(--color-ink)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Edit storage location"
                              >
                                <Edit2 size={12} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLocation(loc.storage_location_id)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  borderRadius: '4px',
                                  border: '1px solid #FECACA',
                                  backgroundColor: '#FEF2F2',
                                  cursor: 'pointer',
                                  color: 'var(--color-danger)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Delete storage location"
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)' }}>
                      No storage locations registered yet. Use "Register Storage Location" above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </CompactTable>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: LABORATORY EQUIPMENT REGISTRY
         ========================================================================= */}
      {activeTab === 'equipment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Equipment Table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#FAFCFB',
            }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>
                Analytical Equipment & Maintenance Status
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={14} style={{ color: 'var(--color-muted)' }} />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-control)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: '#FFFFFF',
                    color: 'var(--color-ink)',
                  }}
                >
                  <option value="">All Statuses</option>
                  <option value="available">Available</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="in_use">In Use</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>

            <CompactTable label="equipment" extra={[3, 5]} showLens={false} help={<DatabaseConcept topic="equipment" />}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-background)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Equipment Code</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Instrument Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Manufacturer & Model</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Operational Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Calibration Schedule</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody>
                {equipmentList.length > 0 ? (
                  equipmentList.map((eq) => {
                    const statusClass =
                      eq.equipment_status === 'available' ? 'badge-success' :
                      eq.equipment_status === 'maintenance' ? 'badge-warning' :
                      eq.equipment_status === 'in_use' ? 'badge-neutral' : 'badge-danger';

                    return (
                      <tr key={eq.equipment_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                          <span className="font-mono badge-id" style={{ color: 'var(--color-navy)' }}>
                            {eq.equipment_code}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-ink)' }}>
                          {eq.equipment_name}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div>{eq.manufacturer || '—'}</div>
                          {eq.model_number && <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Model: {eq.model_number}</div>}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className={`badge ${statusClass}`} style={{ textTransform: 'uppercase' }}>
                            {eq.equipment_status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {eq.calibration_due_at ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--color-muted)' }}>
                              <Clock size={13} />
                              Due: {new Date(eq.calibration_due_at).toLocaleDateString()}
                            </div>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Standard Protocol</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {canWrite && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditEquipment(eq)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--color-border)',
                                  backgroundColor: '#FFFFFF',
                                  color: 'var(--color-ink)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Edit instrument"
                              >
                                <Edit2 size={11} /> Edit
                              </button>
                            )}
                            {eq.equipment_status !== 'available' && (
                              <button disabled={!canWrite}
                                type="button"
                                onClick={() => handleUpdateStatus(eq.equipment_id, 'available')}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--color-border)',
                                  backgroundColor: 'var(--color-success-bg)',
                                  color: 'var(--color-success)',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                }}
                              >
                                Available
                              </button>
                            )}
                            {eq.equipment_status !== 'maintenance' && (
                              <button disabled={!canWrite}
                                type="button"
                                onClick={() => handleUpdateStatus(eq.equipment_id, 'maintenance')}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--color-border)',
                                  backgroundColor: 'var(--color-warning-bg)',
                                  color: 'var(--color-warning)',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                }}
                              >
                                Maint
                              </button>
                            )}
                            {canWrite && (
                              <button
                                type="button"
                                onClick={() => handleDeleteEquipment(eq.equipment_id)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  borderRadius: '4px',
                                  border: '1px solid #FECACA',
                                  backgroundColor: '#FEF2F2',
                                  color: 'var(--color-danger)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Delete instrument"
                              >
                                <Trash2 size={11} /> Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)' }}>
                      No equipment records found. Use "Register Instrument" to catalog instruments.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </CompactTable>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: REGISTER STORAGE LOCATION
         ========================================================================= */}
      {showLocationModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(23, 43, 58, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '520px',
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            boxShadow: 'var(--shadow-elevated)',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-ink)' }}>Register Storage Location</h2>
              <button type="button" onClick={() => setShowLocationModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateLocation} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Location Code *</label>
                <input
                  type="text"
                  className="input-field"
                  value={newLocCode}
                  onChange={(e) => setNewLocCode(e.target.value)}
                  placeholder="e.g. LOC-FRZ80-B02"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Facility *</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newLocFacility}
                    onChange={(e) => setNewLocFacility(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Room</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newLocRoom}
                    onChange={(e) => setNewLocRoom(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Unit Type</label>
                  <select
                    className="input-field"
                    value={newLocUnitType}
                    onChange={(e) => setNewLocUnitType(e.target.value)}
                  >
                    <option value="freezer">Freezer</option>
                    <option value="cabinet">Cabinet</option>
                    <option value="bench">Bench</option>
                    <option value="shelf">Shelf</option>
                    <option value="liquid_nitrogen">Liquid Nitrogen</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Unit Label</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newLocUnitLabel}
                    onChange={(e) => setNewLocUnitLabel(e.target.value)}
                    placeholder="e.g. FRZ-ULT-01"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Rack</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newLocRack}
                    onChange={(e) => setNewLocRack(e.target.value)}
                    placeholder="RACK-A"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Box</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newLocBox}
                    onChange={(e) => setNewLocBox(e.target.value)}
                    placeholder="BOX-01"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Slot</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newLocSlot}
                    onChange={(e) => setNewLocSlot(e.target.value)}
                    placeholder="A01"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Min Temp (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    className="input-field"
                    value={newLocMinTemp}
                    onChange={(e) => setNewLocMinTemp(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Max Temp (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    className="input-field"
                    value={newLocMaxTemp}
                    onChange={(e) => setNewLocMaxTemp(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowLocationModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Register Coordinate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: REGISTER EQUIPMENT
         ========================================================================= */}
      {showEquipmentModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(23, 43, 58, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '500px',
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            boxShadow: 'var(--shadow-elevated)',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-ink)' }}>Register Analytical Instrument</h2>
              <button type="button" onClick={() => setShowEquipmentModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateEquipment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Equipment Code *</label>
                <input
                  type="text"
                  className="input-field"
                  value={newEqCode}
                  onChange={(e) => setNewEqCode(e.target.value)}
                  placeholder="e.g. EQ-SEQ-002"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Instrument Name *</label>
                <input
                  type="text"
                  className="input-field"
                  value={newEqName}
                  onChange={(e) => setNewEqName(e.target.value)}
                  placeholder="e.g. Illumina NovaSeq 6000"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Manufacturer</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newEqMfg}
                    onChange={(e) => setNewEqMfg(e.target.value)}
                    placeholder="e.g. Illumina"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Model Number</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newEqModel}
                    onChange={(e) => setNewEqModel(e.target.value)}
                    placeholder="e.g. NovaSeq-6000"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Status</label>
                <select
                  className="input-field"
                  value={newEqStatus}
                  onChange={(e) => setNewEqStatus(e.target.value)}
                >
                  <option value="available">Available (Operational)</option>
                  <option value="maintenance">Under Maintenance</option>
                  <option value="in_use">In Use</option>
                  <option value="retired">Retired</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowEquipmentModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Register Instrument
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: STORAGE LOCATION DETAILS WITH SAMPLES
         ========================================================================= */}
      {selectedLocation && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(23, 43, 58, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '600px',
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            boxShadow: 'var(--shadow-elevated)',
            border: '1px solid var(--color-border)',
            maxHeight: '85vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <span className="badge badge-sand">Location Dossier</span>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-ink)', marginTop: '4px' }}>
                  {selectedLocation.location_code}
                </h2>
              </div>
              <button type="button" onClick={() => setSelectedLocation(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ padding: '10px', backgroundColor: 'var(--color-background)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Facility & Room</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>{selectedLocation.facility} ({selectedLocation.room || 'N/A'})</div>
              </div>
              <div style={{ padding: '10px', backgroundColor: 'var(--color-background)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Hierarchy</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>
                  {selectedLocation.unit_label || '—'} / {selectedLocation.rack || '—'} / {selectedLocation.box || '—'} / {selectedLocation.slot || '—'}
                </div>
              </div>
              <div style={{ padding: '10px', backgroundColor: 'var(--color-background)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Temperature Range</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>
                  {selectedLocation.temperature_min_c !== undefined && selectedLocation.temperature_min_c !== null
                    ? `${selectedLocation.temperature_min_c}°C to ${selectedLocation.temperature_max_c}°C`
                    : 'Ambient'}
                </div>
              </div>
              <div style={{ padding: '10px', backgroundColor: 'var(--color-background)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Specimens Stored</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-teal)' }}>
                  {selectedLocation.samples.length} Samples
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>
                Resident Specimens List
              </h3>
              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter specimens..."
                  value={residentSearch}
                  onChange={(e) => setResidentSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 8px 4px 28px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    border: '1px solid var(--color-border)',
                  }}
                />
              </div>
            </div>

            {selectedLocation.samples.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedLocation.samples
                  .filter((s) => {
                    if (!residentSearch.trim()) return true;
                    const query = residentSearch.toLowerCase().trim();
                    return (
                      s.sample_code.toLowerCase().includes(query) ||
                      s.sample_name.toLowerCase().includes(query) ||
                      s.sample_status.toLowerCase().includes(query)
                    );
                  })
                  .map((s) => (
                    <div
                      key={s.sample_id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        border: '1px solid var(--color-border)',
                        borderRadius: '6px',
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>
                          <span className="font-mono" style={{ color: 'var(--color-teal)' }}>{s.sample_code}</span> — {s.sample_name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                          Stock: {s.quantity_value} {s.quantity_unit}
                        </div>
                      </div>
                      <span className="badge badge-success">{s.sample_status}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-muted)', fontSize: '13px' }}>
                No specimens currently located in this storage coordinate.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: EDIT STORAGE LOCATION
         ========================================================================= */}
      {editingLocation && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(23, 43, 58, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '520px',
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            boxShadow: 'var(--shadow-elevated)',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-ink)' }}>Edit Storage Location</h2>
                <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-teal)' }}>{editingLocation.location_code}</span>
              </div>
              <button type="button" onClick={() => setEditingLocation(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditLocation} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Facility</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editLocForm.facility || ''}
                    onChange={(e) => setEditLocForm({ ...editLocForm, facility: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Room</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editLocForm.room || ''}
                    onChange={(e) => setEditLocForm({ ...editLocForm, room: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Unit Type</label>
                  <select
                    className="input-field"
                    value={editLocForm.unit_type || 'freezer'}
                    onChange={(e) => setEditLocForm({ ...editLocForm, unit_type: e.target.value })}
                  >
                    <option value="freezer">Freezer</option>
                    <option value="cabinet">Cabinet</option>
                    <option value="bench">Bench</option>
                    <option value="shelf">Shelf</option>
                    <option value="liquid_nitrogen">Liquid Nitrogen</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Unit Label</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editLocForm.unit_label || ''}
                    onChange={(e) => setEditLocForm({ ...editLocForm, unit_label: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Rack</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editLocForm.rack || ''}
                    onChange={(e) => setEditLocForm({ ...editLocForm, rack: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Box</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editLocForm.box || ''}
                    onChange={(e) => setEditLocForm({ ...editLocForm, box: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Slot</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editLocForm.slot || ''}
                    onChange={(e) => setEditLocForm({ ...editLocForm, slot: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Min Temp (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="input-field"
                    value={editLocForm.temperature_min_c ?? ''}
                    onChange={(e) => setEditLocForm({ ...editLocForm, temperature_min_c: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Max Temp (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="input-field"
                    value={editLocForm.temperature_max_c ?? ''}
                    onChange={(e) => setEditLocForm({ ...editLocForm, temperature_max_c: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingLocation(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: EDIT EQUIPMENT
         ========================================================================= */}
      {editingEquipment && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(23, 43, 58, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '500px',
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            boxShadow: 'var(--shadow-elevated)',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-ink)' }}>Edit Equipment Instrument</h2>
                <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-navy)' }}>{editingEquipment.equipment_code}</span>
              </div>
              <button type="button" onClick={() => setEditingEquipment(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditEquipment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Instrument Name *</label>
                <input
                  type="text"
                  className="input-field"
                  required
                  value={editEqForm.equipment_name || ''}
                  onChange={(e) => setEditEqForm({ ...editEqForm, equipment_name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Manufacturer</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editEqForm.manufacturer || ''}
                    onChange={(e) => setEditEqForm({ ...editEqForm, manufacturer: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Model Number</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editEqForm.model_number || ''}
                    onChange={(e) => setEditEqForm({ ...editEqForm, model_number: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Operational Status</label>
                <select
                  className="input-field"
                  value={editEqForm.equipment_status || 'available'}
                  onChange={(e) => setEditEqForm({ ...editEqForm, equipment_status: e.target.value })}
                >
                  <option value="available">Available (Operational)</option>
                  <option value="maintenance">Under Maintenance</option>
                  <option value="in_use">In Use</option>
                  <option value="retired">Retired</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Notes</label>
                <textarea
                  rows={2}
                  className="input-field"
                  value={editEqForm.notes || ''}
                  onChange={(e) => setEditEqForm({ ...editEqForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingEquipment(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
