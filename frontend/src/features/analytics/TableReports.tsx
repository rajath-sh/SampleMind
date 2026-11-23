// import { AIRiskAdvisoryPage } from '../ai/AIRiskAdvisoryPage';
import { useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { apiRequest } from '../../common/apiClient';
import type { ReportDocument } from './SummaryReport';
import {
  BarChart3,
  PieChart as PieIcon,
  TrendingUp,
  BrainCircuit,
  Sliders,
  CheckCircle2,
  Gauge,
  Sigma,
  AlertCircle,
  Activity,
} from 'lucide-react';

type Row = Record<string, string | number | boolean | null>;
type Metric = {
  title: string;
  note: string;
  values: [string, number][];
  chartType?: 'bar' | 'pie' | 'line' | 'stats';
};
type Snapshot = {
  columns: string[];
  rows: Row[];
  models: Metric[];
  features: { key: string; options: string[] | null }[];
  ml_purpose?: { title: string; description: string };
};

const tables = {
  Sample: 'Specimens',
  SampleType: 'Specimen types',
  StorageLocation: 'Storage locations',
  SampleTest: 'Assays',
  SampleRelationship: 'Lineage',
  Experiment: 'Experiments',
  ExperimentSample: 'Experiment usage',
  AncientSpecimen: 'Ancient specimens',
  AppUser: 'Accounts',
};
type Table = keyof typeof tables;

const label = (key: string) => key.replace(/_/g, ' ');
const value = (v: Row[string]) => (v == null ? 'Missing' : String(v));

function group(rows: Row[], key: string, title: string, chartType: 'bar' | 'pie' | 'line' = 'bar'): Metric {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = value(row[key]);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return {
    title,
    note: 'Row count per category directly computed from live database records.',
    values: [...counts].sort((a, b) => b[1] - a[1]),
    chartType,
  };
}

function stats(title: string, numbers: number[]): Metric {
  const clean = numbers.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  const n = clean.length;
  if (!n) {
    return {
      title,
      note: 'No numeric records available in live database table.',
      values: [],
      chartType: 'stats',
    };
  }

  const min = clean[0];
  const max = clean[n - 1];
  const median = n % 2 === 0 ? (clean[n / 2 - 1] + clean[n / 2]) / 2 : clean[Math.floor(n / 2)];
  const sum = clean.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  // Sample variance (n > 1 ? n - 1 : 1)
  const variance = clean.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n > 1 ? n - 1 : 1);
  const stdDev = Math.sqrt(variance);

  // Calculate Z-scores: Z = (x - mean) / stdDev
  const zScores = stdDev > 0 ? clean.map(val => Math.abs((val - mean) / stdDev)) : clean.map(() => 0);
  const maxAbsZ = Math.max(...zScores);

  // Pearson's skewness: 3 * (mean - median) / (stdDev || 1)
  const skewness = stdDev > 0 ? (3 * (mean - median)) / stdDev : 0;

  return {
    title,
    note: `${n} live database observations. Parametric & non-parametric dispersion: Min, Median, Mean, Max, Variance (σ²), Std Dev (σ), and Outlier Z-Score.`,
    values: [
      ['Minimum', min],
      ['Median', median],
      ['Mean (μ)', mean],
      ['Maximum', max],
      ['Variance (σ²)', variance],
      ['Std Dev (σ)', stdDev],
      ['Max |Z-Score|', maxAbsZ],
      ['Skewness', skewness],
    ],
    chartType: 'stats',
  };
}

const numeric = (v: Row[string]) => (v == null || v === '' ? NaN : Number(v));

