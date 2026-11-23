import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, FlaskConical, Layers, Search, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../../common/apiClient';
import { ConceptInfo } from '../../components/ConceptInfo';
import './cohort.css';

interface Decision {
  id: number;
  code: string;
  name: string;
  available: boolean;
  passed: number;
  required: number;
  eligible: boolean;
}

interface Evidence {
  test_type: string;
  sample_test_id: number | null;
  test_status: string | null;
  result_interpretation: string | null;
  evidence_date: string | null;
  verdict: 'pass' | 'fail' | 'missing' | 'pending' | 'unconfirmed';
}

interface Review {
  reference: string;
  required_assays: string[];
  results: Decision[];
  eligible_count: number;
  assume_pass: string[];
  focused: {
    id: number;
    status: string;
    quantity: number;
    unit: string;
    location: string | null;
    active_storage: boolean;
    checks: Evidence[];
    preview_passed: number;
    preview_eligible: boolean;
  };
}

type Filter = 'all' | 'included' | 'excluded';
type Request = { reference: string; focus?: number; assume?: string[] };
const verdictLabel = {
  pass: 'Passed', fail: 'Failed', missing: 'Missing', pending: 'Pending', unconfirmed: 'Unconfirmed',
};
const verdictExplanation = {
  pass: 'The latest completed assay is recorded as Pass.',
  fail: 'The latest completed assay is recorded as Fail.',
  missing: 'There is no assay row of this type for this specimen.',
  pending: 'An assay is scheduled or in progress, with no completed result.',
  unconfirmed: 'The available record does not establish a pass.',
};
const pageSize = 10;

