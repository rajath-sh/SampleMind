import { useAuth } from '../features/auth/AuthContext';
import { TableLens } from './TableLens';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Columns3 } from 'lucide-react';

export function CompactTable({ label, extra, help, showLens = true, children }: {
  label: string;
  extra: number[];
  help?: ReactNode;
  showLens?: boolean;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const sqlTables: Record<string, string> = {
    samples: 'Sample', assays: 'SampleTest', 'storage locations': 'StorageLocation',
    equipment: 'Equipment', 'lineage specimens': 'SampleRelationship', experiments: 'Experiment',
    results: 'ExperimentResult', 'ancient specimens': 'AncientSpecimen',
    'archaeological sites': 'ArchaeologicalSite', incidents: 'Incident',
    'affected specimens': 'Sample', 'affected experiments': 'Experiment',
    'affected results': 'ExperimentResult', 'sample type report': 'SampleType',
    'experiment outcomes': 'Experiment',
  };
  const table = sqlTables[label];
  const [showAll, setShowAll] = useState(true);
  const tableId = useId();
  const tableRef = useRef<HTMLDivElement>(null);
  return (
    <div className="compact-table" data-extra-columns={showAll ? undefined : extra.join(' ')}>
      {(extra.length > 0 || help) && <div className="compact-table-tools">
        {help}
        {user?.role === 'ADMIN' && table && <button className="compact-table-toggle" type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('samplemind-open-sql', {
            detail: { sql: 'SELECT * FROM "' + table + '" LIMIT 20;\n\n-- Use UPDATE "' + table + '" SET column_name = value WHERE primary_key = value;\n-- Execute your changes, then reopen this table to reload its rows.' },
          }))}>Edit table in SQL</button>}
        {extra.length > 0 && <button className="compact-table-toggle" type="button"
          aria-label={`${showAll ? 'Show fewer' : 'Show all'} columns in ${label}`}
          aria-expanded={showAll} aria-controls={tableId} onClick={() => setShowAll(!showAll)}>
          <Columns3 size={15} aria-hidden="true" />{showAll ? 'Show fewer columns' : 'Show all columns'}
        </button>}
      </div>}
      {showLens && <TableLens label={label} tableRef={tableRef} />}
      <div className="compact-table-scroll" id={tableId} ref={tableRef}>{children}</div>
    </div>
  );
}

