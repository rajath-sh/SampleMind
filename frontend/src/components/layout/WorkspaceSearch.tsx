import { useEffect, useRef, useState } from 'react';
import { GitFork, Search } from 'lucide-react';
import { apiRequest } from '../../common/apiClient';
import { Dialog } from '../ConceptInfo';

export interface SearchResult {
  section: 'samples' | 'experiments' | 'incidents' | 'storage';
  id: number;
  code: string;
  title: string;
}
const sectionLabels = { samples: 'Specimen', experiments: 'Experiment', incidents: 'Incident', storage: 'Storage' };

export function WorkspaceSearch({ onOpen, onLineage }: {
  onOpen: (result: SearchResult) => void;
  onLineage: (id: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState('');
  const [matches, setMatches] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function show() {
    if (!dialog.current?.open) dialog.current?.showModal();
    input.current?.focus();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        show();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const query = term.trim();
    setError('');
    setMatches([]);
    if (query.length < 2) { setLoading(false); return; }
    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query });
      apiRequest<SearchResult[]>(`/search?${params}`, { signal: controller.signal }).then(setMatches)
        .catch(err => { if (!controller.signal.aborted) setError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term]);

  return (
    <>
      <button type="button" className="workspace-search" onClick={show} aria-label="Open workspace search">
        <Search size={16} /><span>Search workspace</span><kbd>Ctrl K</kbd>
      </button>
      <Dialog title="Search workspace records" dialogRef={dialog} wide>
        <label className="search-label">Code or keyword
          <input className="input-field" value={term} ref={input} maxLength={80}
            placeholder="Try S003 or freezer" onChange={event => setTerm(event.target.value)} />
        </label>
        {error && <p className="lab-error" role="alert">{error}</p>}
        <p className="lab-muted" aria-live="polite">{term.trim().length < 2 ? 'Enter at least two characters.' : loading
          ? 'Searching the relational database…' : error ? 'Search is unavailable.' : `${matches.length} matching records`}</p>
        <div className="trace-rail">
          {matches.map(match => (
            <div className="search-row" key={`${match.section}-${match.id}`}>
              <button className="trace-node" type="button" onClick={() => { dialog.current?.close(); onOpen(match); }}>
                <strong>{match.code} · {match.title}</strong><span>{sectionLabels[match.section]}</span>
              </button>
              {match.section === 'samples' && <button className="btn-secondary" type="button" aria-label={`Open lineage for ${match.code}`}
                onClick={() => { dialog.current?.close(); onLineage(match.id); }}><GitFork size={17} /></button>}
            </div>
          ))}
        </div>
      </Dialog>
    </>
  );
}

