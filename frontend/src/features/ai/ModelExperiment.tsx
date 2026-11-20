import { useEffect, useState } from 'react';
import { BrainCircuit, Download, Play } from 'lucide-react';
import { ConceptInfo } from '../../components/ConceptInfo';
import { apiRequest } from '../../common/apiClient';

interface ModelInfo {
  version: string;
  dataset_kind: string;
  training_samples: number;
  test_samples: number;
  seed: number;
  target_classes: string[];
  class_metrics: Record<string, { precision: number; recall: number; "f1-score": number; support: number }>;
  metrics: { macro_f1: number; confusion_matrix: number[][]; classification_report: { accuracy: number } };
}
interface Inference {
  sample_code: string;
  classification: string;
  scores: Record<string, number>;
  features: Record<string, unknown>;
  imputed_features: string[];
}

export function ModelExperiment({ sampleId }: { sampleId?: number }) {
  const [model, setModel] = useState<ModelInfo>();
  const [selectedCell, setSelectedCell] = useState<[number, number]>([0, 0]);
  const [inference, setInference] = useState<Inference>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<ModelInfo>('/lab/model', { signal: controller.signal }).then(setModel)
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, []);

  async function predict() {
    if (!sampleId) return;
    setBusy(true);
    setError('');
    try {
      setInference(await apiRequest<Inference>(`/lab/model/${sampleId}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setDownloadBusy(true);
    setError('');
    try {
      const token = localStorage.getItem('samplemind_token');
      const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
      const response = await fetch(`${base}/lab/model/dataset`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Could not download the synthetic dataset.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'synthetic_sample_risk_dataset.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloadBusy(false);
    }
  }

  return (
    <section className="card lab-panel">
      <div className="lab-title"><BrainCircuit size={20} /><h2>Random Forest experiment</h2>
        <ConceptInfo title="Synthetic training and held-out evaluation" steps={['Seeded simulator', 'Stratified 80/20 split', 'Fit model', 'Inspect holdout errors']}
         >
          <p>The reproducible generator supplies labeled classroom examples, so we can demonstrate training, a holdout split and inference without relying on patient records. The CSV and generator are included. The generator assigns labels using programmed rules plus random noise.</p>
          <p>The holdout score measures agreement with the simulator. Validation on real specimens would require independently labeled laboratory data. SampleMindâ€™s cohort decisions come directly from its SQL evidence.</p>
        </ConceptInfo>
      </div>
      {error && <p className="lab-error" role="alert">{error}</p>}
      {model && <>
        <p className="lab-muted">{model.version} Â· {model.training_samples} simulated training rows Â· {model.test_samples} simulated holdout rows Â· Seed {model.seed}</p>
        <div style={{ width: '100%' }}>
          <h3>Synthetic holdout performance by class</h3>
          <p className="lab-muted">Precision is correctness among predictions of a class. Recall measures how many examples of that class were found. Hover or focus a bar for its measured value.</p>
          <svg viewBox="0 0 660 270" role="img" aria-label="Per-class precision, recall and F1 from the synthetic holdout" style={{ width: '100%', maxWidth: 760 }}>
            {[0, .25, .5, .75, 1].map(value => <g key={value}>
              <line x1={140 + value * 440} x2={140 + value * 440} y1="10" y2="240" stroke="#d8e4df" />
              <text x={140 + value * 440} y="260" textAnchor="middle" fontSize="12" fill="#49645b">{value * 100}%</text>
            </g>)}
            {model.target_classes.map((label, index) => <g key={label}>
              <text x="4" y={40 + index * 78} fill="#214e45" fontSize="14">{label} · n={model.class_metrics[label].support}</text>
              {(['precision', 'recall', 'f1-score'] as const).map((metric, offset) => {
                const value = model.class_metrics[label][metric];
                return <g key={metric} tabIndex={0} role="img" aria-label={label + ' ' + metric + ' ' + (value * 100).toFixed(1) + '%'}>
                  <rect x="140" y={15 + index * 78 + offset * 22} height="15" rx="3" width={value * 440}
                    fill={['#287d78', '#4a7796', '#b18b43'][offset]} />
                  <title>{label} · {metric} · {(value * 100).toFixed(1)}%</title>
                </g>;
              })}
            </g>)}
          </svg>
          <p className="lab-muted">Teal · precision &nbsp; Blue · recall &nbsp; Gold · F1</p>
        </div>
        <div className="lab-grid lab-inner-grid">
          <div className="lab-table-wrap">
            <p><strong>{(model.metrics.classification_report.accuracy * 100).toFixed(1)}%</strong> synthetic holdout accuracy Â· Macro F1 <strong>{model.metrics.macro_f1.toFixed(3)}</strong></p>
            <table className="lab-table model-matrix">
              <caption>Rows are true labels. Columns are predicted labels.</caption>
              <thead><tr><th scope="col">True / predicted</th>
                {model.target_classes.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody>{model.metrics.confusion_matrix.map((row, rowIndex) => (
                <tr key={model.target_classes[rowIndex]}><th scope="row">{model.target_classes[rowIndex]}</th>
                  {row.map((count, columnIndex) => (
                    <td key={model.target_classes[columnIndex]}>
                      <button className={`matrix-cell ${rowIndex === columnIndex ? 'matrix-match' : ''}`}
                        type="button" aria-label={`True ${model.target_classes[rowIndex]}, predicted ${model.target_classes[columnIndex]}, ${count} rows`}
                        aria-pressed={selectedCell[0] === rowIndex && selectedCell[1] === columnIndex}
                        onClick={() => setSelectedCell([rowIndex, columnIndex])}>{count}</button>
                    </td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
            <p className="lab-muted" aria-live="polite">{model.metrics.confusion_matrix[selectedCell[0]][selectedCell[1]]} holdout rows
              labeled {model.target_classes[selectedCell[0]]} received a {model.target_classes[selectedCell[1]]} prediction.</p>
          </div>
          <div className="cryo-detail">
            <div className="lab-chips">
              <button type="button" className="btn-secondary" disabled={!sampleId || busy} onClick={predict}>
                <Play size={15} />{busy ? 'Runningâ€¦' : 'Run on selected specimen'}
              </button>
              <button type="button" className="btn-secondary" disabled={downloadBusy} onClick={download}>
                <Download size={15} /> Synthetic CSV
              </button>
            </div>
            {inference ? <>
              <p><strong>{inference.sample_code}</strong> Â· Synthetic-model class <strong>{inference.classification}</strong></p>
              <ul className="advisory-factors">
                {Object.entries(inference.scores).map(([label, value]) => <li key={label}>{label} Â· {(value * 100).toFixed(1)}%</li>)}
              </ul>
              <details>
                <summary>Show model inputs</summary>
                <p className="lab-muted">Imputed fields: {inference.imputed_features.join(', ') || 'none'}</p>
                <pre className="lab-code">{JSON.stringify(inference.features, null, 2)}</pre>
              </details>
            </> : <p className="lab-muted">Select a specimen above to see how it is classified by the synthetic model.</p>}
          </div>
        </div>
      </>}
    </section>
  );
}

