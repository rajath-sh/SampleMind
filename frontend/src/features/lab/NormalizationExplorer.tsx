import { useEffect, useState } from 'react';
import { apiRequest } from '../../common/apiClient';
import { ConceptInfo } from '../../components/ConceptInfo';

interface Attribute { name: string; type: string; primary: boolean; nullable: boolean; references: string[] }
interface Relation { name: string; keys: string[]; columns: Attribute[]; unique: string[][] }

export function NormalizationExplorer() {
  const [tables, setTables] = useState<Relation[]>([]);
  const [selected, setSelected] = useState('Sample');
  const [attribute, setAttribute] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Relation[]>('/coursework/schema', { signal: controller.signal }).then(setTables)
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, []);
  const table = tables.find(item => item.name === selected);
  const column = table?.columns.find(item => item.name === attribute);
  return <section className="cryo-detail">
    <div className="lab-title"><h3>Explore keys and dependencies</h3>
      <ConceptInfo title="Functional dependencies and decomposition" steps={['Choose a relation', 'Inspect its determinant', 'Follow a foreign key', 'Read the separate relation']}>
        <p>A primary key determines the attributes of its row. Foreign keys connect separately maintained relations. Separating type and location descriptions from specimen rows prevents repeating the same description across specimens.</p>
      </ConceptInfo>
    </div>
    <label className="search-label">Relation<select className="input-field" value={selected} onChange={event => {
      setSelected(event.target.value); setAttribute('');
    }}>{tables.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
    {error && <p className="lab-error" role="alert">{error}</p>}
    {table && <>
      <div className="dependency-view">
        <div className="dependency-key"><strong>{table.name}</strong><span>{table.keys.join(' + ')} (PK)</span></div>
        <span className="dependency-arrow" aria-hidden="true">→</span>
        <div className="dependency-attributes">{table.columns.filter(item => !item.primary).map(item => (
          <button className="btn-secondary" type="button" key={item.name} aria-pressed={attribute === item.name}
            onClick={() => setAttribute(item.name)}>{item.name}{item.references.length ? ' ↗' : ''}</button>
        ))}</div>
      </div>
      {column && <div className="cryo-detail"><strong>{column.name}</strong>
        <p>{column.type} · {column.nullable ? 'optional' : 'required'} · dependent on {table.keys.join(' + ')}</p>
        {column.references.map(reference => <button className="btn-secondary" type="button" key={reference}
          onClick={() => { setSelected(reference.split('.')[0]); setAttribute(''); }}>Follow {reference} →</button>)}
      </div>}
      <p className="lab-muted">This key dependency is enforced by the schema. Full normal-form reasoning also requires the domain dependencies described in the downloadable document below.</p>
    </>}
  </section>;
}
