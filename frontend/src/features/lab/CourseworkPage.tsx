import { NormalizationExplorer } from './NormalizationExplorer';
import { useEffect, useState } from 'react';
import { apiRequest } from '../../common/apiClient';
import { useAuth } from '../auth/AuthContext';

interface LibraryFile { id: number; name: string; section: string; media: string; owner: number }
interface Catalog { hidden_generated: string[]; sections: Record<string, string>; files: LibraryFile[] }
const sections: Record<string, string> = {synopsis: '1. Synopsis', requirements: '2. Requirements', er: '3. Chen ER diagram', tests: '4. Test options', dfd: '5. Data flow diagrams', normalization: '6. Normalized tables', security: '7. Forms, security & validation'};
const guidance: Record<string, string> = {synopsis: 'Upload your approved synopsis; no replacement synopsis is generated.', requirements: 'Software/hardware, functional and nonfunctional requirements, acceptance criteria and syllabus traceability.', er: 'Six core entities: Chen notation, relationship attributes, derived attributes and relational mapping. Full database reference is optional.', tests: 'Six SQL queries, a rollback exercise, six executable TinyDB checks and integrity/security cases.', dfd: 'Balanced context (level 0) and level 1 diagrams, flow dictionary and process/store explanations.', normalization: 'Worked UNF to 1NF to 2NF to 3NF decomposition, lossless joins and explicit BCNF assumptions.', security: 'Form inputs, validations, access control, transaction boundaries and upload protection.'};
const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export function CourseworkPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'RESEARCHER';
  const [catalog, setCatalog] = useState<Catalog>();
  const [section, setSection] = useState('synopsis');
  const [fileId, setFileId] = useState<number>();
  const [variant, setVariant] = useState('default');
  const [zoom, setZoom] = useState(100);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [revision, setRevision] = useState(0);
  const [hideGenerated, setHideGenerated] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Catalog>(`/coursework?deleted=${deleted}`, { signal: controller.signal }).then(result => {
      setCatalog(result); setHideGenerated(Object.fromEntries(result.hidden_generated.map(section => [section, true])));
    })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [deleted, revision]);

  const endpoint = fileId ? `/uploads/${fileId}` : `/generated/${section}?variant=${variant}`;
  const hasPreview = !deleted && (fileId !== undefined || (section !== 'synopsis' && !hideGenerated[section]));
  useEffect(() => {
    setPreview('');
    if (!hasPreview) return;
    const controller = new AbortController();
    let url = '';
    fetch(`${base}/coursework${endpoint}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('samplemind_token')}` }, signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('Could not load this material.');
      url = URL.createObjectURL(await response.blob());
      setPreview(url);
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [endpoint, hasPreview, revision]);

  async function download() {
    setError('');
    try {
      const response = await fetch(`${base}/coursework${endpoint}${endpoint.includes('?') ? '&' : '?'}download=true`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('samplemind_token')}` },
      });
      if (!response.ok) throw new Error('Download failed.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url;
      link.download = fileId ? catalog?.files.find(file => file.id === fileId)?.name || 'material'
        : `SampleMind-${section}-${variant}.${variant === 'pdf' ? 'pdf' : (section === 'er' || section === 'dfd') && variant !== 'notes' ? 'svg' : 'html'}`;
      link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError((err as Error).message); }
  }
  async function upload(file: File) {
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.set('section', section); form.set('file', file);
      const response = await fetch(`${base}/coursework/uploads`, { method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('samplemind_token')}` }, body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.detail?.message || 'Upload failed.');
      setDeleted(false); setFileId(result.id); setRevision(value => value + 1);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function removeOrRestore(id: number, restore = false) {
    setBusy(true); setError('');
    try {
      await apiRequest(`/coursework/uploads/${id}${restore ? '/restore' : ''}`, { method: restore ? 'POST' : 'DELETE' });
      setFileId(undefined); setRevision(value => value + 1);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="lab-stack">
    <header className="lab-hero"><div><div className="lab-kicker">RVCE · CD252IA</div><h1>DBMS</h1>
      <p>Project requirements, diagrams, schemas and validation materials.</p></div></header>
    <nav className="lab-tabs" role="tablist" aria-label="DBMS coursework subtabs" style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
      {Object.entries(sections).map(([id, label]) => <button type="button" key={id}
        aria-pressed={section === id} onClick={() => { setSection(id); setVariant('default'); setDeleted(false); setFileId(undefined); setError(''); setZoom(100); }}>{label}</button>)}
    </nav>
    <section className="card lab-panel" role="tabpanel" id="coursework-panel" aria-labelledby={`tab-${section}`}>
      <h2>{sections[section]}</h2><p className="lab-muted">{guidance[section]}</p>
      {section !== 'synopsis' && <label className="search-label">Generated content
        <select className="input-field" value={variant} onChange={event => { setVariant(event.target.value); setFileId(undefined); setError(''); }}>
          <option value="default">{section === 'er' ? 'Core Chen diagram (6 entities)' : section === 'dfd' ? 'Context + level 1 diagrams (SVG)' : 'Complete document (HTML)'}</option>
          {section === 'er' && <><option value="attributes">Full database attribute atlas (optional)</option><option value="full">Full database ER reference (optional)</option></>}
          {(section === 'er' || section === 'dfd') && <option value="notes">Notation, mapping and explanations (HTML)</option>}
          <option value="pdf">Complete document (PDF)</option>
        </select>
      </label>}
      <div className="lab-chips">
        {canManage && <label className="btn-secondary">Upload material
          <input type="file" accept=".pdf,.docx,.svg,.html,.png,.jpg,.jpeg,.txt" disabled={busy}
            onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} />
        </label>}
        <button className="btn-secondary" type="button" onClick={() => { setDeleted(!deleted); setFileId(undefined); }}>
          {deleted ? 'Active materials' : 'Removed uploads'}
        </button>
        {hasPreview && <button className="btn-primary" type="button" onClick={download}>Download displayed material</button>}
      </div>
      {error && <div role="alert"><p className="lab-error">{error}</p><button type="button" className="btn-secondary" onClick={() => { setError(''); setRevision(value => value + 1); }}>Retry loading</button></div>}
      {!deleted && section !== 'synopsis' && <div className="lab-chips">
        <button className="btn-secondary" type="button" disabled={busy || (!canManage && hideGenerated[section])} onClick={async () => {
          if (!hideGenerated[section]) { setFileId(undefined); return; }
          setBusy(true); setError('');
          try {
            await apiRequest(`/coursework/generated/${section}/restore`, { method: 'POST' });
            setHideGenerated(previous => ({ ...previous, [section]: false })); setFileId(undefined); setRevision(value => value + 1);
          } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
        }}>{hideGenerated[section] ? 'Restore generated material' : 'Show generated material'}</button>
        {canManage && !fileId && !hideGenerated[section] && <button className="btn-secondary" type="button" disabled={busy}
          onClick={async () => {
            setBusy(true); setError('');
            try {
              await apiRequest(`/coursework/generated/${section}`, { method: 'DELETE' });
              setHideGenerated(previous => ({ ...previous, [section]: true })); setRevision(value => value + 1);
            } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
          }}>Remove generated material</button>}
      </div>}
      <div className="lab-chips">
        {catalog?.files.filter(file => file.section === section).map(file => <div className="cryo-detail" key={file.id}>
          <button className="cohort-text-button" type="button" disabled={deleted} onClick={() => setFileId(file.id)}>{file.name}</button>
          {canManage && (user?.role === 'ADMIN' || file.owner === user?.user_id) &&
            <button className="btn-secondary" type="button" disabled={busy} onClick={() => removeOrRestore(file.id, deleted)}>
              {deleted ? 'Restore' : 'Remove'}
            </button>}
        </div>)}
      </div>
      {section === 'normalization' && <NormalizationExplorer />}
      {preview && hasPreview ? ((fileId ? catalog?.files.find(file => file.id === fileId)?.media.startsWith('image/')
        : (section === 'er' || section === 'dfd') && !['notes', 'pdf'].includes(variant)) ? <div style={{ width: '100%' }}>
          <label className="search-label">Diagram zoom   {zoom}%
            <input type="range" min="50" max="200" step="10" value={zoom} onChange={event => setZoom(Number(event.target.value))} />
          </label>
          <div style={{ maxHeight: '75vh', overflow: 'auto', border: '1px solid #ccdcd6', background: 'white' }}>
            <img src={preview} alt={catalog?.sections[section] || 'Uploaded diagram'} style={{ width: zoom + '%', maxWidth: 'none', display: 'block' }} />
          </div>
        </div> : <iframe title={catalog?.sections[section] || 'DBMS material'} src={preview}
          sandbox="" style={{ width: '100%', height: '75vh', border: '1px solid #ccdcd6', borderRadius: 8, background: 'white' }} />)
        : <p className="lab-muted">{hasPreview ? 'Loading material...' : 'Choose or upload a material to display.'}</p>}
    </section>
  </div>;
}
