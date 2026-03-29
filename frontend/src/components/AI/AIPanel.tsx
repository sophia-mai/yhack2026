import { useEffect, useRef, useState } from 'react';
import { getPopulationInsight } from '../../api/client';
import type { CountyRecord, HealthMetric } from '../../types';
import { HEALTH_METRIC_LABELS } from '../../types';

interface Props {
  county: CountyRecord | null;
  metric: HealthMetric;
  value: number | null;
  percentile: number | null;
  stateAverage: number | null;
  nationalAverage: number | null;
  matchedCountyLabel?: string | null;
  patientLabel?: string | null;
}

export default function AIPanel({
  county,
  metric,
  value,
  percentile,
  stateAverage,
  nationalAverage,
  matchedCountyLabel,
  patientLabel,
}: Props) {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const canGenerate = !!county && value !== null && percentile !== null && !isLoading;

  async function handleGenerate() {
    if (!county || value === null || percentile === null || isLoading) return;
    setIsLoading(true);
    try {
      const res = await getPopulationInsight({
        county: `${county.name}, ${county.state}`,
        metric: HEALTH_METRIC_LABELS[metric] ?? metric,
        value,
        percentile,
        stateAverage: stateAverage ?? undefined,
        nationalAverage: nationalAverage ?? undefined,
        matchedCounty: matchedCountyLabel ?? undefined,
        patientLabel: patientLabel ?? undefined,
      });
      setText(res.insight);
      setHasLoaded(true);
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
    } catch (err) {
      setText(`Unable to generate trend synthesis: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setText('');
    setHasLoaded(false);
  }, [county?.fips, metric]);

  useEffect(() => {
    if (county && value !== null && percentile !== null && !hasLoaded) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [county?.fips, metric, value, percentile]);

  return (
    <div className="ai-panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="panel-title">AI Trend Synthesis</div>
            <div className="panel-subtitle">Aggregate county signal, framed for interpretation</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {hasLoaded && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(text)}>
                Copy
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              {isLoading ? '…' : '↺ Refresh'}
            </button>
          </div>
        </div>
        {isLoading && <div className="loading-bar" style={{ marginTop: 8 }} />}
      </div>

      <div className="ai-content" ref={contentRef}>
        {!county && !isLoading && (
          <div className="ai-placeholder">
            <div className="ai-placeholder-icon">🧭</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              Select a county
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              Choose a county on the map to generate a short synthesis of how the selected trend compares to broader context.
            </div>
          </div>
        )}

        {county && !text && !isLoading && (
          <div className="ai-placeholder">
            <div className="ai-placeholder-icon">🧠</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              Trend synthesis ready
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              Generate a concise AI summary to explain what the selected county and metric mean in context.
            </div>
          </div>
        )}

        {text && (
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {text}
          </div>
        )}
      </div>
    </div>
  );
}
