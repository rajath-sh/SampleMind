import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest } from '../../common/apiClient';
import type { ReportDocument } from '../analytics/SummaryReport';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  RefreshCw,
} from 'lucide-react';

type Message = { role: 'user' | 'model'; text: string; at?: string };

export function AssistantPage({ importedReport }: { importedReport?: ReportDocument }) {
  const [status, setStatus] = useState<{ configured: boolean; model: string }>();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: 'Hello! I am your SampleMind AI Laboratory Assistant. You can ask me questions about your biological inventory, biobank storage conditions, assay protocols, risk analyses, or summarize any laboratory reports.',
      at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [text, setText] = useState('');
  const [report, setReport] = useState(importedReport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, busy]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<typeof status>('/assistant/status', { signal: controller.signal })
      .then(setStatus)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    const userText = text.trim();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setBusy(true);
    setError('');

    const next: Message[] = [...messages, { role: 'user', text: userText, at: timeStr }];
    setMessages(next);
    setText('');

    try {
      const response = await apiRequest<{ reply: string }>('/assistant', {
        method: 'POST',
        body: JSON.stringify({
          messages: next
            .filter((m) => m.role === 'user' || m.role === 'model')
            .slice(-20)
            .map(({ role, text }) => ({ role, text })),
          report_text: report?.text ?? '',
        }),
      });

      const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages([...next, { role: 'model', text: response.reply, at: replyTime }]);
    } catch (err) {
      setError((err as Error).message || 'Failed to receive AI response. Check your Gemini API configuration.');
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(e as unknown as FormEvent);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: '600px', gap: '14px' }}>
      {/* Header bar */}
      <div
        className="card"
        style={{
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-pale-teal)',
              color: 'var(--color-teal)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                SampleMind AI Assistant
              </h2>
              <span className="badge badge-teal font-mono" style={{ fontSize: '11px' }}>
                {status?.model || 'gemini-2.5-flash'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              Interactive scientific intelligence powered by Google Gemini
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {status?.configured ? (
            <span
              className="badge"
              style={{
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                borderColor: '#86EFAC',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
              }}
            >
              <CheckCircle2 size={12} /> Gemini Connected
            </span>
          ) : (
            <span
              className="badge"
              style={{
                backgroundColor: '#FEF3C7',
                color: '#B45309',
                borderColor: '#FCD34D',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
              }}
            >
              API Key Not Configured
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setMessages([
                {
                  role: 'model',
                  text: 'Conversation cleared. How can I assist you with your laboratory records or research data?',
                  at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              ]);
              setError('');
            }}
            className="btn btn-secondary"
            title="Clear Chat Conversation"
            style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Trash2 size={13} /> Clear
          </button>
        </div>
      </div>

      {/* Attached Report Banner (if user came from reports tab) */}
      {report && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--color-pale-teal)',
            border: '1px solid var(--color-teal)',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-teal)' }}>
            <FileText size={16} />
            <span>
              <strong>Attached Report Context:</strong> {report.report_id ? 'Report #' + report.report_id : report.verification + ' report'} is attached as reference context for your questions.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReport(undefined)}
            className="btn btn-secondary"
            style={{ padding: '3px 8px', fontSize: '11px' }}
          >
            Remove Attachment
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '8px',
            color: '#B91C1C',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Chat Conversation Container */}
      <div
        className="card"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#F8FAFC',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Messages Stream */}
        <div
          style={{
            flex: 1,
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-start',
                  gap: '10px',
                  width: '100%',
                }}
              >
                {!isUser && (
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-teal)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    <Bot size={18} />
                  </div>
                )}

                <div
                  style={{
                    maxWidth: '75%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      backgroundColor: isUser ? 'var(--color-teal)' : '#FFFFFF',
                      color: isUser ? '#FFFFFF' : 'var(--color-ink)',
                      boxShadow: isUser ? '0 2px 4px rgba(40,125,120,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
                      border: isUser ? 'none' : '1px solid var(--color-border)',
                      fontSize: '13.5px',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {msg.text}
                  </div>
                  {msg.at && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-muted)',
                        marginTop: '4px',
                        padding: '0 4px',
                      }}
                    >
                      {msg.at}
                    </span>
                  )}
                </div>

                {isUser && (
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-navy)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    <User size={18} />
                  </div>
                )}
              </div>
            );
          })}

          {busy && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-teal)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Bot size={18} />
              </div>
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: '16px 16px 16px 4px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-muted)',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <RefreshCw size={14} className="animate-spin" />
                <span>Gemini is thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={send}
          style={{
            padding: '12px 16px',
            backgroundColor: '#FFFFFF',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '10px',
          }}
        >
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              className="input"
              rows={2}
              maxLength={16000}
              required
              placeholder={
                status?.configured
                  ? 'Ask anything about specimens, storage, experiments, or SQL logic (Press Enter to send)...'
                  : 'Gemini API key is required. Click "API Key Guide" above to configure your free key.'
              }
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                resize: 'none',
                fontSize: '13px',
                borderRadius: '8px',
                padding: '10px 12px',
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !status?.configured || !text.trim()}
            style={{
              height: '42px',
              padding: '0 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
            }}
          >
            <Send size={15} /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
