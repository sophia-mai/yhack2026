import type { CountyRecord, MapMode, SimulationResponse } from '../../types';
import { HEALTH_METRIC_LABELS, HEALTH_METRIC_UNITS } from '../../types';

interface Props {
  x: number;
  y: number;
  county: CountyRecord;
  selectedMetric: string;
  mapMode: MapMode;
  resultsByFips: Map<string, SimulationResponse['results'][0]>;
}

export default function CountyTooltip({ x, y, county, selectedMetric, resultsByFips }: Props) {
  const result = resultsByFips.get(county.fips);
  const val = (county.health as Record<string, number>)[selectedMetric];
  const unit = HEALTH_METRIC_UNITS[selectedMetric] ?? '%';
  const label = HEALTH_METRIC_LABELS[selectedMetric] ?? selectedMetric;

  // Position to avoid going off-screen
  const left = x + 14;
  const top = y - 10;

  return (
    <div
      className="map-tooltip"
      style={{ left, top }}
    >
      <div className="tooltip-title">{county.name}, {county.state}</div>
      <div className="tooltip-row">
        <span>{label}</span>
        <span className="tooltip-val">{val?.toFixed(1)}{unit}</span>
      </div>
      <div className="tooltip-row">
        <span>Population</span>
        <span className="tooltip-val">{county.population.toLocaleString()}</span>
      </div>
      <div className="tooltip-row">
        <span>SVI</span>
        <span className="tooltip-val">{county.svi.overall.toFixed(3)}</span>
      </div>
      <div className="tooltip-row">
        <span>% Poverty</span>
        <span className="tooltip-val">{county.demographics.pctPoverty}%</span>
      </div>
      {result && (
        <>
          <div style={{ height: 4 }} />
          <div className="tooltip-row">
            <span>Projected Change</span>
            <span className={`tooltip-val ${(result.absoluteChange[selectedMetric] ?? 0) < 0 ? 'change-positive' : 'change-negative'}`}>
              {(result.absoluteChange[selectedMetric] ?? 0) > 0 ? '+' : ''}
              {result.absoluteChange[selectedMetric]?.toFixed(2)}{unit}
            </span>
          </div>
          <div className="tooltip-row">
            <span>QALYs Gained</span>
            <span className="tooltip-val num-accent">{result.qalysGained.toLocaleString()}</span>
          </div>
        </>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
        Click for full county profile →
      </div>
    </div>
  );
}
