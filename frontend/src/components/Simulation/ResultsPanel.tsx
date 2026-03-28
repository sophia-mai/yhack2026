import { useStore } from '../../store/useStore';
import { HEALTH_METRIC_LABELS, HEALTH_METRIC_UNITS } from '../../types';

export default function ResultsPanel() {
  const { simulationResult, selectedMetric } = useStore();

  if (!simulationResult) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12,
        color: 'var(--text-dim)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 32 }}>📊</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>No Simulation Yet</div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          Select interventions and click<br /><strong style={{ color: 'var(--text-primary)' }}>Run Simulation</strong> to see projected outcomes.
        </div>
      </div>
    );
  }

  const s = simulationResult.summary;
  const topCounties = simulationResult.topImproved.slice(0, 5);

  // Aggregate avg change for selected metric
  const avgChange = simulationResult.results.reduce((acc, r) =>
    acc + (r.absoluteChange[selectedMetric] ?? 0), 0
  ) / Math.max(1, simulationResult.results.length);

  const unit = HEALTH_METRIC_UNITS[selectedMetric] ?? '%';
  const label = HEALTH_METRIC_LABELS[selectedMetric];

  return (
    <div className="scroll-y" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary KPIs */}
      <div className="fade-in">
        <div style={{ padding: '0 4px 16px' }}>
          <div className="metric-tile-label" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total QALYs Gained</div>
          <div className="metric-massive text-gradient" style={{ marginTop: 4 }}>
            {s.totalQalysGained > 1000000 
              ? (s.totalQalysGained / 1000000).toFixed(1) + 'M' 
              : s.totalQalysGained.toLocaleString()}
          </div>
        </div>
        <div className="metrics-grid">
          <div className="metric-tile card-glass">
            <div className="metric-tile-value text-gradient">${s.avgCostPerQaly.toLocaleString()}</div>
            <div className="metric-tile-label">Cost / QALY</div>
          </div>
          <div className="metric-tile card-glass">
            <div className="metric-tile-value text-gradient">{s.countiesAnalyzed.toLocaleString()}</div>
            <div className="metric-tile-label">Counties Analyzed</div>
          </div>
          <div className="metric-tile card-glass">
            <div className="metric-tile-value text-gradient">{(s.totalPopulation / 1_000_000).toFixed(1)}M</div>
            <div className="metric-tile-label">People Reached</div>
          </div>
        </div>
      </div>

      {/* Avg metric change */}
      <div className="card-glass" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 4 }}>{label} — Avg Change</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="metric-massive" style={{
            fontSize: '2.5rem',
            color: (selectedMetric === 'checkups' ? avgChange > 0 : avgChange < 0)
              ? 'var(--accent-primary)' : 'var(--accent-coral)'
          }}>
            {avgChange > 0 ? '+' : ''}{avgChange.toFixed(2)}{unit}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>across {s.countiesAnalyzed} counties</span>
        </div>
        <div style={{ marginTop: 12, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: (selectedMetric === 'checkups' ? avgChange > 0 : avgChange < 0)
              ? 'var(--accent-primary)' : 'var(--accent-coral)',
            width: `${Math.min(100, Math.abs(avgChange) * 10)}%`,
            transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          }} />
        </div>
      </div>

      {/* Equity */}
      <div className="card-glass" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 12 }}>Health Equity</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="equity-gauge" style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.02)' }}>
            <div className="metric-massive" style={{
              fontSize: '1.5rem',
              color: s.giniCoefficient < 0.2 ? 'var(--accent-primary)'
                : s.giniCoefficient < 0.35 ? 'var(--accent-amber)'
                : 'var(--accent-coral)'
            }}>
              {s.giniCoefficient.toFixed(2)}
            </div>
            <div className="gauge-label" style={{ marginTop: 2 }}>Gini</div>
          </div>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {s.giniCoefficient < 0.2
              ? 'Excellent equity distribution across demographics.'
              : s.giniCoefficient < 0.35
              ? 'Moderate disparity detected. Consider targeted programs.'
              : 'High disparity. Equity-focused targeting highly recommended.'}
          </div>
        </div>
      </div>

      {/* Top counties */}
      <div>
        <div className="section-label" style={{ marginBottom: 8 }}>Top Improved Counties</div>
        {topCounties.map((c, i) => (
          <div key={c.fips} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
            borderBottom: i < topCounties.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', width: 16, flexShrink: 0 }}>#{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}, {c.state}
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-primary)', flexShrink: 0 }}>
              +{c.qalysGained.toLocaleString()} QALYs
            </span>
          </div>
        ))}
      </div>

      {/* Budget */}
      <div className="card-glass" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 8 }}>Budget Breakdown</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Total Capital</span>
          <span style={{ fontWeight: 700, color: 'var(--accent-blue)', letterSpacing: '-0.02em' }}>${s.budgetTotal.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Time Horizon</span>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{s.timeHorizonYears} Years</span>
        </div>
      </div>
    </div>
  );
}
