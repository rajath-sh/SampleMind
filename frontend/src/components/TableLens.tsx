import { useEffect, useMemo, useState, type RefObject } from 'react';
import { ConceptInfo } from './ConceptInfo';

interface Snapshot { columns: string[]; rows: string[][] }
function icon(label: string, selected: boolean) {
  const stroke = selected ? '#b4772d' : '#287d78';
  if (/sample|specimen/.test(label)) return <g fill="#e0f0e9" stroke={stroke} strokeWidth="1.7">
    <path d="M18 10h24v8H18zM22 18v30q0 10 8 10t8-10V18"/><path d="M23 38h14v10q0 8-7 8t-7-8z" fill={stroke} opacity=".5" />
  </g>;
  if (/assay/.test(label)) return <g stroke={stroke} fill="#e0f0e9">
    <circle cx="30" cy="33" r="22" strokeWidth="2"/><circle cx="30" cy="33" r="13" fill={stroke} opacity=".5"/>
    <path d="M30 6v9M30 51v9M3 33h9M48 33h9"/>
  </g>;
  if (/incident/.test(label)) return <g stroke={stroke} fill="#f6efdf" strokeWidth="2">
    <path d="M30 7 55 33 30 59 5 33z"/><path d="M30 20v18M30 44v3"/>
  </g>;
  if (/storage|equipment/.test(label)) return <g stroke={stroke} fill="#e0f0e9" strokeWidth="1.6">
    <rect x="9" y="9" width="42" height="49" rx="5"/><path d="M9 25h42M9 42h42M40 15v5M40 31v5M40 47v5"/>
  </g>;
  return <g stroke={stroke} fill="#e5eff6" strokeWidth="1.7">
    <path d="M9 14h15l5 7h22v35H9z"/><path d="M17 31h26M17 39h20M17 47h23"/>
  </g>;
}

export function TableLens({ label, tableRef }: { label: string; tableRef: RefObject<HTMLDivElement> }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ columns: [], rows: [] });
  const [groupColumn, setGroupColumn] = useState<number>();
  const [selected, setSelected] = useState<number>();
  useEffect(() => {
    const root = tableRef.current;
    if (!root) return;
    function collect() {
      const columns = [...root!.querySelectorAll('thead tr:first-child th')].map(cell => cell.textContent?.trim() || '');
      const rows = [...root!.querySelectorAll('tbody > tr')].map(row => [...row.querySelectorAll(':scope > td')])
        .filter(cells => cells.length === columns.length && !cells.some(cell => cell.hasAttribute('colspan')))
        .map(cells => cells.map(cell => (cell.textContent || '').trim().replace(/\s+/g, ' ')));
      setSnapshot(previous => JSON.stringify(previous) === JSON.stringify({ columns, rows }) ? previous : { columns, rows });
    }
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [tableRef]);

  const candidates = snapshot.columns.map((name, index) => ({ name, index })).filter(column => !/action/i.test(column.name));
  const defaultColumn = candidates.find(column => /status|severity|verification|preservation/i.test(column.name))?.index ?? candidates[0]?.index ?? 0;
  const column = groupColumn !== undefined && groupColumn < snapshot.columns.length ? groupColumn : defaultColumn;
  const groups = useMemo(() => {
    const lanes = new Map<string, { row: string[]; index: number }[]>();
    snapshot.rows.forEach((row, index) => {
      const key = row[column] || 'Unspecified';
      lanes.set(key, [...(lanes.get(key) || []), { row, index }]);
    });
    return [...lanes.entries()];
  }, [snapshot, column]);
  const record = selected !== undefined ? snapshot.rows[selected] : undefined;

  return <details className="table-lens">
    <summary>Interactive {label} view · {snapshot.rows.length} displayed records</summary>
    <div className="table-lens-body">
      <div className="lab-title">
        <label className="search-label">Arrange by<select className="input-field" value={column}
          onChange={event => setGroupColumn(Number(event.target.value))}>
          {candidates.map(item => <option key={item.index} value={item.index}>{item.name}</option>)}
        </select></label>
        <ConceptInfo title="Records, groups and projections" steps={['Current table rows', 'Choose an attribute', 'Group matching values', 'Inspect one record']}>
          <p>This view uses the records currently displayed in this table, including its current filters and page. Each symbol is one record. The lanes group equal values of the selected attribute, and selecting a symbol displays its attributes.</p>
        </ConceptInfo>
      </div>
      {groups.length === 0 ? <p className="lab-muted">No displayed records to visualize.</p> : groups.map(([key, entries]) =>
        <section className="table-lens-lane" key={key}>
          <h4>{key} <small>· {entries.length}</small></h4>
          <div className="table-lens-records">
            {entries.map(({ row, index }) => <button type="button" className="table-lens-record" key={index}
              aria-pressed={selected === index} title={row[0]} onClick={() => setSelected(selected === index ? undefined : index)}>
              <svg viewBox="0 0 60 66" aria-hidden="true">{icon(label, selected === index)}</svg>
              <span>{row[0] || `Record ${index + 1}`}</span>
            </button>)}
          </div>
        </section>)}
      {record && <dl className="table-lens-dossier">
        {candidates.map(item => <div key={item.index}><dt>{item.name}</dt><dd>{record[item.index] || '—'}</dd></div>)}
      </dl>}
    </div>
  </details>;
}
