import type { CountyRecord, SimulationResponse } from '../../types';
import { HEALTH_METRIC_LABELS, HEALTH_METRIC_UNITS } from '../../types';
import { useStore } from '../../store/useStore';

interface Props {
  county: CountyRecord;
  onClose: () => void;
  resultsByFips: Map<string, SimulationResponse['results'][0]>;
}

const METRICS = ['obesity', 'smoking', 'diabetes', 'physicalInactivity', 'mentalHealth', 'heartDisease', 'copd', 'checkups'];

export default function CountyModal({ county, onClose, resultsByFips }: Props) {
  const result = resultsByFips.get(county.fips);
  const { addIntervention } = useStore();

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
            const change = result?.absoluteChange[m];
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
                  {change !== undefined && (
                    <span style={{
                      marginLeft: 4, fontSize: 10,
                      color: (m === 'checkups' ? change > 0 : change < 0) ? 'var(--accent-primary)' : 'var(--accent-coral)'
                    }}>
                      {change > 0 ? '▲' : '▼'}{Math.abs(change).toFixed(1)}
                    </span>
                  )}
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

        {/* Simulation Result */}
        {result && (
          <>
            <div className="section-label" style={{ marginBottom: 12 }}>Simulation Impact</div>
            <div className="metrics-grid" style={{ marginBottom: 20 }}>
              <div className="metric-tile" style={{ borderColor: 'rgba(0,212,170,0.3)' }}>
                <div className="metric-tile-value num-accent">{result.qalysGained.toLocaleString()}</div>
                <div className="metric-tile-label">QALYs Gained</div>
              </div>
              <div className="metric-tile">
                <div className="metric-tile-value">${result.costPerQaly.toLocaleString()}</div>
                <div className="metric-tile-label">Cost / QALY</div>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { addIntervention('preventive_screenings'); onClose(); }}
          >
            + Add Preventive Screening here
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
