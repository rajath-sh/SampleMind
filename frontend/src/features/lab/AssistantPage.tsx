import { useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../../common/apiClient';
import type { ReportDocument } from '../analytics/SummaryReport';

type Message = { role: 'user' | 'model'; text: string };

export function AssistantPage({ importedReport }: { importedReport?: ReportDocument }) {
  const [status, setStatus] = useState<{ configured: boolean; model: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [report, setReport] = useState(importedReport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<typeof status>('/assistant/status', { signal: controller.signal }).then(setStatus)
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true); setError('');
    const next: Message[] = [...messages, { role: 'user', text: text.trim() }];
    try {
      const response = await apiRequest<{ reply: string }>('/assistant', {
        method: 'POST', body: JSON.stringify({ messages: next.slice(-23), report_text: report?.text ?? '' }),
      });
      setMessages([...next, { role: 'model', text: response.reply }]);
      setText('');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="lab-stack">
    <header className="lab-hero"><div><div className="lab-kicker">SAMPLEMIND ASSISTANT</div><h1>AI Chat</h1>
      <p>Discuss database concepts or ask about a generated summary report.</p></div></header>
    <section className="card lab-panel">
      <p className="lab-muted">{status ? `${status.model} · ${status.configured ? 'API configured' : 'API key needed'}` : 'Checking AI configuration…'}</p>
      {status && !status.configured && <p className="lab-muted">Add GEMINI_API_KEY and GEMINI_MODEL to the project .env file, then restart the server. Available models and free-tier quotas depend on your Google AI account.</p>}
      {report && <div className="cryo-detail"><strong>Attached report #{report.report_id}</strong>
        <p className="lab-muted">Report text will accompany your messages.</p>
        <details><summary>Preview attachment</summary><pre className="lab-code">{report.text}</pre></details>
        <button className="btn-secondary" type="button" disabled={busy} onClick={() => setReport(undefined)}>Remove attachment</button>
      </div>}
      <div className="lab-stack" style={{ width: '100%' }} aria-live="polite">
        {messages.map((message, index) => <article className="cryo-detail" key={index}>
          <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text}</p>
        </article>)}
      </div>
      <form onSubmit={send} style={{ width: '100%' }}>
        <label className="search-label">Message<textarea className="input-field" rows={4} maxLength={16000} required
          value={text} disabled={busy} onChange={event => setText(event.target.value)} /></label>
        <p className="lab-muted">Sending shares this conversation and the attached report text with Google Gemini.</p>
        <button className="btn-primary" type="submit" disabled={busy || !status?.configured || !text.trim()}>{busy ? 'Waiting for response…' : 'Send to Gemini'}</button>
        <button className="btn-secondary" type="button" disabled={busy} onClick={() => { setMessages([]); setText(''); }}>Clear conversation</button>
      </form>
      {error && <p className="lab-error" role="alert">{error}</p>}
    </section>
  </div>;
}