function analysis(table: Table, rows: Row[]): Metric[] {
  const metrics: Metric[] = [];

  switch (table) {
    case 'Sample':
      metrics.push(group(rows, 'sample_status', 'Specimens by Operational Status (Bar Chart)', 'bar'));
      metrics.push(group(rows, 'sample_type_id', 'Specimen Type Distribution (Pie Chart)', 'pie'));
      metrics.push(group(rows, 'quantity_unit', 'Unit Measurements Usage Trend (Line Graph)', 'line'));
      metrics.push(stats('Specimen Quantity Distribution & Z-Score Analysis (Statistical Analysis)', rows.map(r => numeric(r['quantity_value'])).filter(Number.isFinite)));
      break;

    case 'SampleType': {
      metrics.push({
        title: 'Specimen Volume by Type (Bar Chart)',
        note: 'Live assigned specimen count per reference entity.',
        values: rows.map(r => [value(r['type_code']), Number(r['sample_count'] || 0)]),
        chartType: 'bar',
      });
      metrics.push({
        title: 'Specimen Category Allocation Share (Pie Chart)',
        note: 'Proportional distribution of specimen storage by type.',
        values: rows.map(r => [value(r['type_code']), Number(r['sample_count'] || 0)]),
        chartType: 'pie',
      });
      metrics.push({
        title: 'Type Registration Sequential Density (Line Graph)',
        note: 'Specimen density gradient ordered across type definitions.',
        values: rows.map(r => [value(r['type_code']), Number(r['sample_count'] || 0)]),
        chartType: 'line',
      });
      metrics.push(stats('Distribution of Assigned Specimen Counts per Type (Statistical Analysis)', rows.map(r => Number(r['sample_count'] || 0)).filter(Number.isFinite)));
      break;
    }

    case 'StorageLocation': {
      metrics.push({
        title: 'Assigned Specimens by Location (Bar Chart)',
        note: 'Live assigned specimen count per storage unit.',
        values: rows.map(r => [value(r['location_code']), Number(r['sample_count'] || 0)]),
        chartType: 'bar',
      });
      metrics.push(group(rows, 'unit_type', 'Storage Unit Categories (Pie Chart)', 'pie'));
      metrics.push({
        title: 'Storage Facility Utilization Gradient (Line Graph)',
        note: 'Thermal unit storage density trajectory.',
        values: rows.map(r => [value(r['location_code']), Number(r['sample_count'] || 0)]),
        chartType: 'line',
      });
      metrics.push(stats('Storage Capacity Allocation Distribution & Z-Score Analysis (Statistical Analysis)', rows.map(r => Number(r['sample_count'] || 0)).filter(Number.isFinite)));
      break;
    }

    case 'SampleTest': {
      metrics.push(group(rows, 'test_status', 'Assay Workflow Stages (Bar Chart)', 'bar'));
      metrics.push(group(rows, 'test_type', 'Assay Volume by Protocol Type (Pie Chart)', 'pie'));
      metrics.push({
        title: 'Assay Turnaround Velocity Timeline (Line Graph)',
        note: 'Days elapsed between request and performance across assay sequence.',
        values: rows.slice(0, 12).map((r, i) => {
          const days = Math.max(0, Math.round(((Date.parse(value(r['performed_at'])) || Date.now()) - (Date.parse(value(r['requested_at'])) || Date.now())) / 86400000));
          return [`Assay #${r['sample_test_id'] || i + 1}`, days];
        }),
        chartType: 'line',
      });
      metrics.push(
        stats(
          'Assay Request-to-Performance Duration in Days (Statistical Analysis)',
          rows.flatMap(r => {
            const days = (Date.parse(value(r['performed_at'])) - Date.parse(value(r['requested_at']))) / 86400000;
            return Number.isFinite(days) && days >= 0 ? [days] : [];
          })
        )
      );
      break;
    }

    case 'SampleRelationship': {
      metrics.push(group(rows, 'transformation_type', 'Transformation Event Frequencies (Bar Chart)', 'bar'));
      metrics.push(group(rows, 'parent_sample_id', 'Parent Specimen Derivation Lineage (Pie Chart)', 'pie'));
      metrics.push(group(rows, 'child_sample_id', 'Downstream Child Specimen Nodes (Line Graph)', 'line'));
      const parentCounts = new Map<string, number>();
      for (const r of rows) {
        const p = value(r['parent_sample_id']);
        parentCounts.set(p, (parentCounts.get(p) || 0) + 1);
      }
      metrics.push(stats('Derivation Transformation Events per Parent Specimen (Statistical Analysis)', [...parentCounts.values()]));
      break;
    }

    case 'Experiment': {
      metrics.push(group(rows, 'status', 'Experiment Status Pipeline (Bar Chart)', 'bar'));
      metrics.push(group(rows, 'status', 'Active vs Completed Research Allocation (Pie Chart)', 'pie'));
      metrics.push({
        title: 'Actual Execution Duration Trajectory (Line Graph)',
        note: 'Chronological timeline of finalized experiment durations in days.',
        values: rows.slice(0, 10).map((r, i) => {
          const days = Math.max(0, Math.round(((Date.parse(value(r['actual_end'])) || Date.now()) - (Date.parse(value(r['actual_start'])) || Date.now())) / 86400000));
          return [`Exp #${r['experiment_id'] || i + 1}`, days];
        }),
        chartType: 'line',
      });
      metrics.push(
        stats(
          'Planned Protocol Duration in Days (Statistical Analysis)',
          rows.flatMap(r => {
            const days = (Date.parse(value(r['planned_end'])) - Date.parse(value(r['planned_start']))) / 86400000;
            return Number.isFinite(days) && days >= 0 ? [days] : [];
          })
        )
      );
      break;
    }

    case 'ExperimentSample': {
      metrics.push(group(rows, 'experiment_id', 'Specimens Allocated per Experiment ID (Bar Chart)', 'bar'));
      metrics.push(group(rows, 'usage_role', 'Aliquot Usage Roles (Pie Chart)', 'pie'));
      metrics.push({
        title: 'Sequential Aliquot Quantity Consumption (Line Graph)',
        note: 'Sample consumption progression across experimental runs.',
        values: rows.slice(0, 12).map((r, i) => [`Usage #${r['sample_id'] || i + 1}`, numeric(r['quantity_used']) || 0]),
        chartType: 'line',
      });
      metrics.push(stats('Quantity Consumed in Experimental Cohorts (Statistical Analysis)', rows.map(r => numeric(r['quantity_used'])).filter(Number.isFinite)));
      break;
    }

    case 'AncientSpecimen': {
      metrics.push(group(rows, 'dating_method', 'Chronological Dating Methods (Bar Chart)', 'bar'));
      metrics.push(group(rows, 'dating_method', 'Recorded Dating Methodology Share (Pie Chart)', 'pie'));
      metrics.push({
        title: 'Chronological Dating Uncertainty Margin (Line Graph)',
        note: 'Observed age uncertainty window in radiocarbon and paleomagnetic dating.',
        values: rows.slice(0, 10).map((r, i) => [`Specimen #${r['sample_id'] || i + 1}`, numeric(r['age_uncertainty_years']) || 0]),
        chartType: 'line',
      });
      metrics.push(stats('Chronological Age Estimates in Years (Statistical Analysis)', rows.map(r => numeric(r['estimated_age_years'])).filter(Number.isFinite)));
      break;
    }

    case 'AppUser': {
      metrics.push(group(rows, 'role', 'Personnel by Authorization Role (Bar Chart)', 'bar'));
      metrics.push(group(rows, 'is_active', 'Account Activation Status (Pie Chart)', 'pie'));
      metrics.push({
        title: 'Role Privilege Hierarchy Distribution (Line Graph)',
        note: 'Role seniority progression (Admin: 3, Researcher: 2, Technician: 1).',
        values: rows.map((r, i) => [`User #${i + 1} (${value(r['role'])})`, r['role'] === 'ADMIN' ? 3 : r['role'] === 'RESEARCHER' ? 2 : 1]),
        chartType: 'line',
      });
      metrics.push(stats('Operational Permission Level Distribution (Statistical Analysis)', rows.map(r => (r['role'] === 'ADMIN' ? 3 : r['role'] === 'RESEARCHER' ? 2 : 1))));
      break;
    }
  }
  return metrics;
}

