import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useStore } from '../store/useStore';
import { runIndividual } from '../api/client';

type IncomeQuartile = 1 | 2 | 3 | 4;

interface Profile {
  age: number;
  sex: 'male' | 'female';
  bmi: number;
  smoker: boolean;
  diabetic: boolean;
  incomeQuartile: IncomeQuartile;
}

interface TrajectoryPoint {
  year: number;
  cardiovascularRisk: number;
  diabetesRisk: number;
  mentalHealthRisk: number;
  mortalityRisk: number;
  qualityOfLife: number;
}

interface IndividualResult {
  profile: Profile;
  baseline: Record<string, number>;
  trajectory: TrajectoryPoint[];
  summary: {
    qalysGained: number;
    cardiovascularRiskReduction: number;
    diabetesRiskReduction: number;
    qualityOfLifeGain: number;
    keyBenefits: Array<{ id: string; name: string; icon: string }>;
  };
}

const RISK_COLORS: Record<string, string> = {
  cardiovascularRisk: '#FF6B6B',
  diabetesRisk: '#FFB84D',
  mentalHealthRisk: '#9B6FFF',
  mortalityRisk: '#3D8EFF',
  qualityOfLife: '#00D4AA',
};

const RISK_LABELS: Record<string, string> = {
  cardiovascularRisk: 'Cardiovascular Risk',
  diabetesRisk: 'Diabetes Risk',
  mentalHealthRisk: 'Mental Health Risk',
  mortalityRisk: 'Mortality Risk',
  qualityOfLife: 'Quality of Life',
};

