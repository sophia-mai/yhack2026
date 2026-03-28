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
        <div className="section-label">Simulation Results</div>
        <div className="metrics-grid" style={{ marginTop: 8 }}>
          <div className="metric-tile" style={{ borderColor: 'rgba(0,212,170,0.25)' }}>
            <div className="metric-tile-value num-accent">{s.totalQalysGained.toLocaleString()}</div>
            <div className="metric-tile-label">QALYs Gained</div>
          </div>
          <div className="metric-tile">
            <div className="metric-tile-value">${s.avgCostPerQaly.toLocaleString()}</div>
            <div className="metric-tile-label">Cost / QALY</div>
          </div>
          <div className="metric-tile">
            <div className="metric-tile-value">{s.countiesAnalyzed.toLocaleString()}</div>
            <div className="metric-tile-label">Counties Analyzed</div>
          </div>
          <div className="metric-tile">
            <div className="metric-tile-value">{(s.totalPopulation / 1_000_000).toFixed(1)}M</div>
            <div className="metric-tile-label">People Reached</div>
          </div>
        </div>
      </div>

      {/* Avg metric change */}
      <div className="card">
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{label} — Avg Change</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="num-large" style={{
            color: (selectedMetric === 'checkups' ? avgChange > 0 : avgChange < 0)
              ? 'var(--accent-primary)' : 'var(--accent-coral)'
          }}>
            {avgChange > 0 ? '+' : ''}{avgChange.toFixed(2)}{unit}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>avg across all counties</span>
        </div>
        <div style={{ marginTop: 8, height: 6, background: 'var(--bg-base)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: (selectedMetric === 'checkups' ? avgChange > 0 : avgChange < 0)
              ? 'var(--accent-primary)' : 'var(--accent-coral)',
            width: `${Math.min(100, Math.abs(avgChange) * 10)}%`,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* Equity */}
      <div className="card">
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>Health Equity</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="equity-gauge">
            <div className="gauge-value" style={{
              color: s.giniCoefficient < 0.2 ? 'var(--accent-primary)'
                : s.giniCoefficient < 0.35 ? 'var(--accent-amber)'
                : 'var(--accent-coral)'
            }}>
              {s.giniCoefficient.toFixed(3)}
            </div>
            <div className="gauge-label">Gini Coefficient</div>
          </div>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {s.giniCoefficient < 0.2
              ? '✅ Low disparity — interventions are well distributed'
              : s.giniCoefficient < 0.35
              ? '⚠️ Moderate disparity — consider targeted programs'
              : '🔴 High disparity — equity-focused targeting recommended'}
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
      <div className="card">
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>Budget Breakdown</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Total Budget</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>${s.budgetTotal.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Time Horizon</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.timeHorizonYears} years</span>
        </div>
      </div>
    </div>
  );
}
