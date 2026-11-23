import { useState } from 'react';
import { Database, GitFork, Terminal } from 'lucide-react';
import { ConceptInfo } from '../../components/ConceptInfo';
import { QueryWorkbench } from './QueryWorkbench';
import { CustodyLens } from './CustodyLens';
// import { ColdChain } from './ColdChain';
import { SQLConsole } from './SQLConsole';

export type LabTab = 'console' | 'sql' | 'custody';
const tabs = [
  { id: 'console', label: 'SQL console (Query execution)', icon: Terminal },
  { id: 'sql', label: 'SQL presets & plans', icon: Database },
  { id: 'custody', label: 'NoSQL Explorer', icon: GitFork },
  // { id: 'temperature', label: 'Cold-chain evidence', icon: Thermometer },
] as const;

export function DatabaseLabPage({ initialTab, initialSql, onOpenLineage }: {
  initialTab?: LabTab;
  initialSql?: string;
  onOpenLineage: (id: number) => void;
}) {
  const [tab, setTab] = useState<LabTab>(initialTab ?? 'console');
  return (
    <div className="lab-stack">
      <header className="lab-hero">
        <div>
          <div className="lab-kicker">RVCE · CD252IA · LIVE DATA</div>
          <h1>SQL Testing & Database Lab</h1>
          <p>Execute custom SQL statements, test relational projections, or explore custody audit records.</p>
        </div>
        <div className="lab-hero-mark" aria-hidden="true"><Database size={52} strokeWidth={1.3} /></div>
      </header>
      <nav className="lab-tabs lab-main-tabs" aria-label="SQL Testing views">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}><Icon size={17} />{label}</button>
        ))}
        <ConceptInfo title="SQL execution and NoSQL integration" steps={['Custom SQL commands', 'Normalized records', 'Committed audit', 'Document projection', 'Evidence interface']}>
          <p>Execute live interactive SQL statements directly against the relational database, or inspect pre-built query plans, foreign-key relationships, and custody tracking.</p>
          <p>Relational writes commit before their custody projection is created. Each replay uses the audit ID to prevent duplicate projected events.</p>
        </ConceptInfo>
      </nav>
      {tab === 'console' && <SQLConsole initialSql={initialSql} />}
      {tab === 'sql' && <QueryWorkbench />}
      {tab === 'custody' && <CustodyLens onOpenLineage={onOpenLineage} />}
      {/* Cold-chain evidence hidden for demo clarity (code preserved):
      {tab === 'temperature' && <ColdChain onOpenLineage={onOpenLineage} />} */}
    </div>
  );
}

