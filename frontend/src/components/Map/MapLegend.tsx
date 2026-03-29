import * as d3 from 'd3';
import type { MapMode } from '../../types';
import { HEALTH_METRIC_LABELS } from '../../types';

interface Props {
  colorScale: d3.ScaleSequential<string, never> | d3.ScaleDiverging<string, never>;
  selectedMetric: string;
  mapMode: MapMode;
}

export default function MapLegend({ colorScale, selectedMetric, mapMode }: Props) {
  const label = mapMode === 'vulnerability' ? 'Social Vulnerability Index'
    : mapMode === 'equity' ? `Context lens for ${HEALTH_METRIC_LABELS[selectedMetric] ?? selectedMetric}`
    : HEALTH_METRIC_LABELS[selectedMetric] ?? selectedMetric;

  const domain = colorScale.domain();
  const lo = domain[0];
  const hi = domain[domain.length - 1];

  // Generate gradient stops
  const stops = d3.range(0, 1.01, 0.05).map(t => ({
    offset: `${t * 100}%`,
    color: colorScale(lo + (hi - lo) * t),
  }));

  const gradId = 'legend-gradient';

  return (
    <div className="map-legend">
      <svg width="0" height="0">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            {stops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
      </svg>

      <div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div>
        <div
          className="legend-bar"
          style={{ background: `url(#${gradId})` }}
        >
          <svg width="180" height="8" style={{ borderRadius: 4, overflow: 'hidden' }}>
            <rect width="180" height="8" fill={`url(#${gradId})`} />
          </svg>
        </div>
        <div className="legend-labels">
          <span>{lo.toFixed(1)}</span>
          {domain.length === 3 && <span>{Number(domain[1]).toFixed(1)}</span>}
          <span>{hi.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
