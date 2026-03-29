import type { CountyRecord } from '../../types';
import { HEALTH_METRIC_LABELS, HEALTH_METRIC_UNITS } from '../../types';
import { useStore } from '../../store/useStore';

interface Props {
  county: CountyRecord;
  onClose: () => void;
}

const METRICS = ['obesity', 'smoking', 'diabetes', 'physicalInactivity', 'mentalHealth', 'heartDisease', 'copd', 'checkups'];

export default function CountyModal({ county, onClose }: Props) {
  const { patientContext, selectedMetric } = useStore();
  const isMatchedCounty = patientContext?.matchedCountyFips === county.fips;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in">
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>{county.name}</h2>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {county.stateName} · Pop. {county.population.toLocaleString()}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Health Indicators */}
        <div className="section-label" style={{ marginBottom: 12 }}>Health Indicators</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {METRICS.map(m => {
            const val = (county.health as Record<string, number>)[m];
            const unit = HEALTH_METRIC_UNITS[m] ?? '%';
            const pctRange = m === 'checkups' ? [10, 70] : m === 'mortalityRate' ? [3000, 20000] : m === 'heartDisease' ? [25, 60] : [5, 50];
            const pct = ((val - Number(pctRange[0])) / (Number(pctRange[1]) - Number(pctRange[0]))) * 100;
            return (
              <div key={m} className="impact-bar-row">
                <span className="impact-bar-label">{HEALTH_METRIC_LABELS[m]}</span>
                <div className="impact-bar-track">
                  <div
                    className={`impact-bar-fill ${m === 'checkups' ? 'bar-positive' : 'bar-negative'}`}
                    style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
                  />
                </div>
                <span className="impact-bar-val">
                  {val.toFixed(1)}{unit}
                </span>
              </div>
            );
          })}
        </div>

        {/* Demographics */}
        <div className="section-label" style={{ marginBottom: 12 }}>Demographics & Vulnerability</div>
        <div className="metrics-grid" style={{ marginBottom: 20 }}>
          <div className="metric-tile">
            <div className="metric-tile-value">{county.demographics.pctPoverty}%</div>
            <div className="metric-tile-label">Below Poverty Line</div>
          </div>
          <div className="metric-tile">
            <div className="metric-tile-value">{county.demographics.pctUninsured}%</div>
            <div className="metric-tile-label">Uninsured</div>
          </div>
          <div className="metric-tile">
            <div className="metric-tile-value">{county.demographics.pctElderly}%</div>
            <div className="metric-tile-label">Age 65+</div>
          </div>
          <div className="metric-tile">
            <div className="metric-tile-value" style={{ color: 'var(--accent-purple)' }}>
              {county.svi.overall.toFixed(3)}
            </div>
            <div className="metric-tile-label">SVI Score</div>
          </div>
          <div className="metric-tile">
            <div className="metric-tile-value">{county.environment.aqiPM25}</div>
            <div className="metric-tile-label">PM₂.₅ AQI</div>
          </div>
          <div className="metric-tile">
            <div className="metric-tile-value">{county.environment.aqiO3.toFixed(1)}</div>
            <div className="metric-tile-label">Avg Unhealthy Days</div>
          </div>
        </div>

        <div className="section-label" style={{ marginBottom: 12 }}>Interpretation Notes</div>
        <div className="card" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {isMatchedCounty
              ? 'This county is currently acting as the patient anchor. Use it to explain how the individual case fits within local disease burden and community conditions.'
              : 'Use this county as a comparison point to see how the selected metric and community conditions differ from the patient anchor or national baseline.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
            <span style={{ color: 'var(--text-dim)' }}>Current map metric</span>
            <strong>{HEALTH_METRIC_LABELS[selectedMetric]}</strong>
          </div>
          {isMatchedCounty && (
            <div style={{ fontSize: 11, color: 'var(--accent-primary)' }}>
              Patient anchor county
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