export function CohortReview({ onOpenSample, onOpenAssay }: {
  onOpenSample: (id: number) => void;
  onOpenAssay: (id: number) => void;
}) {
  const [input, setInput] = useState('S003');
  const [request, setRequest] = useState<Request>({ reference: 'S003' });
  const [review, setReview] = useState<Review>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ reference_code: request.reference });
    if (request.focus) params.set('focus_id', String(request.focus));
    request.assume?.forEach(assay => params.append('assume_pass', assay));
    apiRequest<Review>(`/lab/cohort?${params}`, { signal: controller.signal }).then(setReview)
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request]);

  function run(event: FormEvent) {
    event.preventDefault();
    const reference = input.trim();
    if (!reference) return;
    setReview(undefined);
    setFilter('all');
    setPage(0);
    setRequest({ reference });
  }

  function select(id: number) {
    setRequest({ reference: review?.reference || request.reference, focus: id });
  }

  function preview(assume: string[] = []) {
    if (!review) return;
    setRequest({ reference: review.reference, focus: review.focused.id, assume });
  }

  const filtered = (review?.results ?? []).filter(row => filter === 'all' || row.eligible === (filter === 'included'));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const selected = review?.results.find(row => row.id === review.focused.id);
  const isCurrent = Boolean(review && (!request.focus || request.focus === review.focused.id));
  const available = review?.eligible_count ?? 0;
  const total = review?.results.length ?? 0;
  const demo = review?.results.find(row => !row.eligible && row.available);
  const assumptions = request.assume ?? [];
  const previewReady = review?.assume_pass.length === assumptions.length &&
    assumptions.every(assay => review?.assume_pass.includes(assay));

  const getExclusionReasons = () => {
    if (!review?.focused || !selected) return [];
    const reasons: string[] = [];

    // Table / Storage constraints:
    const status = review.focused.status;
    if (status !== 'IN_STORAGE') {
      reasons.push(`Lifecycle Status: Current status is '${status}' (must be 'IN_STORAGE' to be eligible).`);
    }

    if (review.focused.quantity <= 0) {
      reasons.push(`Insufficient Stock: Recorded quantity is ${review.focused.quantity} ${review.focused.unit} (must have positive stock > 0).`);
    }

    if (!review.focused.location) {
      reasons.push('Storage Location: No physical storage unit assigned (unplaced specimen).');
    } else if (!review.focused.active_storage) {
      reasons.push(`Storage Facility Inactive: Unit '${review.focused.location}' is currently decommissioned or retired.`);
    }

    // Assay Evidence constraints:
    review.focused.checks.forEach((check) => {
      if (check.verdict === 'missing') {
        reasons.push(`Assay Missing: Required assay '${check.test_type}' has never been performed for this specimen.`);
      } else if (check.verdict === 'fail') {
        reasons.push(`Assay Failed: Latest result for '${check.test_type}' was recorded as FAIL (QC breach).`);
      } else if (check.verdict === 'pending') {
        reasons.push(`Assay In-Flight: Required assay '${check.test_type}' is scheduled or in progress without completed result.`);
      } else if (check.verdict === 'unconfirmed') {
        reasons.push(`Assay Inconclusive: Result for '${check.test_type}' does not confirm an unequivocal PASS.`);
      }
    });

    return reasons;
  };

  const exclusionReasons = getExclusionReasons();

  return (
    <div className="lab-stack cohort-page">
      <header className="cohort-hero">
        <div>
          <span className="cohort-eyebrow"><Layers size={15} /> SampleMind research demo</span>
          <h1>Cohort Review</h1>
          <p>Find out why a specimen qualifies for a group of required assays, or exactly what kept it out.</p>
        </div>
        <FlaskConical className="cohort-hero-icon" aria-hidden="true" />
      </header>

      <section className="card lab-panel">
        <div className="lab-title"><h2>1. Choose a reference specimen</h2>
          <ConceptInfo title="Relational division" steps={['Reference assay types', 'One row per required check', 'Count passes', 'Keep complete coverage']}
            source={{ title: 'SQL-92 division operators and exact relational quotients', url: 'https://dl.acm.org/doi/10.1145/253262.253314' }}>
            <p>Relational division finds specimens that match every requirement of a chosen reference specimen. SQL has no native division keyword, so SampleMind expresses it by joining the reference specimen’s assay types, grouping candidate rows, and testing complete coverage.</p>
          </ConceptInfo>
        </div>
        <form className="lab-controls cohort-form" onSubmit={run}>
          <label className="search-label">Specimen code
            <input className="input-field" value={input} onChange={event => setInput(event.target.value)} required />
          </label>
          <button className="btn-primary" type="submit" disabled={loading}><Search size={15} /> Run review</button>
        </form>
        <p className="lab-muted">Use the demo reference <code>S003</code>, or enter another specimen code to use its recorded assay types.</p>
        {review && review.required_assays.length > 0 &&
          <div className="cohort-tags" aria-label="Required assays">
            {review.required_assays.map(assay => <span key={assay}>{assay}</span>)}
          </div>}
        {review && review.required_assays.length === 0 &&
          <p className="lab-muted">This reference has no recorded assay types. Choose a reference with at least one assay to run the cohort rule.</p>}
      </section>

      {error && <p className="lab-error" role="alert">{error}</p>}
      {loading && <p className="lab-muted" role="status">{review ? 'Refreshing evidence…' : 'Running the cohort query…'}</p>}

      {total > 0 && review && <div className="cohort-workspace">
        <section className="card lab-panel cohort-results">
          <div className="lab-title"><h2>2. Pick a specimen</h2>
            {demo && <button className="cohort-text-button" type="button" onClick={() => {
              if (selected?.id !== demo.id) select(demo.id);
            }}>Try an excluded specimen {demo.code} →</button>}
          </div>
          <div className="cohort-filters" aria-label="Filter cohort decisions">
            <button type="button" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setPage(0); }}>
              All<strong>{total}</strong>
            </button>
            <button type="button" aria-pressed={filter === 'included'} onClick={() => { setFilter('included'); setPage(0); }}>
              Included<strong>{available}</strong>
            </button>
            <button type="button" aria-pressed={filter === 'excluded'} onClick={() => { setFilter('excluded'); setPage(0); }}>
              Excluded<strong>{total - available}</strong>
            </button>
          </div>
          <div className="cohort-coverage" aria-hidden="true"><div style={{ width: `${100 * available / total}%` }} /></div>
          <div className="lab-table-wrap cohort-table-wrap">
            <table className="lab-table cohort-table">
              <thead><tr><th>Specimen</th><th>Assays passed</th><th>Decision</th></tr></thead>
              <tbody>
                {filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row => (
                  <tr key={row.id} className={row.id === (request.focus ?? selected?.id) ? 'cohort-selected' : undefined}>
                    <td>
                      <button className="cohort-specimen-link" type="button" onClick={() => select(row.id)}>
                        <strong>{row.code}</strong><span>{row.name}</span>
                      </button>
                    </td>
                    <td className="cohort-numeric">{row.passed} / {row.required}</td>
                    <td><span className={`cohort-badge ${row.eligible ? 'pass' : 'unconfirmed'}`}>{row.eligible ? 'Included' : 'Excluded'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && <div className="cohort-pagination">
            <button className="btn-secondary" type="button" disabled={currentPage === 0} onClick={() => setPage(page => Math.max(0, page - 1))}>Previous</button>
            <span className="lab-muted">Page {currentPage + 1} of {pages}</span>
            <button className="btn-secondary" type="button" disabled={currentPage >= pages - 1} onClick={() => setPage(page => Math.min(pages - 1, page + 1))}>Next</button>
          </div>}
        </section>

        <section className="card lab-panel cohort-evidence">
          <div className="lab-title"><h2>3. Read the evidence</h2>
            <ConceptInfo title="Why and why-not provenance"
              steps={['Pair specimen with each required assay', 'Left join ranked records', 'Keep missing checks visible', 'Explain the decision']}
              source={{ title: 'ACM SIGMOD 2026 provenance tutorial paper', url: 'https://doi.org/10.1145/3788853.3801877' }}>
              <p>A result list can tell us which specimens qualified. For a specimen that missed the list, this view explains whether a required record is missing, pending, failed or inconclusive, and points to the assay row when one exists.</p>
              <p>SampleMind applies the research idea to a fixed cohort rule over the lab’s specimen, storage and assay tables.</p>
            </ConceptInfo>
          </div>
          {isCurrent && selected ? <>
            <div className="cohort-evidence-heading">
              <div><h3>{selected.code}</h3><p>{selected.name}</p></div>
              <button className="btn-secondary" type="button" onClick={() => onOpenSample(selected.id)}>Specimen record <ArrowRight size={15} /></button>
            </div>
            <div className={`cohort-availability ${selected.available ? 'pass' : 'unconfirmed'}`}>
              <strong>{selected.available ? 'Available in storage' : 'Unavailable under the cohort rule'}</strong>
              <span>{review.focused.status.replace(/_/g, ' ').toLowerCase()} · {review.focused.quantity} {review.focused.unit} · {
                review.focused.location ? review.focused.location + (review.focused.active_storage ? '' : ' (inactive)') : 'no storage location'
              }</span>
              <small>Requires in-storage status, positive stock and an active location.</small>
            </div>

            {/* Comprehensive Eligibility / Exclusion Provenance Reasons */}
            <div
              style={{
                marginTop: '10px',
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: selected.eligible ? '#F0FDF4' : '#FEF2F2',
                border: selected.eligible ? '1px solid #86EFAC' : '1px solid #FCA5A5',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: selected.eligible ? '#15803D' : '#991B1B',
                  marginBottom: '6px',
                }}
              >
                {selected.eligible ? (
                  <>
                    <CheckCircle2 size={16} /> Fully Qualified Cohort Candidate
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} /> Exact Reasons for Cohort Exclusion ({exclusionReasons.length}):
                  </>
                )}
              </div>

              {selected.eligible ? (
                <p style={{ margin: 0, fontSize: '12px', color: '#166534' }}>
                  This specimen satisfies all inventory availability constraints (in-storage, positive stock, active unit) and has confirmed PASS results for all {selected.required} required assays.
                </p>
              ) : (
                <ul
                  style={{
                    margin: '6px 0 0 0',
                    paddingLeft: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    fontSize: '12px',
                    color: '#7F1D1D',
                  }}
                >
                  {exclusionReasons.map((reason, rIdx) => (
                    <li key={rIdx} style={{ lineHeight: 1.4 }}>
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="lab-title"><h3>Required assay evidence</h3>
              <ConceptInfo title="Window functions and source rows" steps={['Group by specimen and assay type', 'Rank completed rows first', 'Pick newest completed result']}>
                <p>SQL ROW_NUMBER chooses the latest completed result. If none exists, the query shows a pending record when available. Ties are broken by assay ID, and the LEFT JOIN keeps a missing row visible.</p>
              </ConceptInfo>
            </div>
            <ol className="cohort-evidence-rail">
              {review.focused.checks.map(check => (
                <li className={check.verdict} key={check.test_type}>
                  <div className="cohort-check-title"><strong>{check.test_type}</strong>
                    <span className={`cohort-badge ${check.verdict}`}>{verdictLabel[check.verdict]}</span>
                  </div>
                  <p>{verdictExplanation[check.verdict]}</p>
                  {previewReady && assumptions.includes(check.test_type) &&
                    <small className="cohort-assumed">Assumed pass in preview</small>}
                  {check.sample_test_id !== null &&
                    <button className="cohort-text-button" type="button" onClick={() => onOpenAssay(check.sample_test_id!)}>
                      Open assay #{check.sample_test_id}{check.result_interpretation ? ` · ${check.result_interpretation}` : ''}
                    </button>}
                </li>
              ))}
            </ol>

            <div className="cohort-preview">
              <div className="lab-title"><h3>What if these assays passed?</h3>
                <ConceptInfo title="Read-only what-if query" steps={['Keep recorded evidence', 'Assume selected passes in SQL', 'Compare both decisions']}
                  source={{ title: 'Compression for High-Performance Lineage, ProvenanceWeek 2025', url: 'https://doi.org/10.1145/3736229.3736264' }}>
                  <p>Recent database work uses lineage to support interactive what-if analysis. Here the query counts selected requirements as passed in a separate preview column. Both counts use the same SQL read, and the preview writes no records.</p>
                </ConceptInfo>
              </div>
              {review.focused.checks.some(check => check.verdict !== 'pass') ? (
                <fieldset className="cohort-assumptions" disabled={loading}>
                  <legend className="lab-muted">Assume passing results for selected assays</legend>
                  {review.focused.checks.filter(check => check.verdict !== 'pass').map(check => (
                    <label key={check.test_type}>
                      <input type="checkbox" checked={assumptions.includes(check.test_type)}
                        onChange={event => preview(event.target.checked ? [...assumptions, check.test_type]
                          : assumptions.filter(assay => assay !== check.test_type))} />
                      {check.test_type}
                    </label>
                  ))}
                </fieldset>
              ) : <p className="lab-muted">All required assays already pass.</p>}
              {assumptions.length > 0 && previewReady && <div className="cohort-comparison" aria-live="polite">
                <div><small>Recorded</small><strong>{selected.eligible ? 'Included' : 'Excluded'}</strong><span>{selected.passed}/{selected.required} assays pass</span></div>
                <ArrowRight size={18} aria-hidden="true" />
                <div><small>Hypothetical</small><strong>{review.focused.preview_eligible ? 'Included' : 'Excluded'}</strong>
                  <span>{review.focused.preview_passed}/{selected.required} assays pass</span></div>
                <button type="button" className="icon-control" title="Clear preview" aria-label="Clear preview" onClick={() => preview()}><X size={15} /></button>
              </div>}
            </div>
          </> : <p className="lab-muted">{loading ? 'Loading specimen evidence…' : 'Choose a specimen to inspect its evidence.'}</p>}
        </section>
      </div>}
    </div>
  );
}
