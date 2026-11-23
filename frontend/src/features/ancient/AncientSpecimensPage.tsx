import { DatabaseConcept } from '../../components/DatabaseConcept';
import { CompactTable } from '../../components/CompactTable';
import { useAuth } from '../auth/AuthContext';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Scroll,
  MapPin,
  Search,
  Plus,
  RefreshCw,
  X,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronRight,
  Filter,
  Compass,
  Edit2,
  Trash2,
} from 'lucide-react';
import { ancientService } from './ancientService';
import {
  SiteSummary,
  SiteCreatePayload,
  SiteUpdatePayload,
  AncientSpecimenListItem,
  AncientSpecimenDetail,
  AncientSpecimenCreatePayload,
  AncientSpecimenUpdatePayload,
} from './types';

interface AncientSpecimensPageProps {
  initialTab?: 'specimens' | 'sites';
}

export const AncientSpecimensPage: React.FC<AncientSpecimensPageProps> = ({ initialTab = 'specimens' }) => {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'RESEARCHER';
  const canRegister = canWrite || user?.role === 'TECHNICIAN';
  const [activeTab, setActiveTab] = useState<'specimens' | 'sites'>(initialTab);

  // Data states
  const [specimens, setSpecimens] = useState<AncientSpecimenListItem[]>([]);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<number | undefined>(undefined);
  const [datingMethodFilter, setDatingMethodFilter] = useState('');

  // Selected Specimen Dossier Drawer
  const [selectedSampleId, setSelectedSampleId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AncientSpecimenDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Modals
  const [isNewSpecimenModalOpen, setIsNewSpecimenModalOpen] = useState(false);
  const [isNewSiteModalOpen, setIsNewSiteModalOpen] = useState(false);
  const [isEditSpecimenModalOpen, setIsEditSpecimenModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<SiteSummary | null>(null);
  const [editSiteForm, setEditSiteForm] = useState<SiteUpdatePayload>({
    site_name: '',
    region: '',
    country: '',
    context_notes: '',
  });

  // Form states
  const [newSpecimenForm, setNewSpecimenForm] = useState<AncientSpecimenCreatePayload>({
    sample_id: 1,
    archaeological_site_id: undefined,
    estimated_age_years: 25000,
    age_uncertainty_years: 500,
    dating_method: '14C Accelerator Mass Spectrometry',
    excavation_layer: 'Stratum IV',
    depth_cm: 180.0,
    preservation_state: 'calcified',
    context_reference: 'Quadrant A1',
  });

  const [editSpecimenForm, setEditSpecimenForm] = useState<AncientSpecimenUpdatePayload>({});

  const [newSiteForm, setNewSiteForm] = useState<SiteCreatePayload>({
    site_code: '',
    site_name: '',
    region: '',
    country: 'India',
    context_notes: '',
  });

  // Load specimens
  const loadSpecimens = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await ancientService.listAncientSpecimens({
        siteId: selectedSiteFilter,
        datingMethod: datingMethodFilter || undefined,
        search: searchQuery || undefined,
      });
      setSpecimens(data);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to load ancient specimens.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedSiteFilter, datingMethodFilter, searchQuery]);

  // Load sites
  const loadSites = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await ancientService.listSites();
      setSites(data);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to load excavation sites.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load specimen detail
  const loadSpecimenDetail = useCallback(async (sampleId: number) => {
    setIsDetailLoading(true);
    try {
      const detail = await ancientService.getAncientSpecimen(sampleId);
      setSelectedDetail(detail);
      setEditSpecimenForm({
        archaeological_site_id: detail.archaeological_site_id,
        estimated_age_years: detail.estimated_age_years,
        age_uncertainty_years: detail.age_uncertainty_years,
        dating_method: detail.dating_method,
        excavation_layer: detail.excavation_layer,
        depth_cm: detail.depth_cm,
        preservation_state: detail.preservation_state,
        context_reference: detail.context_reference,
      });
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to load specimen provenance.');
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  useEffect(() => {
    if (activeTab === 'specimens') {
      loadSpecimens();
    } else {
      loadSites();
    }
  }, [activeTab, loadSpecimens, loadSites]);

  useEffect(() => {
    if (selectedSampleId) {
      loadSpecimenDetail(selectedSampleId);
    } else {
      setSelectedDetail(null);
    }
  }, [selectedSampleId, loadSpecimenDetail]);

  const handleCreateSpecimen = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await ancientService.createAncientSpecimen({
        ...newSpecimenForm,
        sample_id: Number(newSpecimenForm.sample_id),
        archaeological_site_id: newSpecimenForm.archaeological_site_id
          ? Number(newSpecimenForm.archaeological_site_id)
          : undefined,
        estimated_age_years: newSpecimenForm.estimated_age_years
          ? Number(newSpecimenForm.estimated_age_years)
          : undefined,
        age_uncertainty_years: newSpecimenForm.age_uncertainty_years
          ? Number(newSpecimenForm.age_uncertainty_years)
          : undefined,
        depth_cm: newSpecimenForm.depth_cm ? Number(newSpecimenForm.depth_cm) : undefined,
      });
      setSuccessMessage(`Ancient provenance attached to specimen ${res.sample_code}.`);
      setIsNewSpecimenModalOpen(false);
      loadSpecimens();
      loadSites();
      setSelectedSampleId(res.sample_id);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to attach ancient provenance.');
    }
  };

  const handleUpdateSpecimen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSampleId) return;

    try {
      const updated = await ancientService.updateAncientSpecimen(selectedSampleId, {
        ...editSpecimenForm,
        archaeological_site_id: editSpecimenForm.archaeological_site_id
          ? Number(editSpecimenForm.archaeological_site_id)
          : undefined,
        estimated_age_years: editSpecimenForm.estimated_age_years
          ? Number(editSpecimenForm.estimated_age_years)
          : undefined,
        age_uncertainty_years: editSpecimenForm.age_uncertainty_years
          ? Number(editSpecimenForm.age_uncertainty_years)
          : undefined,
        depth_cm: editSpecimenForm.depth_cm ? Number(editSpecimenForm.depth_cm) : undefined,
      });
      setSelectedDetail(updated);
      setSuccessMessage('Archaeological chronometrics updated successfully.');
      setIsEditSpecimenModalOpen(false);
      loadSpecimens();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to update provenance.');
    }
  };

  const handleDeleteSpecimen = async (sampleId: number, sampleCode: string) => {
    if (!window.confirm(`Are you sure you want to delete the ancient provenance record for specimen ${sampleCode}?`)) {
      return;
    }
    try {
      await ancientService.deleteAncientSpecimen(sampleId);
      setSuccessMessage(`Ancient provenance record for ${sampleCode} removed.`);
      if (selectedSampleId === sampleId) {
        setSelectedSampleId(null);
        setSelectedDetail(null);
      }
      loadSpecimens();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to delete ancient specimen.');
    }
  };

  const handleOpenEditSpecimen = (sampleId: number) => {
    setSelectedSampleId(sampleId);
    void loadSpecimenDetail(sampleId);
    setIsEditSpecimenModalOpen(true);
  };

  const handleOpenEditSite = (site: SiteSummary) => {
    setEditingSite(site);
    setEditSiteForm({
      site_name: site.site_name,
      region: site.region || '',
      country: site.country || '',
      context_notes: site.context_notes || '',
    });
  };

  const handleUpdateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSite) return;
    try {
      await ancientService.updateSite(editingSite.archaeological_site_id, editSiteForm);
      setSuccessMessage(`Excavation site ${editSiteForm.site_name} updated successfully.`);
      setEditingSite(null);
      loadSites();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to update excavation site.');
    }
  };

  const handleDeleteSite = async (siteId: number, siteName: string) => {
    if (!window.confirm(`Are you sure you want to delete excavation site "${siteName}"? Associated specimens will have their site unlinked.`)) {
      return;
    }
    try {
      await ancientService.deleteSite(siteId);
      setSuccessMessage(`Excavation site "${siteName}" deleted.`);
      loadSites();
      loadSpecimens();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to delete excavation site.');
    }
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteForm.site_code.trim() || !newSiteForm.site_name.trim()) {
      setErrorMessage('Site code and site name are required.');
      return;
    }

    try {
      const created = await ancientService.createSite(newSiteForm);
      setSuccessMessage(`Excavation site ${created.site_name} registered successfully.`);
      setIsNewSiteModalOpen(false);
      setNewSiteForm({
        site_code: '',
        site_name: '',
        region: '',
        country: 'India',
        context_notes: '',
      });
      loadSites();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to register excavation site.');
    }
  };

  const generateSiteCode = () => {
    const code = `SITE-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setNewSiteForm((prev) => ({ ...prev, site_code: code }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Toast Feedback */}
      {successMessage && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: 'var(--color-pale-teal)',
            border: '1px solid var(--color-teal)',
            borderRadius: 'var(--radius-control)',
            color: 'var(--color-teal)',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-teal)' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: '#FDF2F2',
            border: '1px solid #F87171',
            borderRadius: 'var(--radius-control)',
            color: '#B91C1C',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tab Navigation & Primary Action Bar */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab('specimens');
              setSelectedSampleId(null);
            }}
            className={`btn ${activeTab === 'specimens' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
          >
            <Scroll size={16} />
            Ancient Specimens ({specimens.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('sites');
              setSelectedSampleId(null);
            }}
            className={`btn ${activeTab === 'sites' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
          >
            <MapPin size={16} />
            Excavation Sites ({sites.length})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activeTab === 'specimens' ? (
            <button disabled={!canRegister}
              type="button"
              onClick={() => setIsNewSpecimenModalOpen(true)}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <Plus size={16} />
              Attach Ancient Provenance
            </button>
          ) : (
            <button disabled={!canRegister}
              type="button"
              onClick={() => {
                generateSiteCode();
                setIsNewSiteModalOpen(true);
              }}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <Plus size={16} />
              Register Excavation Site
            </button>
          )}
          <button
            type="button"
            onClick={() => (activeTab === 'specimens' ? loadSpecimens() : loadSites())}
            className="btn btn-secondary"
            title="Refresh Registry"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'specimens' ? (
        <div style={{ display: 'grid', gridTemplateColumns: selectedSampleId ? '1fr 440px' : '1fr', gap: '24px' }}>
          {/* Ancient Specimen Catalog */}
          <div className="card" style={{ padding: '20px' }}>
            {/* Filter Toolbar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '18px',
              }}
            >
              <div style={{ position: 'relative', width: '280px' }}>
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-muted)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search code, name, stratum, site..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input font-mono"
                  style={{ paddingLeft: '36px', fontSize: '13px', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Filter size={15} style={{ color: 'var(--color-muted)' }} />
                  <select
                    value={selectedSiteFilter || ''}
                    onChange={(e) => setSelectedSiteFilter(e.target.value ? Number(e.target.value) : undefined)}
                    className="input"
                    style={{ fontSize: '13px', minWidth: '160px' }}
                  >
                    <option value="">All Excavation Sites</option>
                    {sites.map((s) => (
                      <option key={s.archaeological_site_id} value={s.archaeological_site_id}>
                        {s.site_name}
                      </option>
                    ))}
                  </select>
                </div>

                <select
                  value={datingMethodFilter}
                  onChange={(e) => setDatingMethodFilter(e.target.value)}
                  className="input"
                  style={{ fontSize: '13px', minWidth: '150px' }}
                >
                  <option value="">All Dating Methods</option>
                  <option value="14C">14C AMS Radiocarbon</option>
                  <option value="U-Th">U-Th Series</option>
                  <option value="Stratigraphic">Stratigraphic</option>
                  <option value="Dendrochronology">Dendrochronology</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <CompactTable label="ancient specimens" extra={[3, 5, 7]} showLens={false} help={<DatabaseConcept topic="ancient" />}>
                <table className="table" style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Sample Code</th>
                    <th>Specimen Name</th>
                    <th>Type</th>
                    <th>Calibrated Age (BP)</th>
                    <th>Excavation Layer</th>
                    <th>Preservation</th>
                    <th>Site Provenance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                        Loading archaeological specimens...
                      </td>
                    </tr>
                  ) : specimens.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                        No ancient specimens found matching current criteria.
                      </td>
                    </tr>
                  ) : (
                    specimens.map((spec) => (
                      <tr
                        key={spec.sample_id}
                        style={{
                          backgroundColor:
                            selectedSampleId === spec.sample_id ? 'var(--color-pale-teal)' : undefined,
                        }}
                      >
                        <td className="font-mono" style={{ fontWeight: 600, color: 'var(--color-teal)' }}>
                          {spec.sample_code}
                        </td>
                        <td style={{ fontWeight: 500, color: 'var(--color-ink)' }}>{spec.sample_name}</td>
                        <td>
                          <span className="badge badge-neutral font-mono">{spec.sample_type_code}</span>
                        </td>
                        <td>
                          {spec.estimated_age_years ? (
                            <span
                              className="badge badge-sand font-mono"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Calendar size={11} />
                              {spec.estimated_age_years.toLocaleString()}
                              {spec.age_uncertainty_years ? ` ± ${spec.age_uncertainty_years}` : ''} BP
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {spec.excavation_layer ? (
                            <span
                              className="badge badge-neutral"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Layers size={11} /> {spec.excavation_layer}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span className="badge badge-neutral">{spec.preservation_state || 'Unspecified'}</span>
                        </td>
                        <td>
                          {spec.site_name ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <MapPin size={12} color="var(--color-teal)" />
                              <span style={{ fontWeight: 500 }}>{spec.site_name}</span>
                              {spec.country && <span style={{ color: 'var(--color-muted)' }}>({spec.country})</span>}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>Site Unlinked</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedSampleId(spec.sample_id)}
                              className="btn btn-secondary"
                              style={{
                                padding: '4px 10px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              Dossier <ChevronRight size={13} />
                            </button>
                            {canWrite && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditSpecimen(spec.sample_id)}
                                  className="btn btn-secondary"
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                  title="Edit provenance"
                                >
                                  <Edit2 size={12} /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSpecimen(spec.sample_id, spec.sample_code)}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    borderRadius: '4px',
                                    border: '1px solid #FECACA',
                                    backgroundColor: '#FEF2F2',
                                    color: 'var(--color-danger)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                  title="Delete ancient provenance"
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </CompactTable>
            </div>
          </div>

          {/* Selected Specimen Provenance Drawer */}
          {selectedSampleId && (
            <div
              className="card"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
                maxHeight: 'calc(100vh - 160px)',
                overflowY: 'auto',
              }}
            >
              {isDetailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
                  Loading ancient specimen dossier...
                </div>
              ) : selectedDetail ? (
                <>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-teal)' }}>
                          {selectedDetail.sample_code}
                        </span>
                        <span className="badge badge-sand">Ancient Specimen</span>
                      </div>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                        {selectedDetail.sample_name}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSampleId(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Sand/Teal Chronometric Banner */}
                  <div
                    style={{
                      padding: '14px',
                      backgroundColor: 'var(--color-pale-teal)',
                      borderRadius: 'var(--radius-control)',
                      border: '1px solid rgba(40, 125, 120, 0.25)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Calibrated Age (Before Present)
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span className="font-mono" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-teal)' }}>
                        {selectedDetail.estimated_age_years ? selectedDetail.estimated_age_years.toLocaleString() : 'Undetermined'}
                      </span>
                      {selectedDetail.age_uncertainty_years && (
                        <span className="font-mono" style={{ fontSize: '14px', color: 'var(--color-muted)' }}>
                          ± {selectedDetail.age_uncertainty_years.toLocaleString()} BP
                        </span>
                      )}
                    </div>
                    {selectedDetail.dating_method && (
                      <div style={{ fontSize: '12px', color: 'var(--color-ink)' }}>
                        <span style={{ color: 'var(--color-muted)' }}>Method: </span>
                        <strong>{selectedDetail.dating_method}</strong>
                      </div>
                    )}
                  </div>

                  {/* Stratigraphic Context Card */}
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: '#FFFFFF',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={14} color="var(--color-teal)" />
                      <span>Stratigraphic & Field Context</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <div style={{ color: 'var(--color-muted)', fontSize: '11px' }}>Excavation Layer</div>
                        <div style={{ fontWeight: 600 }}>{selectedDetail.excavation_layer || '—'}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--color-muted)', fontSize: '11px' }}>Depth Below Surface</div>
                        <div className="font-mono" style={{ fontWeight: 600 }}>
                          {selectedDetail.depth_cm !== undefined ? `${selectedDetail.depth_cm} cm` : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--color-muted)', fontSize: '11px' }}>Preservation State</div>
                        <div style={{ fontWeight: 600 }}>{selectedDetail.preservation_state || '—'}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--color-muted)', fontSize: '11px' }}>Grid Context Ref</div>
                        <div style={{ fontWeight: 600 }}>{selectedDetail.context_reference || '—'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Excavation Site Provenance Card */}
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-background)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Compass size={14} color="var(--color-teal)" />
                      <span>Archaeological Site Provenance</span>
                    </div>

                    {selectedDetail.site_name ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{selectedDetail.site_name}</span>
                          <span className="badge badge-neutral font-mono">{selectedDetail.site_code}</span>
                        </div>
                        <div style={{ color: 'var(--color-muted)' }}>
                          {selectedDetail.region ? `${selectedDetail.region}, ` : ''}
                          {selectedDetail.country || 'Global'}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>
                        No excavation site linked to this specimen.
                      </div>
                    )}
                  </div>

                  {/* Biological Base Specimen Metadata */}
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: '#FFFFFF',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ color: 'var(--color-muted)' }}>
                      Biological Classification: <strong>{selectedDetail.sample_type_name || selectedDetail.sample_type_code}</strong>
                    </div>
                    <div style={{ color: 'var(--color-muted)' }}>
                      Storage Location: <strong className="font-mono">{selectedDetail.storage_location_code || 'Unassigned'}</strong>
                    </div>
                    <div style={{ color: 'var(--color-muted)' }}>
                      Laboratory Status: <strong>{selectedDetail.status}</strong>
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button disabled={!canWrite}
                      type="button"
                      onClick={() => setIsEditSpecimenModalOpen(true)}
                      className="btn btn-secondary"
                      style={{ fontSize: '12px' }}
                    >
                      Edit Chronometrics & Stratum
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        /* Excavation Sites Registry Tab */
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '4px' }}>
              Excavation Sites Registry
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
              Geographic coordinates, stratigraphical survey metadata, and linked specimen counts for excavation projects.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <CompactTable label="archaeological sites" extra={[3, 6, 7]} showLens={false}>
              <table className="table" style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>Site Code</th>
                  <th>Site Name</th>
                  <th>Region / Province</th>
                  <th>Country</th>
                  <th>Specimens</th>
                  <th>Contextual Survey Notes</th>
                  <th>Date Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                      Loading excavation sites...
                    </td>
                  </tr>
                ) : sites.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                      No excavation sites registered yet.
                    </td>
                  </tr>
                ) : (
                  sites.map((site) => (
                    <tr key={site.archaeological_site_id}>
                      <td className="font-mono" style={{ fontWeight: 600, color: 'var(--color-teal)' }}>
                        {site.site_code}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{site.site_name}</td>
                      <td>{site.region || '—'}</td>
                      <td>{site.country || '—'}</td>
                      <td>
                        <span
                          className="badge badge-sand font-mono"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Scroll size={11} /> {site.specimen_count} specimens
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-muted)', fontSize: '12px', maxWidth: '300px' }}>
                        {site.context_notes || '—'}
                      </td>
                      <td style={{ color: 'var(--color-muted)', fontSize: '12px' }}>
                        {new Date(site.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        {canWrite ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenEditSite(site)}
                              className="btn btn-secondary"
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="Edit site"
                            >
                              <Edit2 size={12} /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSite(site.archaeological_site_id, site.site_name)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                borderRadius: '4px',
                                border: '1px solid #FECACA',
                                backgroundColor: '#FEF2F2',
                                color: 'var(--color-danger)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="Delete site"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Read Only</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </CompactTable>
          </div>
        </div>
      )}

      {/* Modal: Attach Ancient Provenance */}
      {isNewSpecimenModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(23, 43, 58, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              backgroundColor: '#FFFFFF',
              boxShadow: 'var(--shadow-lg)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                Attach Ancient Provenance Profile
              </h3>
              <button
                type="button"
                onClick={() => setIsNewSpecimenModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSpecimen} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Base Specimen ID *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={newSpecimenForm.sample_id}
                  onChange={(e) => setNewSpecimenForm({ ...newSpecimenForm, sample_id: Number(e.target.value) })}
                  className="input font-mono"
                  placeholder="e.g. 1 (Sample ID)"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Excavation Site
                </label>
                <select
                  value={newSpecimenForm.archaeological_site_id || ''}
                  onChange={(e) =>
                    setNewSpecimenForm({
                      ...newSpecimenForm,
                      archaeological_site_id: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="input"
                >
                  <option value="">Unassigned Site</option>
                  {sites.map((s) => (
                    <option key={s.archaeological_site_id} value={s.archaeological_site_id}>
                      {s.site_name} ({s.site_code})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Calibrated Age (Years BP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newSpecimenForm.estimated_age_years || ''}
                    onChange={(e) =>
                      setNewSpecimenForm({
                        ...newSpecimenForm,
                        estimated_age_years: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="input font-mono"
                    placeholder="e.g. 38500"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Uncertainty (± Years)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newSpecimenForm.age_uncertainty_years || ''}
                    onChange={(e) =>
                      setNewSpecimenForm({
                        ...newSpecimenForm,
                        age_uncertainty_years: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="input font-mono"
                    placeholder="e.g. 850"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Dating Method
                </label>
                <input
                  type="text"
                  value={newSpecimenForm.dating_method || ''}
                  onChange={(e) => setNewSpecimenForm({ ...newSpecimenForm, dating_method: e.target.value })}
                  className="input"
                  placeholder="e.g. 14C Accelerator Mass Spectrometry"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Excavation Layer / Stratum
                  </label>
                  <input
                    type="text"
                    value={newSpecimenForm.excavation_layer || ''}
                    onChange={(e) => setNewSpecimenForm({ ...newSpecimenForm, excavation_layer: e.target.value })}
                    className="input"
                    placeholder="e.g. Stratum IVb"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Depth (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={newSpecimenForm.depth_cm || ''}
                    onChange={(e) =>
                      setNewSpecimenForm({
                        ...newSpecimenForm,
                        depth_cm: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="input font-mono"
                    placeholder="e.g. 285.5"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Preservation State
                  </label>
                  <select
                    value={newSpecimenForm.preservation_state || 'calcified'}
                    onChange={(e) => setNewSpecimenForm({ ...newSpecimenForm, preservation_state: e.target.value })}
                    className="input"
                  >
                    <option value="calcified">Calcified</option>
                    <option value="desiccated">Desiccated Bone</option>
                    <option value="charred">Charred</option>
                    <option value="fragmentary">Fragmentary</option>
                    <option value="intact">Intact</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Context Grid Ref
                  </label>
                  <input
                    type="text"
                    value={newSpecimenForm.context_reference || ''}
                    onChange={(e) => setNewSpecimenForm({ ...newSpecimenForm, context_reference: e.target.value })}
                    className="input"
                    placeholder="e.g. Trench B-4, Quad 2"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewSpecimenModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>
                  Attach Provenance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Provenance */}
      {isEditSpecimenModalOpen && selectedDetail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(23, 43, 58, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              backgroundColor: '#FFFFFF',
              boxShadow: 'var(--shadow-lg)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                Edit Chronometrics for {selectedDetail.sample_code}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditSpecimenModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateSpecimen} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Excavation Site
                </label>
                <select
                  value={editSpecimenForm.archaeological_site_id || ''}
                  onChange={(e) =>
                    setEditSpecimenForm({
                      ...editSpecimenForm,
                      archaeological_site_id: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="input"
                >
                  <option value="">Unassigned Site</option>
                  {sites.map((s) => (
                    <option key={s.archaeological_site_id} value={s.archaeological_site_id}>
                      {s.site_name} ({s.site_code})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Calibrated Age (Years BP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editSpecimenForm.estimated_age_years || ''}
                    onChange={(e) =>
                      setEditSpecimenForm({
                        ...editSpecimenForm,
                        estimated_age_years: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="input font-mono"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Uncertainty (± Years)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editSpecimenForm.age_uncertainty_years || ''}
                    onChange={(e) =>
                      setEditSpecimenForm({
                        ...editSpecimenForm,
                        age_uncertainty_years: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="input font-mono"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Dating Method
                </label>
                <input
                  type="text"
                  value={editSpecimenForm.dating_method || ''}
                  onChange={(e) => setEditSpecimenForm({ ...editSpecimenForm, dating_method: e.target.value })}
                  className="input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Excavation Layer / Stratum
                  </label>
                  <input
                    type="text"
                    value={editSpecimenForm.excavation_layer || ''}
                    onChange={(e) => setEditSpecimenForm({ ...editSpecimenForm, excavation_layer: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Depth (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={editSpecimenForm.depth_cm || ''}
                    onChange={(e) =>
                      setEditSpecimenForm({
                        ...editSpecimenForm,
                        depth_cm: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="input font-mono"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Preservation State
                  </label>
                  <input
                    type="text"
                    value={editSpecimenForm.preservation_state || ''}
                    onChange={(e) => setEditSpecimenForm({ ...editSpecimenForm, preservation_state: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Context Grid Ref
                  </label>
                  <input
                    type="text"
                    value={editSpecimenForm.context_reference || ''}
                    onChange={(e) => setEditSpecimenForm({ ...editSpecimenForm, context_reference: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditSpecimenModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Register Excavation Site */}
      {isNewSiteModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(23, 43, 58, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '500px',
              padding: '24px',
              backgroundColor: '#FFFFFF',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                Register Archaeological Site
              </h3>
              <button
                type="button"
                onClick={() => setIsNewSiteModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSite} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Site Code *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    required
                    value={newSiteForm.site_code}
                    onChange={(e) => setNewSiteForm({ ...newSiteForm, site_code: e.target.value })}
                    className="input font-mono"
                    placeholder="SITE-XXXXXX"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={generateSiteCode}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px' }}
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Site Name *
                </label>
                <input
                  type="text"
                  required
                  value={newSiteForm.site_name}
                  onChange={(e) => setNewSiteForm({ ...newSiteForm, site_name: e.target.value })}
                  className="input"
                  placeholder="e.g. Bhimbetka Rock Shelters Sector 3"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Region / Province
                  </label>
                  <input
                    type="text"
                    value={newSiteForm.region || ''}
                    onChange={(e) => setNewSiteForm({ ...newSiteForm, region: e.target.value })}
                    className="input"
                    placeholder="e.g. Madhya Pradesh"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Country
                  </label>
                  <input
                    type="text"
                    value={newSiteForm.country || ''}
                    onChange={(e) => setNewSiteForm({ ...newSiteForm, country: e.target.value })}
                    className="input"
                    placeholder="e.g. India"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Context & Stratigraphy Notes
                </label>
                <textarea
                  value={newSiteForm.context_notes || ''}
                  onChange={(e) => setNewSiteForm({ ...newSiteForm, context_notes: e.target.value })}
                  className="input"
                  rows={3}
                  placeholder="Archaeological horizons, cultural period, taphonomic survey details..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewSiteModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>
                  Save Site
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Archaeological Site */}
      {editingSite && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(23, 43, 58, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              backgroundColor: '#FFFFFF',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                  Edit Excavation Site
                </h3>
                <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-teal)' }}>
                  {editingSite.site_code}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingSite(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateSite} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Site Name *
                </label>
                <input
                  type="text"
                  required
                  value={editSiteForm.site_name || ''}
                  onChange={(e) => setEditSiteForm({ ...editSiteForm, site_name: e.target.value })}
                  className="input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Region / Province
                  </label>
                  <input
                    type="text"
                    value={editSiteForm.region || ''}
                    onChange={(e) => setEditSiteForm({ ...editSiteForm, region: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Country
                  </label>
                  <input
                    type="text"
                    value={editSiteForm.country || ''}
                    onChange={(e) => setEditSiteForm({ ...editSiteForm, country: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Context & Stratigraphy Notes
                </label>
                <textarea
                  value={editSiteForm.context_notes || ''}
                  onChange={(e) => setEditSiteForm({ ...editSiteForm, context_notes: e.target.value })}
                  className="input"
                  rows={3}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingSite(null)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>
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
