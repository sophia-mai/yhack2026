import { useState } from 'react';
import { useStore } from '../store/useStore';
import { runSimulation } from '../api/client';
import type { SimulationResponse } from '../types';

export default function ComparePage() {
  const { interventions, budgetTotal, timeHorizon, simResultA, simResultB, setSimResultA, setSimResultB } = useStore();

  const [scenarioA, setScenarioA] = useState<string[]>([]);
  const [scenarioB, setScenarioB] = useState<string[]>([]);
  const [budgetA, setBudgetA] = useState(budgetTotal);
  const [budgetB, setBudgetB] = useState(budgetTotal);
  const [loading, setLoading] = useState<'A' | 'B' | null>(null);
  const [activeCompareMetric, setActiveCompareMetric] = useState('obesity');

  async function simulate(scenario: 'A' | 'B') {
    const ids = scenario === 'A' ? scenarioA : scenarioB;
    const budget = scenario === 'A' ? budgetA : budgetB;
    if (!ids.length) return;
    setLoading(scenario);
    try {
      const result = await runSimulation({
        interventions: ids.map(id => ({ id, budget: budget / ids.length, targeting: 'all' })),
        budgetTotal: budget,
        timeHorizonYears: timeHorizon,
        objective: `Scenario ${scenario}`,
      });
      if (scenario === 'A') setSimResultA(result);
      else setSimResultB(result);
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(null);
    }
  }

  function toggleIntervention(scenario: 'A' | 'B', id: string) {
    if (scenario === 'A') {
      setScenarioA(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    } else {
      setScenarioB(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
  }

  const COMPARE_METRICS = ['obesity', 'smoking', 'diabetes', 'physicalInactivity', 'mentalHealth', 'heartDisease'];

  return (
    <div className="page-full" style={{ gridColumn: '2 / -1', gridRow: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Compare Scenarios</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Build two intervention packages and compare their projected impacts side-by-side.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {(['A', 'B'] as const).map(scenario => {
          const ids = scenario === 'A' ? scenarioA : scenarioB;
          const budget = scenario === 'A' ? budgetA : budgetB;
          const setBudget = scenario === 'A' ? setBudgetA : setBudgetB;
          const result: SimulationResponse | null = scenario === 'A' ? simResultA : simResultB;
          const color = scenario === 'A' ? 'var(--accent-blue)' : 'var(--accent-coral)';

          return (
            <div key={scenario} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 16, color }}>Scenario {scenario}</h2>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => simulate(scenario)}
                  disabled={!ids.length || loading === scenario}
                  style={{ minWidth: 80 }}
                >
                  {loading === scenario ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> : '▶ Run'}
                </button>
              </div>

              {/* Budget slider */}
              <div className="slider-row">
                <div className="slider-label">Budget <span>${(budget / 1_000_000).toFixed(1)}M</span></div>
                <input type="range" min={100000} max={50000000} step={100000}
                  value={budget} onChange={e => setBudget(Number(e.target.value))} />
              </div>

              {/* Intervention selector */}
              <div>
                <div className="section-label" style={{ marginBottom: 6 }}>Interventions ({ids.length} selected)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {interventions.map(i => (
                    <label key={i.id} className="custom-checkbox" style={{ fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={ids.includes(i.id)}
                        onChange={() => toggleIntervention(scenario, i.id)}
                      />
                      <span className="box">{ids.includes(i.id) ? '✓' : ''}</span>
                      {i.icon} {i.name}
                    </label>
                  ))}
                </div>
              </div>

              {/* Results */}
              {result && (
                <div className="fade-in">
                  <div className="divider" />
                  <div className="metrics-grid" style={{ marginTop: 8 }}>
                    <div className="metric-tile">
                      <div className="metric-tile-value" style={{ color }}>{result.summary.totalQalysGained.toLocaleString()}</div>
                      <div className="metric-tile-label">QALYs Gained</div>
                    </div>
                    <div className="metric-tile">
                      <div className="metric-tile-value">${result.summary.avgCostPerQaly.toLocaleString()}</div>
                      <div className="metric-tile-label">Cost/QALY</div>
                    </div>
                    <div className="metric-tile">
                      <div className="metric-tile-value">{result.summary.giniCoefficient.toFixed(3)}</div>
                      <div className="metric-tile-label">Gini Disparity</div>
                    </div>
                    <div className="metric-tile">
                      <div className="metric-tile-value">{(result.summary.totalPopulation / 1_000_000).toFixed(1)}M</div>
                      <div className="metric-tile-label">Population</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Side-by-side comparison table */}
      {simResultA && simResultB && (
        <div className="card fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h3 style={{ fontSize: 15 }}>Metric Comparison</h3>
            <div className="radio-pills">
              {COMPARE_METRICS.map(m => (
                <button
                  key={m}
                  className={`radio-pill${activeCompareMetric === m ? ' active' : ''}`}
                  onClick={() => setActiveCompareMetric(m)}
                  style={{ fontSize: 11 }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>County</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-blue)', paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>Scenario A</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-coral)', paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>Scenario B</div>
            {simResultA.topImproved.slice(0, 5).map(county => {
              const bCounty = simResultB.results.find(r => r.fips === county.fips);
              const aResult = simResultA.results.find(r => r.fips === county.fips);
              const aChange = aResult?.absoluteChange[activeCompareMetric] ?? 0;
              const bChange = bCounty?.absoluteChange[activeCompareMetric] ?? 0;
              return (
                <>
                  <div key={`name-${county.fips}`} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '6px 0' }}>
                    {county.name}, {county.state}
                  </div>
                  <div style={{ fontSize: 12, textAlign: 'center', padding: '6px 0', color: aChange < 0 ? 'var(--accent-primary)' : 'var(--accent-coral)', fontWeight: 600 }}>
                    {aChange > 0 ? '+' : ''}{aChange.toFixed(2)}pp
                  </div>
                  <div style={{ fontSize: 12, textAlign: 'center', padding: '6px 0', color: bChange < 0 ? 'var(--accent-primary)' : 'var(--accent-coral)', fontWeight: 600 }}>
                    {bChange > 0 ? '+' : ''}{bChange.toFixed(2)}pp
                  </div>
                </>
              );
            })}
          </div>

          {/* Winner badge */}
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)', fontSize: 13 }}>
            🏆 <strong>
              {simResultA.summary.totalQalysGained > simResultB.summary.totalQalysGained
                ? 'Scenario A' : 'Scenario B'}
            </strong> yields more QALYs (+{Math.abs(simResultA.summary.totalQalysGained - simResultB.summary.totalQalysGained).toLocaleString()})
            {' '}and a{simResultA.summary.avgCostPerQaly < simResultB.summary.avgCostPerQaly
              ? ' lower' : ' higher'} cost per QALY.
          </div>
        </div>
      )}
    </div>
  );
}
