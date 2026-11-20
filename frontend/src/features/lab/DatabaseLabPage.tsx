import { useState } from 'react';
import { Database, GitFork, Thermometer } from 'lucide-react';
import { ConceptInfo } from '../../components/ConceptInfo';
import { QueryWorkbench } from './QueryWorkbench';
import { CustodyLens } from './CustodyLens';
import { ColdChain } from './ColdChain';

export type LabTab = 'sql' | 'custody' | 'temperature';
const tabs = [
  { id: 'sql', label: 'SQL workbench', icon: Database },
  { id: 'custody', label: 'Custody lens', icon: GitFork },
  { id: 'temperature', label: 'Cold-chain evidence', icon: Thermometer },
] as const;

export function DatabaseLabPage({ initialTab, onOpenLineage }: {
  initialTab: LabTab;
  onOpenLineage: (id: number) => void;
}) {
  const [tab, setTab] = useState<LabTab>(initialTab);
  return (
    <div className="lab-stack">
      <header className="lab-hero">
        <div>
          <div className="lab-kicker">RVCE · CD252IA · LIVE DATA</div>
          <h1>Database Lab</h1>
          <p>Run SQL and inspect its plan, or explore the records stored as documents.</p>
        </div>
        <div className="lab-hero-mark" aria-hidden="true"><Database size={52} strokeWidth={1.3} /></div>
      </header>
      <nav className="lab-tabs lab-main-tabs" aria-label="Database Lab views">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}><Icon size={17} />{label}</button>
        ))}
        <ConceptInfo title="SQL and NoSQL integration" steps={['Normalized records', 'Committed audit', 'Document projection', 'Evidence interface']}>
          <p>Specimen identity, types, storage and assay links are foreign-key relationships. TinyDB supports document queries over the variable evidence attached to audit events and temperature readings.</p>
          <p>Relational writes commit before their custody projection is created. Each replay uses the audit ID to prevent duplicate projected events.</p>
        </ConceptInfo>
      </nav>
      {tab === 'sql' && <QueryWorkbench />}
      {tab === 'custody' && <CustodyLens onOpenLineage={onOpenLineage} />}
      {tab === 'temperature' && <ColdChain onOpenLineage={onOpenLineage} />}
    </div>
  );
}

