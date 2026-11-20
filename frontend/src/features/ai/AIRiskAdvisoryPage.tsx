import { useEffect, useState, type FormEvent } from 'react';
import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import { ConceptInfo } from '../../components/ConceptInfo';
import { useAuth } from '../auth/AuthContext';
import { samplesService } from '../samples/samplesService';
import type { SampleListItem } from '../samples/types';
import { aiService } from './aiService';
import { ModelExperiment } from './ModelExperiment';
import type { AIAnalysisResponse, AIReviewPayload, RiskDistributionResponse } from './types';

const emptyReview: AIReviewPayload = { review_feedback: 'agree', review_notes: '' };

export function AIRiskAdvisoryPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [samples, setSamples] = useState<SampleListItem[]>([]);
  const [sampleId, setSampleId] = useState<number>();
  const [analyses, setAnalyses] = useState<AIAnalysisResponse[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [distribution, setDistribution] = useState<RiskDistributionResponse>();
  const [version, setVersion] = useState('');
  const [review, setReview] = useState(emptyReview);
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const role = user?.role || '';
  const canAssess = ['ADMIN', 'RESEARCHER', 'TECHNICIAN'].includes(role);
  const canReview = ['ADMIN', 'RESEARCHER', 'REVIEWER'].includes(role);
  const current = analyses.find(item => item.ai_analysis_id === selectedId);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      samplesService.listSamples({ search, pageSize: 30 }).then(result => {
        if (!active) return;
        setSamples(result.items);
        setSampleId(previous => result.items.some(item => item.sample_id === previous) ? previous : result.items[0]?.sample_id);
      }).catch(err => { if (active) setError(err.message); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search]);

  useEffect(() => {
    let active = true;
    Promise.all([aiService.getActiveModel(), aiService.getRiskDistribution()]).then(([method, counts]) => {
      if (active) { setVersion(method.model_version); setDistribution(counts); }
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setAnalyses([]);
    setSelectedId(undefined);
    setReview(emptyReview);
    if (sampleId === undefined) { setHistoryLoading(false); return; }
    setHistoryLoading(true);
    aiService.getSampleAnalyses(sampleId).then(history => {
      if (active) { setAnalyses(history); setSelectedId(history[0]?.ai_analysis_id); }
    }).catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [sampleId]);

  async function assess() {
    if (sampleId === undefined || busy || historyLoading) return;
    setBusy(true);
    setError('');
    try {
      const assessment = await aiService.predictSampleRisk(sampleId);
      setAnalyses(previous => [assessment, ...previous]);
      setSelectedId(assessment.ai_analysis_id);
      setReview(emptyReview);
      setDistribution(await aiService.getRiskDistribution());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (!current || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await aiService.reviewAnalysis(current.ai_analysis_id, review);
      setAnalyses(previous => previous.map(item => item.ai_analysis_id === saved.ai_analysis_id ? saved : item));
      setReview(emptyReview);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lab-stack">
      <header className="lab-hero">
        <div>
          <div className="lab-kicker">SPECIMEN OPERATIONS · HUMAN REVIEW</div>
          <h1>Handling advisory</h1>
          <p>Check recorded lab evidence, identify a handling priority and log a reviewer’s decision.</p>
        </div>
        <div className="lab-hero-mark" aria-hidden="true"><ShieldCheck size={52} strokeWidth={1.3} /></div>
      </header>
      <section className="card lab-panel">
        <div className="lab-title"><ShieldCheck size={20} /><h2>Evidence rules</h2>
          <ConceptInfo title="Handling priority and decision audit" steps={['Recorded specimen evidence', 'Highest rule priority', 'Persist assessment', 'Record human review']}>
            <p>Quarantine, missing status or a high or critical unresolved incident raises high priority. Assay issues, missing evidence, unavailable specimens and other open incidents raise medium priority. A low priority means these checks raised no flag.</p>
            <p>The rules are authored in the service and use no training dataset. An assessment stores its input snapshot and a foreign key to the method registry. The method name and schema version are read from the registry. A review records feedback and rationale in the same SQL transaction as its audit event.</p>
          </ConceptInfo>
        </div>
        <p className="lab-muted">{version || 'Version loading'} · Deterministic triage · Current rule assessments only</p>
        {distribution && <div className="advisory-counts">
          <div><strong>{distribution.counts.HIGH}</strong><span>High</span></div>
          <div><strong>{distribution.counts.MEDIUM}</strong><span>Medium</span></div>
          <div><strong>{distribution.counts.LOW}</strong><span>Low</span></div>
          <div><strong>{distribution.unassessed_samples}</strong><span>Unassessed</span></div>
        </div>}
      </section>
      {error && <p className="lab-error" role="alert">{error}</p>}
      <div className="lab-grid">
        <section className="card lab-panel">
          <div className="lab-title"><ClipboardCheck size={20} /><h2>Specimen and history</h2></div>
          <fieldset className="lab-controls" disabled={busy}>
            <label>Find by code or name<input className="input-field" value={search} maxLength={80}
              onChange={event => setSearch(event.target.value)} /></label>
            <label>Specimen<select className="input-field" value={sampleId ?? ''} onChange={event => setSampleId(Number(event.target.value))}>
              {samples.length === 0 && <option value="">No matching specimens</option>}
              {samples.map(item => <option value={item.sample_id} key={item.sample_id}>{item.sample_code} · {item.sample_name}</option>)}
            </select></label>
            {canAssess && <button type="button" className="btn-primary" disabled={!sampleId || historyLoading} onClick={assess}>
              {busy ? 'Saving…' : 'Run assessment'}
            </button>}
          </fieldset>
          <div className="trace-rail">
            {analyses.map(item => <button type="button" key={item.ai_analysis_id} className="trace-node"
              disabled={busy} aria-pressed={item.ai_analysis_id === selectedId}
              onClick={() => { setSelectedId(item.ai_analysis_id); setReview(emptyReview); }}>
              <strong>{item.legacy ? 'Archived assessment' : `${item.predicted_risk} handling priority`}</strong>
              <span>{new Date(item.analysed_at).toLocaleString()} · {item.review_feedback ? 'Reviewed' : 'Awaiting review'}</span>
            </button>)}
          </div>
          {analyses.length === 0 && <p className="lab-muted">{historyLoading ? 'Loading assessment history…' : 'No recorded assessments for this specimen.'}</p>}
        </section>
        <section className="card lab-panel" aria-live="polite">
          <div className="lab-title"><h2>Assessment evidence</h2></div>
          {!current ? <p className="lab-muted">Run an assessment or select one from the history.</p> : <>
            <h3>{current.sample_code} · {current.sample_name}</h3>
            {current.legacy ? <p className="lab-muted">This archived record predates the active handling rules. Run a new assessment for current evidence.</p> : <>
              <p className="badge badge-teal">{current.predicted_risk} PRIORITY</p>
              <ul className="advisory-factors">
                {current.important_factors.map(factor => <li key={factor.factor}><strong>{factor.factor}</strong><p>{factor.detail}</p></li>)}
              </ul>
              <details><summary>Inspect stored evidence</summary><pre className="lab-code">{JSON.stringify(current.input_snapshot, null, 2)}</pre></details>
            </>}
            {current.review_feedback && <div className="cryo-detail">
              <strong>{current.review_feedback.replace(/_/g, ' ')} · {current.reviewed_by_name || 'Reviewer'}</strong>
              <p>{current.review_notes}</p>
            </div>}
            {canReview && !current.legacy && <form className="reading-form" onSubmit={saveReview}>
              <fieldset className="lab-controls" disabled={busy}>
                <label>Review decision<select className="input-field" value={review.review_feedback}
                  onChange={event => setReview({ ...review, review_feedback: event.target.value as AIReviewPayload['review_feedback'] })}>
                  <option value="agree">Agree</option><option value="disagree">Disagree</option><option value="needs_review">Needs review</option>
                </select></label>
                <label>Rationale<input className="input-field" required minLength={5} maxLength={2000}
                  value={review.review_notes} onChange={event => setReview({ ...review, review_notes: event.target.value })} /></label>
                <button type="submit" className="btn-primary">Save review</button>
              </fieldset>
            </form>}
          </>}
        </section>
      </div>
      <details className="optional-tools">
        <summary>Random Forest class experiment</summary>
        <ModelExperiment key={sampleId ?? 'unset'} sampleId={sampleId} />
      </details>
    </div>
  );
}

