import { useState } from 'react';
import { apiRequest } from '../../common/apiClient';
import { ConceptInfo } from '../../components/ConceptInfo';

export interface ReportDocument {
  report_id: number;
  created_at: string;
  text: string;
  sha256: string;
  previous_sha256: string;
  verification: string;
}

export function SummaryReport({ onSendToAI }: { onSendToAI: (report: ReportDocument) => void }) {
  const [report, setReport] = useState<ReportDocument>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<boolean>();
  async function generate() {
    setBusy(true); setError(''); setVerified(undefined);
    try { setReport(await apiRequest<ReportDocument>('/summary-reports', { method: 'POST' })); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  function download(format: 'txt' | 'json') {
    if (!report) return;
    const content = format === 'txt' ? report.text : JSON.stringify(report, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: format === 'txt' ? 'text/plain;charset=utf-8' : 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `SampleMind-summary-${report.report_id}.${format}`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function verify() {
    if (!report) return;
    setError('');
    try {
      const response = await apiRequest<{ valid: boolean }>('/summary-reports/verify', {
        method: 'POST', body: JSON.stringify(report),
      });
      setVerified(response.valid);
    } catch (err) { setError((err as Error).message); }
  }
  return <section className="card lab-panel" style={{ marginBottom: '1rem' }}>
    <div className="lab-title"><h2>All-table summary</h2>
      <ConceptInfo title="Report integrity receipts" steps={['Read database snapshot', 'Hash report and previous receipt', 'Download', 'Verify against receipt']}>
        <p>The download contains table counts and status totals from one SQL snapshot. A local SHA-256 chain links each receipt to the previous one. This detects a changed report against its stored receipt. The receipts are held on this server and have no distributed blockchain consensus.</p>
      </ConceptInfo>
    </div>
    <div className="lab-chips">
      <button type="button" className="btn-primary" disabled={busy} onClick={generate}>{busy ? 'Generating…' : 'Generate summary report'}</button>
      {report && <>
        <button type="button" className="btn-secondary" onClick={() => download('txt')}>Download text</button>
        <button type="button" className="btn-secondary" onClick={() => download('json')}>Download with verification receipt</button>
        <button type="button" className="btn-secondary" onClick={verify}>Verify report</button>
        <button type="button" className="btn-secondary" onClick={() => onSendToAI(report)}>Export report to AI</button>
      </>}
    </div>
    {error && <p className="lab-error" role="alert">{error}</p>}
    {verified !== undefined && <p role="status">{verified ? 'Report matches its stored receipt.' : 'Report does not match its stored receipt.'}</p>}
    {report && <details><summary>Preview summary</summary><pre className="lab-code">{report.text}</pre></details>}
  </section>;
}
