import type { CountyRecord, HealthMetric } from '../../types';
import { HEALTH_METRIC_LABELS, HEALTH_METRIC_UNITS } from '../../types';
import { useStore } from '../../store/useStore';

interface Props {
  county: CountyRecord;
  onClose: () => void;
}

const METRICS: HealthMetric[] = [
  'obesity',
  'smoking',
  'diabetes',
  'physicalInactivity',
  'mentalHealth',
  'heartDisease',
  'copd',
  'checkups',
  'mortalityRate',
];

function formatMetricValue(metric: HealthMetric, value: number) {
  const unit = HEALTH_METRIC_UNITS[metric] ?? '%';
  if (unit === '/100k') return `${Math.round(value).toLocaleString()} ${unit}`;
  return `${value.toFixed(1)}${unit}`;
}

function getMetricProgress(metric: HealthMetric, value: number) {
  const pctRange =
    metric === 'checkups' ? [10, 70]
      : metric === 'mortalityRate' ? [3000, 20000]
        : metric === 'heartDisease' ? [25, 60]
          : [5, 50];
  return ((value - Number(pctRange[0])) / (Number(pctRange[1]) - Number(pctRange[0]))) * 100;
}

export default function CountyModal({ county, onClose }: Props) {
  const { patientContext, selectedMetric } = useStore();
  const isMatchedCounty = patientContext?.matchedCountyFips === county.fips;
  const selectedMetricLabel = HEALTH_METRIC_LABELS[selectedMetric] ?? selectedMetric;
  const focusMetricValue = (county.health as Record<string, number>)[selectedMetric] ?? 0;
  const metricOrder = [
    selectedMetric,
    ...METRICS.filter(metric => metric !== selectedMetric),
  ];
  const summaryCopy = isMatchedCounty
    ? 'This county is the patient anchor. Use the highlighted metric and full county bar stack here as the baseline for comparison.'
    : `This spotlight is the full county readout. The highlighted metric matches your map focus, and the rest of the bars give supporting context.`;

  return (
    <div className="modal-overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal population-spotlight fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="county-spotlight-title"
      >
        <div className="modal-header">
          <div className="modal-header-copy">
            <h2 id="county-spotlight-title" style={{ fontSize: 20, marginBottom: 4 }}>{county.name}</h2>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {county.stateName} · Pop. {county.population.toLocaleString()}
            </div>
            <div className="modal-header-tags">
              <span className={`modal-context-chip${isMatchedCounty ? ' active' : ''}`}>
                {isMatchedCounty ? 'Patient anchor county' : 'Comparison county'}
              </span>
              <span className="modal-context-chip">{selectedMetricLabel} in focus</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close county spotlight">✕</button>
        </div>

        <div className="modal-spotlight-hero">
          <div className="modal-spotlight-value">
            {formatMetricValue(selectedMetric, focusMetricValue)}
          </div>
          <div className="modal-spotlight-copy">
            <div className="modal-spotlight-label">{selectedMetricLabel}</div>
            <div className="modal-context-summary">
              {summaryCopy}
            </div>
          </div>
        </div>

        <div className="section-label" style={{ marginBottom: 12 }}>Community Conditions</div>
        <div className="modal-glance-grid">
          <div className="modal-glance-card">
            <div className="modal-glance-value">{county.demographics.pctPoverty.toFixed(1)}%</div>
            <div className="modal-glance-label">Below poverty line</div>
          </div>
          <div className="modal-glance-card">
            <div className="modal-glance-value">{county.demographics.pctUninsured.toFixed(1)}%</div>
            <div className="modal-glance-label">Uninsured</div>
          </div>
          <div className="modal-glance-card">
            <div className="modal-glance-value">{county.demographics.pctElderly.toFixed(1)}%</div>
            <div className="modal-glance-label">Age 65+</div>
          </div>
          <div className="modal-glance-card">
            <div className="modal-glance-value modal-glance-value-accent">{county.svi.overall.toFixed(3)}</div>
            <div className="modal-glance-label">SVI score</div>
          </div>
        </div>

        <div className="section-label" style={{ marginBottom: 12 }}>All Health Indicators</div>
        <div className="modal-signal-list">
          {metricOrder.map(m => {
            const val = (county.health as Record<string, number>)[m];
            const pct = getMetricProgress(m, val);
            return (
              <div
                key={m}
                className={`impact-bar-row${m === selectedMetric ? ' impact-bar-row-active' : ''}`}
              >
                <span className="impact-bar-label">{HEALTH_METRIC_LABELS[m]}</span>
                <div className="impact-bar-track">
                  <div
                    className={`impact-bar-fill ${m === 'checkups' ? 'bar-positive' : 'bar-negative'}${m === selectedMetric ? ' impact-bar-fill-active' : ''}`}
                    style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
                  />
                </div>
                <span className="impact-bar-val">
                  {formatMetricValue(m, val)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="modal-section-note">
          The right rail is now only for comparison against the patient anchor, comparable counties, and AI interpretation.
        </div>
      </div>
    </div>
  );
}
