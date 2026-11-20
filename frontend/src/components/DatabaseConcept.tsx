import { ConceptInfo } from './ConceptInfo';

const concepts = {
  normalization: {
    title: 'Normalization and foreign keys',
    steps: ['Define a type once', 'Store its key on the specimen', 'Join to show the name'],
    description: 'SampleType stores a type code and description once. Sample stores sample_type_id. The type name depends on the type key, so keeping it in the lookup table avoids copying it into every sample row and prevents inconsistent names.',
  },
  transaction: {
    title: 'Atomic derivation and concurrency',
    steps: ['Lock the parent', 'Check stock', 'Debit and register child', 'Commit together'],
    description: 'Derivation serializes competing writers, then records the parent debit, new sample, lineage edge and audit entry in one transaction. A failed operation rolls the changes back.',
  },
  lineage: {
    title: 'Recursive query',
    steps: ['Choose a specimen', 'Read direct edges', 'Follow the next generation'],
    description: 'The recursive common table expression traverses the parent and child foreign keys in SampleRelationship. Changing direction selects which relationship key to follow.',
  },
  cycle: {
    title: 'Lineage constraint',
    steps: ['Propose an edge', 'Check for a return path', 'Reject cycles'],
    description: 'The application checks reachability while lineage writers are serialized. A SQLite trigger also rejects edges that would close a cycle.',
  },
  assays: {
    title: 'Assay referential integrity',
    steps: ['Choose an existing sample', 'Store sample_id in SampleTest', 'Join results to sample'],
    description: 'Each assay row must point to an existing specimen. A foreign key enforces the relationship even when multiple assays belong to the same specimen.',
  },
  experiment: {
    title: 'Many-to-many junction',
    steps: ['Experiment', 'ExperimentSample', 'Sample'],
    description: 'ExperimentSample holds the two foreign keys along with the role and quantity for this assignment. The same specimen can be used in more than one experiment.',
  },
  results: {
    title: 'Result verification and audit',
    steps: ['Open experiment result', 'Check reviewer role', 'Update result and record audit'],
    description: 'An experiment result points to its experiment. The verification endpoint checks the user role before recording the change and its audit entry.',
  },
  storage: {
    title: 'LEFT JOIN and empty slots',
    steps: ['Start with storage slots', 'Match assigned specimens', 'Keep empty slots'],
    description: 'An occupancy query can join specimens to storage locations and still show slots with zero specimens. The location key is stored on the specimen row.',
  },
  equipment: {
    title: 'Equipment assignments',
    steps: ['Equipment code', 'ExperimentEquipment', 'Experiment'],
    description: 'An instrument has one unique code. The assignment table lets experiments reuse it and stores a separate usage window for each assignment.',
  },
  ancient: {
    title: 'Subtype and site references',
    steps: ['Sample', 'AncientSpecimen', 'ArchaeologicalSite'],
    description: 'AncientSpecimen uses the Sample key to add details for that specimen. A separate site key lets several specimens refer to one site without copying the site description.',
  },
  incident: {
    title: 'Recursive incident impact',
    steps: ['Identify affected sample', 'Follow descendants', 'Find linked experiments'],
    description: 'Incident impact follows lineage edges, then joins affected specimens to experiments and their results. A critical incident can update specimen statuses in one transaction.',
  },
  reports: {
    title: 'Grouping and aggregation',
    steps: ['Choose grouping key', 'Group matching records', 'Count each group'],
    description: 'The report groups operational rows by specimen type or experiment status. The Database Lab can run representative aggregates with SQL and an execution plan.',
  },
} as const;

export function DatabaseConcept({ topic }: { topic: keyof typeof concepts }) {
  const concept = concepts[topic];
  return <ConceptInfo title={concept.title} steps={[...concept.steps]}><p>{concept.description}</p></ConceptInfo>;
}