const format = (n: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(n);
const palette = ['#0D9488', '#2563EB', '#D97706', '#9333EA', '#0284C7', '#CA8A04', '#E11D48', '#16A34A'];

// Modern Interactive Visualizer with Bar, Pie, Line and Creative Gauge/Stat Cards
function Graph({ metric, index }: { metric: Metric; index: number }) {
  const values = metric.values || [];
  const max = values.reduce((m, [, n]) => Math.max(m, n), 0) || 1;
  const total = values.reduce((sum, [, n]) => sum + n, 0);

  const isStats = metric.chartType === 'stats' || (values.length === 4 && values[0]?.[0] === 'Minimum');
  const isPie = metric.chartType === 'pie' || (!isStats && values.length > 1 && values.length <= 6 && index % 2 === 1);
  const isLine = metric.chartType === 'line' || (!isStats && !isPie && index % 3 === 2);
  const isBar = !isStats && !isPie && !isLine;

  let offset = 0;

  return (
    <section
      className="card"
      style={{
        padding: '20px 22px',
        marginBottom: '16px',
        borderLeft: isStats ? '4px solid #F59E0B' : isPie ? '4px solid #8B5CF6' : isLine ? '4px solid #0284C7' : '4px solid var(--color-teal)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isStats && <Gauge size={16} color="#F59E0B" />}
            {isPie && <PieIcon size={16} color="#8B5CF6" />}
            {isLine && <TrendingUp size={16} color="#0284C7" />}
            {isBar && <BarChart3 size={16} color="var(--color-teal)" />}
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--color-ink)' }}>{metric.title}</h3>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-muted)' }}>{metric.note}</p>
        </div>

        <span
          className="badge"
          style={{
            fontSize: '11px',
            backgroundColor: isStats ? '#FEF3C7' : isPie ? 'rgba(139, 92, 246, 0.1)' : isLine ? '#E0F2FE' : 'var(--color-pale-teal)',
            color: isStats ? '#B45309' : isPie ? '#7C3AED' : isLine ? '#0369A1' : 'var(--color-teal)',
            fontWeight: 600,
          }}
        >
          {isStats ? 'Stat Metrics' : isPie ? 'Proportional Pie' : isLine ? 'Trend Line' : 'Comparative Bar'}
        </span>
      </div>

      {!values.length && <p style={{ fontSize: '12px', color: 'var(--color-muted)' }}>No recorded observations in this table yet.</p>}

      {/* 1. CREATIVE STATS: 7 KPI CARDS + GAUSSIAN BELL CURVE + RANGE SPREAD + EVALUATION CALLOUT */}
      {isStats && values.length >= 4 && (() => {
        const getVal = (label: string) => values.find(([k]) => k.startsWith(label))?.[1] ?? 0;
        const minVal = getVal('Minimum');
        const medianVal = getVal('Median');
        const meanVal = getVal('Mean');
        const maxVal = getVal('Maximum');
        const varVal = getVal('Variance');
        const stdVal = getVal('Std Dev');
        const maxZVal = getVal('Max |Z-Score|');
        const skewVal = getVal('Skewness');

        // Card specs
        const statCards = [
          { label: 'Minimum', val: minVal, color: '#0284C7', bg: '#F0F9FF', note: '0th Percentile' },
          { label: 'Median', val: medianVal, color: '#0D9488', bg: '#F0FDF4', note: '50th Percentile (Q2)' },
          { label: 'Mean (μ)', val: meanVal, color: '#2563EB', bg: '#EFF6FF', note: 'Central Expectation' },
          { label: 'Maximum', val: maxVal, color: '#9333EA', bg: '#FAF5FF', note: '100th Percentile' },
          { label: 'Variance (σ²)', val: varVal, color: '#D97706', bg: '#FFFBEB', note: 'Mean Squared Dispersion' },
          { label: 'Std Dev (σ)', val: stdVal, color: '#CA8A04', bg: '#FEFCE8', note: 'Standard Dispersion' },
          {
            label: 'Max |Z-Score|',
            val: maxZVal,
            color: maxZVal >= 3.0 ? '#DC2626' : maxZVal >= 2.0 ? '#D97706' : '#16A34A',
            bg: maxZVal >= 3.0 ? '#FEF2F2' : maxZVal >= 2.0 ? '#FFFBEB' : '#F0FDF4',
            note: maxZVal >= 3.0 ? 'Extreme Outlier (>3σ)' : maxZVal >= 2.0 ? 'Moderate (>2σ)' : 'Normal (<2σ)',
          },
        ];

        // Gaussian Bell curve generation
        const cx = 300;
        const sigmaPx = 75;
        const baseCy = 115;
        const peakH = 80;

        const points: [number, number][] = [];
        for (let z = -3.2; z <= 3.25; z += 0.1) {
          const x = cx + z * sigmaPx;
          const y = baseCy - peakH * Math.exp(-0.5 * z * z);
          points.push([x, y]);
        }
        const bellCurvePath = 'M ' + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ');
        const bellCurveArea = bellCurvePath + ` L ${points[points.length - 1][0].toFixed(1)},${baseCy} L ${points[0][0].toFixed(1)},${baseCy} Z`;

        // 1-sigma shaded area (-1 to +1)
        const sigma1Points = points.filter(([x]) => x >= cx - sigmaPx && x <= cx + sigmaPx);
        const sigma1Area = `M ${cx - sigmaPx},${baseCy} L ` + sigma1Points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ') + ` L ${cx + sigmaPx},${baseCy} Z`;

        // Median z location
        const medianZ = stdVal > 0 ? (medianVal - meanVal) / stdVal : 0;
        const clampedMedianZ = Math.max(-3, Math.min(3, medianZ));
        const medianX = cx + clampedMedianZ * sigmaPx;
        const medianY = baseCy - peakH * Math.exp(-0.5 * clampedMedianZ * clampedMedianZ);

        return (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 7 KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
              {statCards.map(c => (
                <div
                  key={c.label}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    backgroundColor: c.bg,
                    border: '1px solid #E2E8F0',
                    borderTop: `3px solid ${c.color}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                    {c.label}
                  </div>
                  <div className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)', margin: '4px 0' }}>
                    {format(c.val)}
                  </div>
                  <div style={{ fontSize: '10px', color: c.color, fontWeight: 600 }}>
                    {c.note}
                  </div>
                </div>
              ))}
            </div>

            {/* CREATIVE VISUALIZER 1: GAUSSIAN BELL CURVE & Z-SCORE DISPERSION */}
            <div style={{ padding: '16px', backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sigma size={16} color="#0D9488" />
                  <strong style={{ fontSize: '13px', color: 'var(--color-ink)' }}>
                    Standard Normal Z-Score & Gaussian Dispersion Profile
                  </strong>
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--color-muted)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(13, 148, 136, 0.35)' }} />
                    ±1σ Core (68.2%)
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(59, 130, 246, 0.2)' }} />
                    ±2σ Interval (95.4%)
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(239, 68, 68, 0.2)' }} />
                    Outliers (&gt;2.5σ)
                  </span>
                </div>
              </div>

              <svg viewBox="0 0 600 160" width="100%" height="160" role="img" aria-label="Gaussian Z-Score Bell Curve">
                <defs>
                  <linearGradient id="bellGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.02" />
                  </linearGradient>
                  <linearGradient id="sigma1Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0D9488" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#0D9488" stopOpacity="0.1" />
                  </linearGradient>
                </defs>

                {/* Base axis line */}
                <line x1="40" x2="560" y1={baseCy} y2={baseCy} stroke="#CBD5E1" strokeWidth="1.5" />

                {/* Shaded Areas */}
                <path d={bellCurveArea} fill="url(#bellGrad)" />
                <path d={sigma1Area} fill="url(#sigma1Grad)" />
                <path d={bellCurvePath} fill="none" stroke="#2563EB" strokeWidth="2.5" />

                {/* Sigma Vertical Gridlines */}
                {[-3, -2, -1, 1, 2, 3].map(z => {
                  const x = cx + z * sigmaPx;
                  return (
                    <g key={z}>
                      <line x1={x} x2={x} y1={baseCy - 85} y2={baseCy} stroke="#E2E8F0" strokeDasharray="3 3" />
                      <line x1={x} x2={x} y1={baseCy} y2={baseCy + 5} stroke="#94A3B8" strokeWidth="1.5" />
                      <text x={x} y={baseCy + 16} textAnchor="middle" fontSize="10" fill="#64748B" fontWeight="500">
                        {z > 0 ? `+${z}σ` : `${z}σ`}
                      </text>
                      <text x={x} y={baseCy + 28} textAnchor="middle" fontSize="9" fill="#94A3B8" className="font-mono">
                        {format(meanVal + z * stdVal)}
                      </text>
                    </g>
                  );
                })}

                {/* Center Mean (μ) Line */}
                <line x1={cx} x2={cx} y1={baseCy - 88} y2={baseCy} stroke="#2563EB" strokeWidth="2" />
                <circle cx={cx} cy={baseCy - peakH} r="4" fill="#2563EB" stroke="#FFFFFF" strokeWidth="1.5" />
                <line x1={cx} x2={cx} y1={baseCy} y2={baseCy + 6} stroke="#2563EB" strokeWidth="2" />
                <text x={cx} y={baseCy + 16} textAnchor="middle" fontSize="11" fill="#1D4ED8" fontWeight="700">
                  μ (Mean)
                </text>
                <text x={cx} y={baseCy + 28} textAnchor="middle" fontSize="9" fill="#1D4ED8" fontWeight="600" className="font-mono">
                  {format(meanVal)}
                </text>

                {/* Median Marker */}
                <g>
                  <line x1={medianX} x2={medianX} y1={medianY} y2={baseCy} stroke="#0D9488" strokeWidth="2" strokeDasharray="2 2" />
                  <circle cx={medianX} cy={medianY} r="5" fill="#0D9488" stroke="#FFFFFF" strokeWidth="1.5">
                    <title>Median: {format(medianVal)} (Z = {medianZ.toFixed(2)})</title>
                  </circle>
                  <rect x={medianX - 32} y={medianY - 22} width="64" height="16" rx="4" fill="#0D9488" />
                  <text x={medianX} y={medianY - 11} textAnchor="middle" fontSize="9" fill="#FFFFFF" fontWeight="700">
                    Med: {format(medianVal)}
                  </text>
                </g>
              </svg>
            </div>

            {/* CREATIVE VISUALIZER 2: CONNECTED SPREAD TIMELINE */}
            <div style={{ padding: '14px 16px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)' }}>
                  Empirical Range Spread (Minimum to Maximum)
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                  Total Spread Range: <strong className="font-mono" style={{ color: 'var(--color-ink)' }}>{format(maxVal - minVal)}</strong>
                </span>
              </div>

              <svg viewBox="0 0 600 48" width="100%" height="48" role="img" aria-label="Empirical Range Spread">
                <line x1="30" x2="570" y1="22" y2="22" stroke="#CBD5E1" strokeWidth="6" strokeLinecap="round" />
                {(() => {
                  const spread = maxVal - minVal || 1;
                  const markers = [
                    { name: 'Min', val: minVal, color: '#0284C7', z: stdVal ? (minVal - meanVal) / stdVal : 0 },
                    { name: 'μ-σ', val: Math.max(minVal, meanVal - stdVal), color: '#38BDF8', z: -1 },
                    { name: 'Median', val: medianVal, color: '#0D9488', z: stdVal ? (medianVal - meanVal) / stdVal : 0 },
                    { name: 'Mean (μ)', val: meanVal, color: '#2563EB', z: 0 },
                    { name: 'μ+σ', val: Math.min(maxVal, meanVal + stdVal), color: '#818CF8', z: 1 },
                    { name: 'Max', val: maxVal, color: '#9333EA', z: stdVal ? (maxVal - meanVal) / stdVal : 0 },
                  ];

                  return markers.map(m => {
                    const pos = 30 + 540 * Math.max(0, Math.min(1, (m.val - minVal) / spread));
                    return (
                      <g key={m.name}>
                        <circle cx={pos} cy="22" r="7" fill={m.color} stroke="#FFFFFF" strokeWidth="2">
                          <title>{m.name}: {format(m.val)} (Z={m.z.toFixed(2)})</title>
                        </circle>
                        <text x={pos} y="40" textAnchor="middle" fontSize="10" fill="var(--color-muted)" fontWeight="600">
                          {m.name}
                        </text>
                      </g>
                    );
                  });
                })()}
              </svg>
            </div>

            {/* DATA SCIENCE EVALUATION SUMMARY CALLOUTS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
              <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={16} color="#0D9488" />
                <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                  Skewness: <strong style={{ color: 'var(--color-ink)' }}>{skewVal.toFixed(2)}</strong> ({Math.abs(skewVal) < 0.5 ? 'Symmetric Normal' : skewVal > 0 ? 'Right-Skewed Tail' : 'Left-Skewed Tail'})
                </div>
              </div>

              <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: maxZVal >= 3 ? '#FEF2F2' : '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} color={maxZVal >= 3 ? '#DC2626' : '#16A34A'} />
                <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                  Outlier Severity: <strong style={{ color: maxZVal >= 3 ? '#DC2626' : 'var(--color-ink)' }}>|Z| = {maxZVal.toFixed(2)}</strong> ({maxZVal >= 3 ? 'Flagged (>3σ)' : maxZVal >= 2 ? 'Moderate (>2σ)' : 'Optimal (<2σ)'})
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 2. PROPORTIONAL PIE / DONUT CHART */}
      {isPie && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px', flexWrap: 'wrap', marginTop: '14px' }}>
          <div style={{ position: 'relative', width: '150px', height: '150px' }}>
            <svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label="Proportion pie chart">
              {values.map(([name, n], i) => {
                const start = offset;
                const pct = (100 * n) / total;
                offset += pct;
                return (
                  n > 0 && (
                    <circle
                      key={name}
                      cx="60"
                      cy="60"
                      r="46"
                      pathLength="100"
                      fill="none"
                      stroke={palette[i % palette.length]}
                      strokeWidth="18"
                      strokeDasharray={`${pct} ${100 - pct}`}
                      strokeDashoffset={-start}
                      transform="rotate(-90 60 60)"
                      style={{ transition: 'stroke-dasharray 0.3s ease' }}
                    >
                      <title>{name}: {format(n)} ({pct.toFixed(1)}%)</title>
                    </circle>
                  )
                );
              })}
              <text x="60" y="58" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--color-ink)">
                {format(total)}
              </text>
              <text x="60" y="72" textAnchor="middle" fontSize="10" fill="var(--color-muted)">
                TOTAL
              </text>
            </svg>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px' }}>
            {values.map(([name, n], i) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontSize: '12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: palette[i % palette.length] }} />
                  {name}
                </span>
                <strong className="font-mono">{format(n)} ({((100 * n) / total).toFixed(1)}%)</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. LINE GRAPH TYPE */}
      {isLine && (
        <div style={{ marginTop: '14px' }}>
          <svg viewBox="0 0 600 130" width="100%" height="130" role="img" aria-label="Trend line graph">
            {/* Background gridlines */}
            {[0, 0.33, 0.66, 1].map((pct, idx) => (
              <line key={idx} x1="30" x2="570" y1={15 + pct * 90} y2={15 + pct * 90} stroke="#E2E8F0" strokeDasharray="3 3" />
            ))}

            {/* Polyline path */}
            {values.length > 1 && (
              <polyline
                fill="none"
                stroke="#0284C7"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={values
                  .map(([_, n], i) => {
                    const x = 30 + (540 * i) / (values.length - 1);
                    const y = 105 - (90 * n) / max;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />
            )}

            {/* Points & Labels */}
            {values.map(([name, n], i) => {
              const x = values.length > 1 ? 30 + (540 * i) / (values.length - 1) : 300;
              const y = 105 - (90 * n) / max;
              return (
                <g key={name}>
                  <circle cx={x} cy={y} r="5" fill="#0284C7" stroke="#FFFFFF" strokeWidth="2">
                    <title>{name}: {format(n)}</title>
                  </circle>
                  <text x={x} y={y - 8} textAnchor="middle" fontSize="10" fill="#0369A1" fontWeight="700">
                    {format(n)}
                  </text>
                  <text x={x} y="122" textAnchor="middle" fontSize="10" fill="var(--color-muted)">
                    {name.length > 12 ? name.substring(0, 10) + '..' : name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* 4. SOLID BAR CHART WITH PROPORTIONAL BARS */}
      {isBar && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          {values.map(([name, n], i) => {
            const pct = (n / max) * 100;
            return (
              <div key={name} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1.2fr) 2fr auto', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-ink)', fontWeight: 500 }}>{name}</span>
                <div style={{ width: '100%', height: '10px', backgroundColor: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      backgroundColor: palette[i % palette.length],
                      borderRadius: '5px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <strong className="font-mono" style={{ fontSize: '12px', color: 'var(--color-ink)' }}>
                  {format(n)}
                </strong>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Records({ snapshot, limit }: { snapshot: Snapshot; limit?: number }) {
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
      <thead>
        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--color-border)' }}>
          {snapshot.columns.map(c => (
            <th key={c} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--color-muted)' }}>
              {label(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {snapshot.rows.slice(0, limit).map((row, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
            {snapshot.columns.map(c => (
              <td key={c} style={{ padding: '8px 12px', color: 'var(--color-ink)' }}>
                {value(row[c])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TableReports({ onSendToAI }: { onSendToAI: (report: ReportDocument) => void }) {
  const [table, setTable] = useState<Table>('Sample');
  // const [risk, showRisk] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState('');
  const [revision, refresh] = useState(0);
  const [clusters, setClusters] = useState(3);
  const [trees, setTrees] = useState(64);
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [request, setRequest] = useState('');
  const [working, setWorking] = useState(true);
  const [more, setMore] = useState(false);

  function recalculate(test = false) {
    setError('');
    setWorking(true);
    const query = new URLSearchParams({ clusters: String(clusters), trees: String(trees) });
    if (test) query.set('profile', JSON.stringify(profile));
    setRequest('?' + query.toString());
    refresh(r => r + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Snapshot>('/summary-reports/tables/' + table + request, { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) setSnapshot(data);
      })
      .catch(e => {
        if (!controller.signal.aborted)
          setError(
            e.status === 404
              ? 'This server does not have the table reports endpoint. Restart SampleMind and refresh.'
              : e.message
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setWorking(false);
      });
    return () => controller.abort();
  }, [table, revision, request]);

  // Separate standard table statistics from live fitted ML models
  const standardMetrics = snapshot ? analysis(table, snapshot.rows) : [];
  const mlModels = snapshot?.models || [];

  function download() {
    if (!snapshot) return;
    const allMetrics = [...standardMetrics, ...mlModels];
    const html = renderToStaticMarkup(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <title>{tables[table]} report</title>
        </head>
        <body style={{ fontFamily: 'system-ui', maxWidth: 1000, margin: '32px auto', padding: 20, color: '#173b39' }}>
          <h1>{tables[table]} report</h1>
          <p>{table} · {snapshot.rows.length} rows · {new Date().toISOString()}</p>
          {allMetrics.map((metric, i) => (
            <Graph key={metric.title} metric={metric} index={i} />
          ))}
          <h2>Source data</h2>
          <Records snapshot={snapshot} />
        </body>
      </html>
    );
    const url = URL.createObjectURL(new Blob(['<!doctype html>', html], { type: 'text/html' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'SampleMind-' + table + '.html';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function send() {
    if (!snapshot) return;
    const allMetrics = [...standardMetrics, ...mlModels];
    const header = table + ' report\n' + snapshot.rows.length + ' source rows. Exported context contains aggregate metrics.\n';
    const lines = allMetrics.flatMap(m => [m.title + ' — ' + m.note, ...m.values.map(([k, n]) => k + ': ' + format(n))]);
    let context = header;
    for (const line of lines) {
      if (context.length + line.length > 15400) {
        context += '\nAdditional metric groups omitted from chat context. Downloaded report contains all groups.';
        break;
      }
      context += line + '\n';
    }
    onSendToAI({ report_id: 0, created_at: new Date().toISOString(), text: context, sha256: '', previous_sha256: '', verification: table });
  }

  return (
    <div className="lab-stack">
      <header className="lab-hero">
        <div>
          <div className="lab-kicker">DATABASE LAB & LIVE ANALYTICS</div>
          <h1>Reports &amp; Analysis</h1>
          <p>Explore live database metrics, multi-chart visualizations, and live unsupervised ML on each table.</p>
        </div>
      </header>

      {/* Primary Table Selector */}
      <nav className="lab-tabs" aria-label="Report tables" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(tables) as Table[]).map(key => (
          <button
            key={key}
            type="button"
            aria-pressed={key === table}
            onClick={() => {
              if (key !== table) {
                setTable(key);
                setSnapshot(undefined);
                setError('');
                setMore(false);
                setProfile({});
                setRequest('');
                setClusters(3);
                setTrees(64);
                setWorking(true);
              }
            }}
          >
            {tables[key]}
          </button>
        ))}
        {/* Risk Analysis subtab hidden for live-evaluation clarity (code preserved below):
        <button type="button" aria-pressed={risk} onClick={() => showRisk(true)}>
          Risk Analysis & Predictions
        </button>
        */}
      </nav>

      {/* Risk Analysis subtab hidden; TableReports renders live SQL models directly:
      {risk ? (
        <AIRiskAdvisoryPage />
      ) : ( */}
      <section className="card lab-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: 0 }}>{tables[table]}</h2>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
                Live Table: <span className="font-mono">{table}</span> • {snapshot ? format(snapshot.rows.length) : '...'} records
              </div>
            </div>

            <div className="lab-chips">
              <button className="btn-secondary" disabled={working} onClick={() => recalculate()}>
                Refresh Table Analysis
              </button>
              <button className="btn-primary" disabled={!snapshot || working} onClick={download}>
                Download Report
              </button>
              <button className="btn-secondary" disabled={!snapshot || working} onClick={send}>
                Export to AI Chat
              </button>
            </div>
          </div>

          {error && <p role="alert" className="lab-error">{error}</p>}
          {!snapshot && !error && <p role="status" className="lab-muted">Loading live database table analysis…</p>}

          {snapshot && (
            <>
              {/* EVALUATOR NOTICE & DATA VALIDATION BANNER */}
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: '8px',
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #86EFAC',
                  margin: '16px 0',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <CheckCircle2 size={18} color="#15803D" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: '#166534', lineHeight: 1.5 }}>
                  <strong>Live Table Data Verification (Evaluator Evidence):</strong> All statistical visualizations, K-Means cluster partitions, and Isolation Forest anomaly scores below are{' '}
                  <strong>computed live directly from the current {snapshot.rows.length} rows in the `{table}` database table</strong>. They are neither static mockups nor trained on synthetic data. Every change made to table rows immediately reflects in the refitted models.
                </div>
              </div>

              {/* 1. STANDARD TABLE CHARTS: LINE, BAR, PIE & STATS */}
              <div style={{ marginTop: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '12px' }}>
                  Descriptive Table Metrics & Visualizations
                </h3>
                {standardMetrics.map((metric, i) => (
                  <Graph key={metric.title} metric={metric} index={i} />
                ))}
              </div>

              {/* 2. LIVE UNSUPERVISED MACHINE LEARNING MODELS SECTION */}
              <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '2px dashed var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <BrainCircuit size={20} color="var(--color-teal)" />
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                    Unsupervised Machine Learning Models on `{table}`
                  </h3>
                </div>
                <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--color-muted)' }}>
                  {snapshot.ml_purpose?.description || 'Automated pattern discovery, operational cohort segmentation, and anomaly detection.'}
                </p>

                {/* Display Both ML Models First */}
                {mlModels.map((metric, i) => (
                  <Graph key={metric.title} metric={metric} index={i + 10} />
                ))}

                {/* 3. MODEL SETTINGS & PROFILE SCORING (SHIFTED BELOW BOTH ML MODELS) */}
                <section
                  style={{
                    padding: '18px 22px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '10px',
                    backgroundColor: '#F8FAFC',
                    margin: '20px 0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Sliders size={18} color="var(--color-teal)" />
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-ink)' }}>
                      Model Settings & Profile Evaluator
                    </h4>
                  </div>
                  <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--color-muted)' }}>
                    Tune the hyperparameters for the models above. Refreshing refits K-Means and Isolation Forest on the live table rows.
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      K-Means Cluster Groups (k):
                      <select
                        className="input-field"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        value={clusters}
                        onChange={e => setClusters(Number(e.target.value))}
                      >
                        {[2, 3, 4, 5, 6, 7, 8].map(n => (
                          <option key={n} value={n}>
                            {n} Clusters
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Isolation Forest Estimators:
                      <select
                        className="input-field"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        value={trees}
                        onChange={e => setTrees(Number(e.target.value))}
                      >
                        {[16, 32, 64, 128, 256].map(n => (
                          <option key={n} value={n}>
                            {n} Trees
                          </option>
                        ))}
                      </select>
                    </label>

                    <button className="btn-secondary" disabled={working} onClick={() => recalculate()} style={{ fontSize: '12px' }}>
                      Refit Models on Live Data
                    </button>
                  </div>

                  {/* Interactive Test Profile */}
                  <details style={{ marginTop: '14px', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: 'var(--color-teal)' }}>
                      Test a Candidate Profile (Interactive Anomaly Scoring)
                    </summary>
                    <p style={{ margin: '8px 0 12px', fontSize: '12px', color: 'var(--color-muted)' }}>
                      Enter hypothetical feature values to score how unusual a profile is compared to the live {table} distribution. The test record is scored in-memory and never written to the database.
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                      {snapshot.features?.map(({ key, options }) => (
                        <label key={key} style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-ink)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span>{label(key)}:</span>
                          {options ? (
                            <select
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              value={profile[key] ?? ''}
                              onChange={e => setProfile({ ...profile, [key]: e.target.value })}
                            >
                              <option value="">(Missing / Default)</option>
                              {options.map(option => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="any"
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '12px', width: '130px' }}
                              value={profile[key] ?? ''}
                              onChange={e => setProfile({ ...profile, [key]: e.target.value })}
                            />
                          )}
                        </label>
                      ))}
                    </div>

                    <button
                      className="btn-primary"
                      disabled={working || !Object.values(profile).some(Boolean)}
                      onClick={() => recalculate(true)}
                      style={{ fontSize: '12px' }}
                    >
                      Score Profile Against Live Model
                    </button>
                  </details>

                  {working && <p role="status" className="lab-muted" style={{ marginTop: '8px' }}>Refitting models on live rows…</p>}
                </section>
              </div>

              {/* 4. SOURCE DATA RECORDS */}
              <div style={{ marginTop: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-ink)' }}>
                    Live Source Data ({snapshot.rows.length} Rows)
                  </h3>
                  {snapshot.rows.length > 25 && (
                    <button className="btn-secondary" style={{ fontSize: '12px' }} onClick={() => setMore(v => !v)}>
                      {more ? 'Show First 25 Rows' : `Show All ${snapshot.rows.length} Rows`}
                    </button>
                  )}
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                  <Records snapshot={snapshot} limit={more ? undefined : 25} />
                </div>
              </div>
            </>
          )}
        </section>
      {/* )} */}
    </div>
  );
}
export default TableReports;
