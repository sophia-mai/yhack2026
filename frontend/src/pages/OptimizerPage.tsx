import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useStore } from '../store/useStore';
import { runOptimizer } from '../api/client';

interface AllocItem {
  interventionId: string;
  interventionName: string;
  category: string;
  icon: string;
  recommendedBudget: number;
  estimatedQalys: number;
  roi: number;
  budgetPct: number;
}

interface OptimizeResult {
  totalBudget: number;
  targetingStrategy: string;
  timeHorizonYears: number;
  totalEstimatedQalys: number;
  costPerQaly: number;
  allocation: AllocItem[];
}

const CAT_COLORS: Record<string, string> = {
  'Preventive Care': '#00D4AA',
  'Behavioral': '#3D8EFF',
  'Environmental': '#9B6FFF',
  'Access': '#FFB84D',
  'Education': '#FF6B6B',
};

export default function OptimizerPage() {
  const { budgetTotal, timeHorizon } = useStore();
  const [budget, setBudget] = useState(budgetTotal);
  const [targeting, setTargeting] = useState('all');
  const [objective, setObjective] = useState('qalysGained');
  const [horizon, setHorizon] = useState(timeHorizon);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const barRef = useRef<SVGSVGElement>(null);

  async function handleOptimize() {
    setLoading(true);
    setStep(0);
    setResult(null);
    const steps = ['Analyzing county data…', 'Scoring interventions…', 'Running greedy allocation…', 'Computing equity metrics…'];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 400));
      setStep(i + 1);
    }
    try {
      const res = await runOptimizer({
        budgetTotal: budget,
        objectiveMetric: objective,
        timeHorizonYears: horizon,
        targetingStrategy: targeting,
      });
      setResult(res);
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  // D3 bar chart
  useEffect(() => {
    if (!result || !barRef.current) return;
    const svg = d3.select(barRef.current);
    svg.selectAll('*').remove();

    const W = barRef.current.clientWidth || 500;
    const H = 260;
    const m = { top: 10, right: 20, bottom: 60, left: 60 };
    const w = W - m.left - m.right;
    const h = H - m.top - m.bottom;

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    const data = result.allocation;
    const xScale = d3.scaleBand()
      .domain(data.map(d => d.interventionName))
      .range([0, w]).padding(0.25);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.estimatedQalys) ?? 1])
      .nice().range([h, 0]);

    // Grid
    g.append('g').selectAll('line')
      .data(yScale.ticks(5)).enter()
      .append('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'rgba(255,255,255,0.04)');

    // Bars
    g.selectAll('rect').data(data).enter()
      .append('rect')
      .attr('x', d => xScale(d.interventionName) ?? 0)
      .attr('y', h)
      .attr('width', xScale.bandwidth())
      .attr('height', 0)
      .attr('rx', 4)
      .attr('fill', d => CAT_COLORS[d.category] ?? '#00D4AA')
      .attr('opacity', 0.85)
      .transition().duration(500).delay((_, i) => i * 60)
      .attr('y', d => yScale(d.estimatedQalys))
      .attr('height', d => h - yScale(d.estimatedQalys));

    // X axis labels (rotated)
    g.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale).tickSize(0))
      .selectAll('text')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 10)
      .attr('transform', 'rotate(-35)')
      .attr('text-anchor', 'end')
      .attr('dy', '0.5em').attr('dx', '-0.5em');

    g.selectAll('.domain').attr('stroke', 'rgba(255,255,255,0.08)');

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${Number(d).toLocaleString()}`))
      .selectAll('text').attr('fill', 'var(--text-dim)').attr('font-size', 10);
  }, [result]);

  const STEPS = ['Analyzing county data', 'Scoring interventions', 'Running allocation', 'Computing equity'];

  return (
    <div className="page-full" style={{ gridColumn: '2 / -1', gridRow: 2 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Budget Optimizer</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Automatically find the optimal intervention mix that maximizes QALYs for a given budget using a greedy ROI-based algorithm.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
        {/* Config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="section-label" style={{ marginBottom: 12 }}>Optimization Parameters</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="slider-row">
                <div className="slider-label">Total Budget <span>${(budget / 1_000_000).toFixed(1)}M</span></div>
                <input type="range" min={100000} max={100000000} step={100000}
                  value={budget} onChange={e => setBudget(Number(e.target.value))} />
              </div>

              <div>
                <div className="section-label">Objective Metric</div>
                <select value={objective} onChange={e => setObjective(e.target.value)} style={{ marginTop: 6 }}>
                  <option value="qalysGained">Maximize QALYs Gained</option>
                  <option value="costPerQaly">Minimize Cost/QALY</option>
                  <option value="equity">Maximize Equity Improvement</option>
                </select>
              </div>

              <div>
                <div className="section-label">Targeting Strategy</div>
                <select value={targeting} onChange={e => setTargeting(e.target.value)} style={{ marginTop: 6 }}>
                  <option value="all">All Populations</option>
                  <option value="low_income">Low Income Priority</option>
                  <option value="elderly">Elderly Priority</option>
                  <option value="minority">Minority Groups</option>
                  <option value="rural">Rural Areas</option>
                </select>
              </div>

              <div>
                <div className="section-label">Time Horizon</div>
                <select value={horizon} onChange={e => setHorizon(Number(e.target.value))} style={{ marginTop: 6 }}>
                  <option value={1}>1 Year</option>
                  <option value={3}>3 Years</option>
                  <option value={5}>5 Years</option>
                  <option value={10}>10 Years</option>
                </select>
              </div>
            </div>
          </div>

          <button className="btn btn-primary btn-full" onClick={handleOptimize} disabled={loading} id="optimizer-run-btn">
            {loading ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} /> Optimizing…</> : '⚡ Run Optimizer'}
          </button>

          {/* Progress steps */}
          {loading && (
            <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STEPS.map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: step > i ? 'var(--accent-primary)' : step === i ? 'rgba(0,212,170,0.3)' : 'var(--bg-base)',
                    border: `1.5px solid ${step > i ? 'var(--accent-primary)' : 'var(--border-medium)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: step > i ? '#060B18' : 'transparent', flex: '0 0 auto',
                    transition: 'all 0.3s',
                  }}>✓</div>
                  <span style={{ color: step > i ? 'var(--text-primary)' : step === i ? 'var(--accent-primary)' : 'var(--text-dim)' }}>
                    {s}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {result ? (
            <>
              {/* KPIs */}
              <div className="metrics-grid fade-in">
                <div className="metric-tile" style={{ borderColor: 'rgba(0,212,170,0.3)' }}>
                  <div className="metric-tile-value num-accent">{result.totalEstimatedQalys.toLocaleString()}</div>
                  <div className="metric-tile-label">Estimated QALYs</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-tile-value">${result.costPerQaly.toLocaleString()}</div>
                  <div className="metric-tile-label">Cost per QALY</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-tile-value">{result.allocation.length}</div>
                  <div className="metric-tile-label">Interventions Selected</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-tile-value">${(result.totalBudget / 1_000_000).toFixed(1)}M</div>
                  <div className="metric-tile-label">Total Budget</div>
                </div>
              </div>

              {/* Bar chart */}
              <div className="card fade-in">
                <div className="section-label" style={{ marginBottom: 12 }}>Estimated QALYs by Intervention</div>
                <svg ref={barRef} style={{ width: '100%', height: 260 }} />
              </div>

              {/* Allocation table */}
              <div className="card fade-in">
                <div className="section-label" style={{ marginBottom: 12 }}>Recommended Allocation</div>
                {result.allocation.map((item, i) => (
                  <div key={item.interventionId} style={{
                    display: 'grid', gridTemplateColumns: '28px 1fr 80px 80px 60px',
                    alignItems: 'center', gap: 12, padding: '8px 0',
                    borderBottom: i < result.allocation.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  }}>
                    <span style={{ fontSize: 20 }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{item.interventionName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{item.category}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-primary)' }}>{item.budgetPct}%</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>${(item.recommendedBudget / 1000).toFixed(0)}K</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{item.estimatedQalys.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>QALYs</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        background: item.roi > 2 ? 'rgba(0,212,170,0.15)' : 'rgba(255,184,77,0.15)',
                        color: item.roi > 2 ? 'var(--accent-primary)' : 'var(--accent-amber)',
                      }}>
                        {item.roi}x
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 16, color: 'var(--text-dim)', textAlign: 'center', minHeight: 300,
            }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>⚡</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Ready to Optimize
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  Configure your parameters and click <strong style={{ color: 'var(--text-primary)' }}>Run Optimizer</strong><br />
                  to find the best intervention mix for your budget.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
