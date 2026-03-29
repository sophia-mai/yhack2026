import type { CountyRecord } from '../../types';
import { HEALTH_METRIC_LABELS, HEALTH_METRIC_UNITS } from '../../types';

interface Props {
  x: number;
  y: number;
  county: CountyRecord;
  selectedMetric: string;
  isMatchedCounty: boolean;
}

export default function CountyTooltip({ x, y, county, selectedMetric, isMatchedCounty }: Props) {
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
      {isMatchedCounty && (
        <div className="tooltip-pill">Patient anchor county</div>
      )}
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
      <div className="tooltip-row">
        <span>Diabetes rate</span>
        <span className="tooltip-val">{county.health.diabetes.toFixed(1)}%</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
        Click for county context →
      </div>
    </div>
  );
}
