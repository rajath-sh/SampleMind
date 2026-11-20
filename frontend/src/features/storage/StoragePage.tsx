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
  Grid,
  Filter,
  Loader2,
} from 'lucide-react';
import { storageService } from './storageService';
import {
  StorageLocation,
  Equipment,
  OccupancyGridResponse,
  BoxOccupancySlot,
  StorageLocationWithSamples,
} from './types';

export const StoragePage: React.FC<{ initialTab?: 'locations' | 'equipment'; initialLocationId?: number }> = ({ initialTab = 'locations', initialLocationId }) => {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'RESEARCHER';
  const [activeTab, setActiveTab] = useState<'locations' | 'equipment'>(initialTab);

  // Storage state
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<StorageLocationWithSamples | null>(null);
  const [gridData, setGridData] = useState<OccupancyGridResponse | null>(null);
  const [selectedGridUnit, setSelectedGridUnit] = useState<string>('');
  const [selectedSlotDetail, setSelectedSlotDetail] = useState<BoxOccupancySlot | null>(null);
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
        // Find distinct unit labels for the occupancy grid
        const labels = Array.from(new Set(locs.map((l) => l.unit_label).filter(Boolean))) as string[];
        const targetLabel = selectedGridUnit || labels[0] || (locs[0] ? locs[0].unit_label || locs[0].location_code : '');
        if (targetLabel) {
          setSelectedGridUnit(targetLabel);
          try {
            const grid = await storageService.getOccupancyGrid(targetLabel);
            setGridData(grid);
          } catch (gridErr) {
            console.warn('Grid error:', gridErr);
          }
        }
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

  const handleSelectUnitForGrid = async (label: string) => {
    setSelectedGridUnit(label);
    setSelectedSlotDetail(null);
    try {
      const grid = await storageService.getOccupancyGrid(label);
      setGridData(grid);
    } catch (err: any) {
      console.warn('Error fetching grid for', label, err);
    }
  };

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

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                Grid Occupancy
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-teal)', marginTop: '4px' }}>
                {gridData ? `${gridData.occupancy_percentage}%` : 'N/A'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '4px' }}>
                {gridData ? `${gridData.occupied_slots} / ${gridData.total_slots} slots filled` : 'Select freezer'}
              </div>
            </div>
          </div>

          {/* Interactive 2D Box Slot Occupancy Grid Section (Section 5.9 & A5) */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Grid size={18} style={{ color: 'var(--color-teal)' }} />
                  <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-ink)' }}>
                    Interactive 2D Box/Slot Occupancy Grid
                  </h2>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
                  Slot occupancy visualization. Occupied coordinates in teal; available slots in neutral surface.
                </p>
              </div>

              {/* Unit selector pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {Array.from(new Set(locations.map((l) => l.unit_label).filter(Boolean))).map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleSelectUnitForGrid(label as string)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-control)',
                      border: `1px solid ${selectedGridUnit === label ? 'var(--color-teal)' : 'var(--color-border)'}`,
                      backgroundColor: selectedGridUnit === label ? 'var(--color-pale-teal)' : 'var(--color-surface)',
                      color: selectedGridUnit === label ? 'var(--color-teal)' : 'var(--color-ink)',
                      fontSize: '12px',
                      fontWeight: selectedGridUnit === label ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid Visualization Canvas */}
            {gridData && gridData.slots.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
                  gap: '8px',
                  backgroundColor: 'var(--color-background)',
                  padding: '16px',
                  borderRadius: 'var(--radius-card)',
                  border: '1px solid var(--color-border)',
                }}>
                  {gridData.slots.map((slotItem) => (
                    <button
                      type="button"
                      aria-pressed={selectedSlotDetail?.storage_location_id === slotItem.storage_location_id}
                      key={slotItem.storage_location_id}
                      onClick={() => setSelectedSlotDetail(slotItem)}
                      style={{
                        padding: '10px 6px',
                        borderRadius: '6px',
                        border: `1px solid ${slotItem.occupied ? 'var(--color-teal)' : 'var(--color-border)'}`,
                        backgroundColor: slotItem.occupied ? 'var(--color-teal)' : 'var(--color-surface)',
                        color: slotItem.occupied ? '#FFFFFF' : 'var(--color-muted)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'transform 0.1s ease',
                      }}
                      title={slotItem.location_code + " · " + slotItem.specimens.length + " specimens"}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {slotItem.slot}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        marginTop: '3px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: slotItem.occupied ? 600 : 400,
                      }}>
                        {slotItem.occupied ? `${slotItem.specimens.length} specimen(s)` : 'Available'}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Selected Slot Inspector Banner */}
                {selectedSlotDetail && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    backgroundColor: selectedSlotDetail.occupied ? 'var(--color-pale-teal)' : '#F5F7F6',
                    borderRadius: 'var(--radius-control)',
                    border: '1px solid var(--color-border)',
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>
                        Slot coordinate <span className="font-mono">{selectedSlotDetail.location_code} · {selectedSlotDetail.slot}</span>
                      </div>
                      {selectedSlotDetail.occupied ? (
                        <div style={{ fontSize: '12px', color: 'var(--color-teal)', marginTop: '2px' }}>
                          {selectedSlotDetail.specimens.map(specimen => (
                            <div key={specimen.sample_id}>
                              <strong>{specimen.sample_code}</strong> · {specimen.sample_name} · {specimen.sample_status}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
                          This coordinate slot is currently free and ready for specimen allocation.
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSlotDetail(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '32px',
                color: 'var(--color-muted)',
                fontSize: '13px',
                backgroundColor: 'var(--color-background)',
                borderRadius: 'var(--radius-control)',
              }}>
                No 2D grid slots configured for unit '{selectedGridUnit}'. Select another unit or register slots above.
              </div>
            )}
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

            <CompactTable label="storage locations" extra={[3, 4, 5]} help={<DatabaseConcept topic="storage" />}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-background)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Location Code</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Facility & Room</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Unit Type</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Coordinate Hierarchy</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Temp Range</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Stored Samples</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Action</th>
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
                          View Details
                        </button>
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

            <CompactTable label="equipment" extra={[3, 5]} help={<DatabaseConcept topic="equipment" />}>
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
                          <div style={{ display: 'flex', gap: '6px' }}>
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
                                Mark Available
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
                                Maintenance
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

            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)', marginBottom: '10px' }}>
              Resident Specimens List
            </h3>

            {selectedLocation.samples.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedLocation.samples.map((s) => (
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
    </div>
  );
};
