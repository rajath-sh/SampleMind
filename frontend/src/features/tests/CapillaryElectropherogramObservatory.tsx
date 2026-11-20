import { ConceptInfo } from "../../components/ConceptInfo";
import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Play,
  Pause,
} from 'lucide-react';
import { TestListItem } from './types';

interface CapillaryElectropherogramObservatoryProps {
  tests: TestListItem[];
  selectedTestId?: number;
  onSelectTest?: (test: TestListItem) => void;
}

type VizMode = 'electropherogram' | 'qpcr_kinetics' | 'fluorometry';

export const CapillaryElectropherogramObservatory: React.FC<CapillaryElectropherogramObservatoryProps> = ({
  tests,
  selectedTestId,
  onSelectTest,
}) => {
  const [mode, setMode] = useState<VizMode>('electropherogram');
  const [isPlaying, setIsPlaying] = useState(() => document.documentElement.dataset.motion !== 'reduced' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number; valX: string; valY: string } | null>(null);

  // Active specimen assay to visualize
  const activeTest = tests.find((t) => t.sample_test_id === selectedTestId) || tests[0] || null;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const scanPosRef = useRef<number>(0);

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width;
    let height = canvas.height;

    const testValue = activeTest?.result_value !== undefined && activeTest?.result_value !== null
      ? Number(activeTest.result_value)
      : 22.5;

    const interp = (activeTest?.result_interpretation || '').toUpperCase();
    const isContaminated = interp === 'CONTAMINATED' || interp === 'FAIL';

    let lastTimestamp = performance.now();

    const render = (now: number) => {
      const dt = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      if (isPlaying) {
        scanPosRef.current += dt * 75 * speed;
        if (scanPosRef.current > width) {
          scanPosRef.current = 0;
        }
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Grid Background & Coordinate Axes
      drawGrid(ctx, width, height, mode);

      // 2. Mode-Specific Scientific Waveform
      if (mode === 'electropherogram') {
        drawElectropherogram(ctx, width, height, testValue, interp);
      } else if (mode === 'qpcr_kinetics') {
        drawQPCRKinetics(ctx, width, height, testValue, isContaminated);
      } else {
        drawFluorometrySpectrum(ctx, width, height, testValue);
      }

      // 3. Laser Detector Scan Line
      drawLaserDetector(ctx, width, height, scanPosRef.current);

      if (isPlaying) animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [mode, isPlaying, speed, activeTest]);

  // Handle Canvas Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Scientific Waveform Drawers
  const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number, currentMode: VizMode) => {
    ctx.strokeStyle = 'rgba(23, 43, 58, 0.08)';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    const hSteps = 5;
    for (let i = 1; i <= hSteps; i++) {
      const y = (h / (hSteps + 1)) * i;
      ctx.beginPath();
      ctx.moveTo(50, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(100, 116, 139, 0.6)';
      ctx.font = '10px monospace';
      let label = '';
      if (currentMode === 'electropherogram') label = `${(hSteps - i + 1) * 25} RFU`;
      else if (currentMode === 'qpcr_kinetics') label = `${((hSteps - i + 1) * 0.25).toFixed(2)} ΔRn`;
      else label = `${(hSteps - i + 1) * 20}%`;
      ctx.fillText(label, 6, y + 3);
    }

    // Vertical grid lines
    const vSteps = 6;
    for (let i = 1; i <= vSteps; i++) {
      const x = 50 + ((w - 70) / vSteps) * i;
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, h - 35);
      ctx.stroke();

      ctx.fillStyle = 'rgba(100, 116, 139, 0.6)';
      ctx.font = '10px monospace';
      let xLabel = '';
      if (currentMode === 'electropherogram') xLabel = `${i * 250} bp`;
      else if (currentMode === 'qpcr_kinetics') xLabel = `C${i * 6}`;
      else xLabel = `${450 + i * 35} nm`;
      ctx.fillText(xLabel, x - 18, h - 18);
    }
  };

  const drawElectropherogram = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    value: number,
    interp: string
  ) => {
    const baseY = h - 45;
    const peakX = Math.min(Math.max(120 + value * 8, 140), w - 160);
    const peakHeight = Math.min(Math.max(value * 3.5, 50), h - 90);

    // Baseline Noise + Peaks Path
    ctx.beginPath();
    ctx.moveTo(50, baseY);

    // 1. Lower Standard Marker (25 bp)
    ctx.lineTo(80, baseY);
    ctx.quadraticCurveTo(90, baseY - 70, 95, baseY - 70);
    ctx.quadraticCurveTo(100, baseY - 70, 110, baseY);

    // 2. Specimen Fragment Distribution Peak
    const widthFactor = interp === 'FAIL' || interp === 'DEGRADED' ? 65 : 28;
    for (let x = 110; x <= w - 70; x += 4) {
      // Noise
      const noise = (Math.sin(x * 0.15) + Math.cos(x * 0.3)) * 1.5;
      // Gaussian peak at peakX
      const dx = (x - peakX) / widthFactor;
      const gaussian = Math.exp(-0.5 * dx * dx) * peakHeight;

      // 3. Upper Standard Marker (1500 bp)
      const dxUpper = (x - (w - 110)) / 10;
      const upperMarker = Math.exp(-0.5 * dxUpper * dxUpper) * 65;

      const y = baseY - (gaussian + upperMarker + noise);
      ctx.lineTo(x, y);
    }

    ctx.lineTo(w - 20, baseY);

    // Fill under curve with gradient
    const grad = ctx.createLinearGradient(0, baseY - peakHeight, 0, baseY);
    if (interp === 'FAIL' || interp === 'CONTAMINATED') {
      grad.addColorStop(0, 'rgba(201, 79, 63, 0.45)');
      grad.addColorStop(1, 'rgba(201, 79, 63, 0.02)');
      ctx.strokeStyle = '#C94F3F';
    } else {
      grad.addColorStop(0, 'rgba(40, 125, 120, 0.45)');
      grad.addColorStop(1, 'rgba(40, 125, 120, 0.02)');
      ctx.strokeStyle = 'var(--color-teal)';
    }

    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.lineTo(w - 20, baseY);
    ctx.lineTo(50, baseY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Callout on Specimen Peak
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(peakX, baseY - peakHeight, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'var(--color-ink)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(
      `Peak: ${value.toFixed(1)} ${activeTest?.result_unit || 'RFU'}`,
      peakX - 35,
      baseY - peakHeight - 10
    );

    // Capillary Gel Strip Simulation at bottom
    drawCapillaryGelLane(ctx, w, peakX, baseY);
  };

  const drawCapillaryGelLane = (
    ctx: CanvasRenderingContext2D,
    w: number,
    peakX: number,
    baseY: number
  ) => {
    const laneY = baseY + 12;
    const laneH = 10;

    // Gel lane boundary
    ctx.fillStyle = 'rgba(23, 43, 58, 0.06)';
    ctx.fillRect(50, laneY, w - 70, laneH);

    // Lower marker band (80px)
    ctx.fillStyle = 'rgba(40, 125, 120, 0.85)';
    ctx.fillRect(92, laneY, 4, laneH);

    // Specimen band
    ctx.fillStyle = activeTest?.result_interpretation === 'CONTAMINATED' ? 'rgba(201, 79, 63, 0.9)' : 'rgba(40, 125, 120, 0.9)';
    ctx.fillRect(peakX - 3, laneY, 6, laneH);

    // Upper marker band
    ctx.fillStyle = 'rgba(40, 125, 120, 0.85)';
    ctx.fillRect(w - 112, laneY, 4, laneH);
  };

  const drawQPCRKinetics = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    value: number,
    isContaminated: boolean
  ) => {
    const baseY = h - 45;
    const cq = isContaminated ? 14.5 : Math.min(Math.max(22.0 - value * 0.1, 16.0), 32.0);
    const cqX = 50 + ((cq / 40) * (w - 70));

    // Threshold baseline line
    const threshY = baseY - 65;
    ctx.strokeStyle = 'rgba(217, 131, 36, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(50, threshY);
    ctx.lineTo(w - 20, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'var(--color-warning)';
    ctx.font = '10px monospace';
    ctx.fillText(`Cq Threshold = 0.20 ΔRn`, w - 150, threshY - 6);

    // Kinetic Sigmoidal Curve (Logistic function)
    ctx.beginPath();
    ctx.moveTo(50, baseY - 5);

    const L = h - 100; // Curve height
    const k = 0.28;    // Steepness

    for (let x = 50; x <= w - 20; x += 4) {
      const cycle = ((x - 50) / (w - 70)) * 40;
      const sigmoid = L / (1 + Math.exp(-k * (cycle - cq)));
      const noise = (Math.sin(cycle * 0.8) + Math.cos(cycle * 1.5)) * 1.2;
      ctx.lineTo(x, baseY - (sigmoid + noise));
    }

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = isContaminated ? '#C94F3F' : 'var(--color-teal)';
    ctx.stroke();

    // Take-off locus point
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(cqX, threshY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'var(--color-ink)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`Cq = ${cq.toFixed(1)} Cycles`, cqX + 8, threshY - 8);
  };

  const drawFluorometrySpectrum = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    value: number
  ) => {
    const baseY = h - 45;

    // Excitation Curve (Peak at 485 nm)
    ctx.beginPath();
    ctx.moveTo(50, baseY);
    for (let x = 50; x <= w - 20; x += 4) {
      const nm = 450 + ((x - 50) / (w - 70)) * 200;
      const dx = (nm - 485) / 18;
      const y = baseY - Math.exp(-0.5 * dx * dx) * (h * 0.45);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(75, 105, 135, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Emission Curve (Peak at 528 nm, height proportional to specimen concentration)
    const emPeakX = 50 + (((528 - 450) / 200) * (w - 70));
    const emHeight = Math.min(Math.max(value * 4.5, 40), h - 90);

    ctx.beginPath();
    ctx.moveTo(50, baseY);
    for (let x = 50; x <= w - 20; x += 4) {
      const nm = 450 + ((x - 50) / (w - 70)) * 200;
      const dx = (nm - 528) / 24;
      const y = baseY - Math.exp(-0.5 * dx * dx) * emHeight;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'var(--color-teal)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Emission peak indicator
    ctx.fillStyle = 'var(--color-teal)';
    ctx.beginPath();
    ctx.arc(emPeakX, baseY - emHeight, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'var(--color-ink)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`λem: 528 nm (${value.toFixed(1)} ${activeTest?.result_unit || 'ng/uL'})`, emPeakX - 50, baseY - emHeight - 12);
  };

  const drawLaserDetector = (ctx: CanvasRenderingContext2D, w: number, h: number, x: number) => {
    if (x < 50 || x > w - 20) return;

    ctx.strokeStyle = 'rgba(40, 125, 120, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 15);
    ctx.lineTo(x, h - 35);
    ctx.stroke();

    // Laser glow spot
    ctx.fillStyle = 'var(--color-teal)';
    ctx.beginPath();
    ctx.arc(x, 15, 3.5, 0, Math.PI * 2);
    ctx.fill();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < 50 || x > rect.width - 20 || y > rect.height - 35) {
      setHoverCoord(null);
      return;
    }

    let valX = '';
    let valY = `${Math.round(((rect.height - 45 - y) / (rect.height - 45)) * 100)}%`;

    if (mode === 'electropherogram') {
      const bp = Math.round(25 + ((x - 50) / (rect.width - 70)) * 1500);
      valX = `${bp} bp`;
    } else if (mode === 'qpcr_kinetics') {
      const cycle = (1 + ((x - 50) / (rect.width - 70)) * 39).toFixed(1);
      valX = `Cycle ${cycle}`;
    } else {
      const nm = Math.round(450 + ((x - 50) / (rect.width - 70)) * 200);
      valX = `${nm} nm`;
    }

    setHoverCoord({ x, y, valX, valY });
  };

  return (
    <div className="card" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={20} color="var(--color-teal)" />
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Micro-Capillary Electropherogram & Spectral Waveform Observatory
              <span className="badge badge-success" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                Simulation
              </span>
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              Illustrative waveforms anchored to a selected assay result when available
            </div>
          </div>
          <ConceptInfo title="Assay waveform illustration" steps={['Select assay result', 'Read stored scalar', 'Render simulated waveform']}>
            <p>The test record stores a scalar result and interpretation. The animated shape illustrates the measurement technique using that value or an example value. Raw detector time series are unavailable in the project database.</p>
          </ConceptInfo>
        </div>

        {/* Mode Switcher Tabs */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            type="button"
            className="badge badge-sand"
            style={{
              cursor: 'pointer',
              border: mode === 'electropherogram' ? '1px solid var(--color-teal)' : '1px solid transparent',
              backgroundColor: mode === 'electropherogram' ? 'var(--color-pale-teal)' : undefined,
              color: mode === 'electropherogram' ? 'var(--color-teal)' : undefined,
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
            }}
            onClick={() => setMode('electropherogram')}
          >
            Capillary Electropherogram
          </button>
          <button
            type="button"
            className="badge badge-sand"
            style={{
              cursor: 'pointer',
              border: mode === 'qpcr_kinetics' ? '1px solid var(--color-teal)' : '1px solid transparent',
              backgroundColor: mode === 'qpcr_kinetics' ? 'var(--color-pale-teal)' : undefined,
              color: mode === 'qpcr_kinetics' ? 'var(--color-teal)' : undefined,
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
            }}
            onClick={() => setMode('qpcr_kinetics')}
          >
            qPCR Kinetic Sigmoid
          </button>
          <button
            type="button"
            className="badge badge-sand"
            style={{
              cursor: 'pointer',
              border: mode === 'fluorometry' ? '1px solid var(--color-teal)' : '1px solid transparent',
              backgroundColor: mode === 'fluorometry' ? 'var(--color-pale-teal)' : undefined,
              color: mode === 'fluorometry' ? 'var(--color-teal)' : undefined,
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
            }}
            onClick={() => setMode('fluorometry')}
          >
            Fluorometric Spectrum
          </button>
        </div>
      </div>

      {/* Target Specimen Active Selector Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        backgroundColor: 'var(--color-background)',
        borderRadius: 'var(--radius-control)',
        fontSize: '12px',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--color-muted)', fontWeight: 600 }}>Active Assay Focal Specimen:</span>
          {tests.length > 0 ? (
            <select
              className="input"
              style={{ padding: '2px 8px', fontSize: '11px', height: '28px', maxWidth: '320px' }}
              value={activeTest?.sample_test_id || ''}
              onChange={(e) => {
                const target = tests.find((t) => t.sample_test_id === Number(e.target.value));
                if (target && onSelectTest) onSelectTest(target);
              }}
            >
              {tests.map((t) => (
                <option key={t.sample_test_id} value={t.sample_test_id}>
                  #{t.sample_test_id} · {t.sample_code} ({t.test_type.slice(0, 22)}... {t.result_value !== undefined && t.result_value !== null ? `${t.result_value} ${t.result_unit}` : ''})
                </option>
              ))}
            </select>
          ) : (
            <span style={{ color: 'var(--color-muted)' }}>No test records loaded</span>
          )}
        </div>

        {/* Playback and Scan Rate Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '3px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            {isPlaying ? 'Freeze' : 'Scan'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '3px 8px', fontSize: '11px' }}
            onClick={() => setSpeed(speed === 1 ? 2 : 1)}
          >
            {speed}x Rate
          </button>
        </div>
      </div>

      {/* Waveform Canvas Area */}
      <div style={{ position: 'relative', width: '100%', height: '230px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-control)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverCoord(null)}
        />

        {/* Hover Crosshair Overlay Tooltip */}
        {hoverCoord && (
          <div style={{
            position: 'absolute',
            left: `${hoverCoord.x + 12}px`,
            top: `${hoverCoord.y - 32}px`,
            backgroundColor: 'rgba(23, 43, 58, 0.9)',
            color: '#FFFFFF',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontFamily: 'monospace',
            pointerEvents: 'none',
            zIndex: 10,
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          }}>
            {hoverCoord.valX} · {hoverCoord.valY}
          </div>
        )}
      </div>

      {/* Scientific Footnote */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--color-muted)' }}>
        <div>
          {mode === 'electropherogram' && 'Simulation calibrated to Agilent 2100 Bioanalyzer DNA 1000 optical ladder.'}
          {mode === 'qpcr_kinetics' && 'Standardized baseline cycle subtractive algorithm (ΔRn normalized reporter signal).'}
          {mode === 'fluorometry' && 'Dual-wavelength excitation / emission spectral dynamic range (485 nm / 528 nm).'}
        </div>
        <div style={{ fontStyle: 'italic' }}>
          Interacting with the Tests table automatically calibrates the electropherogram locus.
        </div>
      </div>
    </div>
  );
};