export default function IndividualPage() {
  const { interventions } = useStore();
  const [profile, setProfile] = useState<Profile>({
    age: 52,
    sex: 'female',
    bmi: 29,
    smoker: false,
    diabetic: false,
    incomeQuartile: 2,
  });
  const [selectedInterventions, setSelectedInterventions] = useState<string[]>([]);
  const [result, setResult] = useState<IndividualResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeRisk, setActiveRisk] = useState('cardiovascularRisk');
  const svgRef = useRef<SVGSVGElement>(null);

  async function handleSimulate() {
    setLoading(true);
    try {
      const res = await runIndividual({
        profile: profile as unknown as Record<string, unknown>,
        interventionIds: selectedInterventions,
        timeHorizonYears: 10,
      });
      setResult(res);
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  // D3 line chart
  useEffect(() => {
    if (!result || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const W = svgRef.current.clientWidth || 420;
    const H = 200;
    const m = { top: 20, right: 30, bottom: 30, left: 40 };
    const w = W - m.left - m.right;
    const h = H - m.top - m.bottom;

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    const data = result.trajectory;
    const years = data.map(d => d.year);
    const xScale = d3.scaleLinear().domain([0, 10]).range([0, w]);
    const yScale = d3.scaleLinear().domain([0, 100]).range([h, 0]);

    // Grid lines
    g.append('g').attr('class', 'grid')
      .selectAll('line').data(yScale.ticks(5)).enter()
      .append('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'rgba(255,255,255,0.04)').attr('stroke-width', 1);

    // Axes
    g.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => `Y${d}`))
      .selectAll('text').attr('fill', 'var(--text-dim)').attr('font-size', 10);

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .selectAll('text').attr('fill', 'var(--text-dim)').attr('font-size', 10);

    // Remove axis lines for clean look
    g.selectAll('.domain,.tick line').attr('stroke', 'rgba(255,255,255,0.06)');

    // Line for active risk
    const lineGen = d3.line<TrajectoryPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale((d as unknown as Record<string, number>)[activeRisk]))
      .curve(d3.curveCatmullRom);

    const color = RISK_COLORS[activeRisk];

    // Area fill
    const areaGen = d3.area<TrajectoryPoint>()
      .x(d => xScale(d.year))
      .y0(h)
      .y1(d => yScale((d as unknown as Record<string, number>)[activeRisk]))
      .curve(d3.curveCatmullRom);

    // Gradient
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'area-grad').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    grad.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 0.3);
    grad.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 0.01);

    g.append('path').datum(data).attr('fill', 'url(#area-grad)').attr('d', areaGen);
    g.append('path').datum(data).attr('fill', 'none').attr('stroke', color)
      .attr('stroke-width', 2.5).attr('d', lineGen);

    // Data points
    g.selectAll('circle').data(data).enter()
      .append('circle')
      .attr('cx', d => xScale(d.year))
      .attr('cy', d => yScale((d as unknown as Record<string, number>)[activeRisk]))
      .attr('r', 3).attr('fill', color).attr('stroke', 'var(--bg-elevated)').attr('stroke-width', 1.5);

  }, [result, activeRisk]);

  const INCOME_LABELS: Record<number, string> = { 1: 'Q1 (Lowest)', 2: 'Q2', 3: 'Q3', 4: 'Q4 (Highest)' };

  return (
    <div className="page-full" style={{ gridColumn: '2 / -1', gridRow: 2 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Individual Impact Simulator</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Model how selected interventions affect a representative person's 10-year health trajectory.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
        {/* Profile builder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="section-label" style={{ marginBottom: 12 }}>Individual Profile</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="slider-row">
                <div className="slider-label">Age <span>{profile.age} yrs</span></div>
                <input type="range" min={18} max={85} value={profile.age}
                  onChange={e => setProfile(p => ({ ...p, age: Number(e.target.value) }))} />
              </div>

              <div>
                <div className="section-label">Sex</div>
                <div className="radio-pills" style={{ marginTop: 6 }}>
                  {(['male', 'female'] as const).map(s => (
                    <button key={s} className={`radio-pill${profile.sex === s ? ' active' : ''}`}
                      onClick={() => setProfile(p => ({ ...p, sex: s }))}>
                      {s === 'male' ? '👨 Male' : '👩 Female'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-label">BMI <span>{profile.bmi.toFixed(1)}</span></div>
                <input type="range" min={16} max={50} step={0.5} value={profile.bmi}
                  onChange={e => setProfile(p => ({ ...p, bmi: Number(e.target.value) }))} />
              </div>

              <div>
                <div className="section-label">Income Quartile</div>
                <div className="radio-pills" style={{ marginTop: 6 }}>
                  {[1, 2, 3, 4].map(q => (
                    <button key={q} className={`radio-pill${profile.incomeQuartile === q ? ' active' : ''}`}
                      onClick={() => setProfile(p => ({ ...p, incomeQuartile: q as IncomeQuartile }))}>
                      Q{q}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                  {INCOME_LABELS[profile.incomeQuartile]}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <label className="custom-checkbox">
                  <input type="checkbox" checked={profile.smoker}
                    onChange={e => setProfile(p => ({ ...p, smoker: e.target.checked }))} />
                  <span className="box">{profile.smoker ? '✓' : ''}</span>
                  🚬 Smoker
                </label>
                <label className="custom-checkbox">
                  <input type="checkbox" checked={profile.diabetic}
                    onChange={e => setProfile(p => ({ ...p, diabetic: e.target.checked }))} />
                  <span className="box">{profile.diabetic ? '✓' : ''}</span>
                  💉 Diabetic
                </label>
              </div>
            </div>
          </div>

          {/* Interventions */}
          <div className="card">
            <div className="section-label" style={{ marginBottom: 8 }}>Apply Interventions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {interventions.map(i => (
                <label key={i.id} className="custom-checkbox" style={{ fontSize: 12 }}>
                  <input type="checkbox"
                    checked={selectedInterventions.includes(i.id)}
                    onChange={() => setSelectedInterventions(prev =>
                      prev.includes(i.id) ? prev.filter(x => x !== i.id) : [...prev, i.id]
                    )} />
                  <span className="box">{selectedInterventions.includes(i.id) ? '✓' : ''}</span>
                  {i.icon} {i.name}
                </label>
              ))}
            </div>
          </div>

          <button className="btn btn-primary btn-full" onClick={handleSimulate} disabled={loading}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} /> Simulating…</> : '▶ Simulate Individual'}
          </button>
        </div>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {result ? (
            <>
              {/* Baseline risk scores */}
              <div className="card fade-in">
                <div className="section-label" style={{ marginBottom: 12 }}>Baseline Risk Profile</div>
                <div className="metrics-grid">
                  {Object.entries(result.baseline).map(([key, val]) => (
                    <div key={key} className="metric-tile" style={{ borderColor: `${RISK_COLORS[key]}30` }}>
                      <div className="metric-tile-value" style={{ color: RISK_COLORS[key] }}>{val}</div>
                      <div className="metric-tile-label">{RISK_LABELS[key]}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key outcomes */}
              <div className="card fade-in">
                <div className="section-label" style={{ marginBottom: 12 }}>10-Year Impact Summary</div>
                <div className="metrics-grid">
                  <div className="metric-tile" style={{ borderColor: 'rgba(0,212,170,0.3)' }}>
                    <div className="metric-tile-value num-accent">{result.summary.qalysGained}</div>
                    <div className="metric-tile-label">QALYs Gained</div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-tile-value" style={{ color: 'var(--accent-coral)' }}>{result.summary.cardiovascularRiskReduction}pts</div>
                    <div className="metric-tile-label">Cardio Risk ↓</div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-tile-value" style={{ color: 'var(--accent-amber)' }}>{result.summary.diabetesRiskReduction}pts</div>
                    <div className="metric-tile-label">Diabetes Risk ↓</div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-tile-value" style={{ color: 'var(--accent-primary)' }}>+{result.summary.qualityOfLifeGain}pts</div>
                    <div className="metric-tile-label">Quality of Life ↑</div>
                  </div>
                </div>
              </div>

              {/* Trajectory chart */}
              <div className="card fade-in">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div className="section-label">10-Year Trajectory</div>
                  <div className="radio-pills">
                    {Object.keys(RISK_COLORS).map(k => (
                      <button key={k} className={`radio-pill${activeRisk === k ? ' active' : ''}`}
                        style={{ fontSize: 10, borderColor: RISK_COLORS[k] + '50' }}
                        onClick={() => setActiveRisk(k)}>
                        {RISK_LABELS[k].split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
                <svg ref={svgRef} style={{ width: '100%', height: 200 }} />
              </div>

              {/* Applied interventions */}
              {result.summary.keyBenefits.length > 0 && (
                <div className="card fade-in">
                  <div className="section-label" style={{ marginBottom: 8 }}>Applied Interventions</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {result.summary.keyBenefits.map(b => (
                      <span key={b.id} style={{
                        padding: '4px 10px', borderRadius: 99,
                        background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.2)',
                        fontSize: 12, color: 'var(--accent-primary)',
                      }}>
                        {b.icon} {b.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 16, color: 'var(--text-dim)', textAlign: 'center', minHeight: 300,
            }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>👤</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Configure a profile and click Simulate
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  See how public health programs affect a representative person's<br />
                  cardiovascular risk, diabetes risk, and quality of life over 10 years.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
