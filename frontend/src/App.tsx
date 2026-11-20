import { NewsPage } from './features/lab/NewsPage';
import { CourseworkPage } from './features/lab/CourseworkPage';
import { AssistantPage } from './features/lab/AssistantPage';
import type { ReportDocument } from './features/analytics/SummaryReport';
import { useEffect, useState } from 'react';
import { Dna } from 'lucide-react';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { SidebarNavigation, sectionLabels } from './components/layout/SidebarNavigation';
import { TopBar } from './components/layout/TopBar';
import { WorkspaceSearch, type SearchResult } from './components/layout/WorkspaceSearch';
import { SQLConsole } from './features/lab/SQLConsole';
import { CohortReview } from './features/lab/CohortReview';
import { StoragePage } from './features/storage/StoragePage';
import { SamplesPage } from './features/samples/SamplesPage';
import { LineageExplorerPage } from './features/lineage/LineageExplorerPage';
import { TestsPage } from './features/tests/TestsPage';
import { ExperimentsPage } from './features/experiments/ExperimentsPage';
import { AncientSpecimensPage } from './features/ancient/AncientSpecimensPage';
import { IncidentsPage } from './features/incidents/IncidentsPage';
import { AIRiskAdvisoryPage } from './features/ai/AIRiskAdvisoryPage';
import { ReportsAnalyticsPage } from './features/analytics/ReportsAnalyticsPage';
import { OverviewDashboard } from './features/analytics/OverviewDashboard';
import { DatabaseLabPage, type LabTab } from './features/lab/DatabaseLabPage';
import { ResearchersPage } from './features/auth/ResearchersPage';
import { SettingsPage } from './features/lab/SettingsPage';
import './features/lab/lab.css';

type View = { sql?: string; section: string; id?: number; code?: string; lab?: LabTab };

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [view, setView] = useState<View>({ section: 'overview' });
  const [importedReport, setImportedReport] = useState<ReportDocument>();
  useEffect(() => {
    const openSQL = (event: Event) => {
      if (user?.role === 'ADMIN') setView({ section: 'sql_testing', sql: (event as CustomEvent<{ sql: string }>).detail.sql });
    };
    window.addEventListener('samplemind-open-sql', openSQL);
    return () => window.removeEventListener('samplemind-open-sql', openSQL);
  }, [user?.role]);
  const selectSection = (section: string) => setView({ section });
  const openLineage = (id: number) => setView({ section: 'lineage', id });
  const openSearchResult = ({ section, id, code }: SearchResult) => setView({ section, id, code });
  const openSample = (id: number) => setView({ section: 'samples', id });
  const openAssay = (id: number) => setView({ section: 'tests', id });

  if (isLoading) return <div className="session-loading"><Dna size={32} className="animate-spin" /> Checking SampleMind session…</div>;
  if (!isAuthenticated) return <LoginPage />;

  let page;
  switch (view.section) {
    case 'news': page = <NewsPage />; break;
    case 'dbms': page = <CourseworkPage />; break;
    case 'sql_testing': page = <SQLConsole initialSql={view.sql} />; break;
    case 'cohort': page = <CohortReview onOpenSample={openSample} onOpenAssay={openAssay} />; break;
    case 'assistant': page = <AssistantPage importedReport={importedReport} />; break;
    case 'reports': page = <ReportsAnalyticsPage onSendToAI={report => {
      setImportedReport(report); setView({ section: 'assistant' });
    }} />; break;
    case 'ai_analysis': page = <AIRiskAdvisoryPage />; break;
    case 'incidents': page = <IncidentsPage initialSearch={view.code} />; break;
    case 'ancient': page = <AncientSpecimensPage />; break;
    case 'experiments': page = <ExperimentsPage initialTab="experiments" initialSearch={view.code} />; break;
    case 'results': page = <ExperimentsPage initialTab="results" />; break;
    case 'tests': page = <TestsPage initialAssayId={view.id} />; break;
    case 'lineage': page = <LineageExplorerPage initialSampleId={view.id} />; break;
    case 'samples': page = <SamplesPage initialSampleId={view.id} />; break;
    case 'storage': page = <StoragePage initialTab="locations" initialLocationId={view.id} />; break;
    case 'equipment': page = <StoragePage initialTab="equipment" />; break;
    case 'lab': page = <DatabaseLabPage initialTab={view.lab ?? 'sql'} onOpenLineage={openLineage} />; break;
    case 'researchers': page = <ResearchersPage />; break;
    case 'settings': page = <SettingsPage />; break;
    default: page = <OverviewDashboard onSelectSection={selectSection} onOpenSample={openSample} />;
  }

  return (
    <div className="workspace-shell">
      <SidebarNavigation currentSection={view.section} onSelectSection={selectSection} />
      <div className="workspace-content">
        <TopBar onOpenIncidents={() => setView({ section: 'incidents' })} currentSection={sectionLabels[view.section] || 'Overview'}
          search={<WorkspaceSearch onOpen={openSearchResult} onLineage={openLineage} />} />
        <main className="workspace-main">
          <div className="workspace-page" key={`${user?.user_id}-${view.section}-${view.id ?? ''}-${view.lab ?? ''}`}>
            {page}
          </div>
        </main>
      </div>
    </div>
  );
}

export function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}

export default App;

