import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import type { Intervention } from '../../types';

const CATEGORIES = ['All', 'Preventive Care', 'Behavioral', 'Environmental', 'Access', 'Education'];

const CAT_BADGE: Record<string, string> = {
  'Preventive Care': 'badge-preventive',
  'Behavioral': 'badge-behavioral',
  'Environmental': 'badge-environmental',
  'Access': 'badge-access',
  'Education': 'badge-education',
};

export default function InterventionPanel() {
  const {
    interventions, activeInterventions, addIntervention, removeIntervention,
    updateIntervention, budgetTotal, setBudgetTotal, targeting, setTargeting,
    timeHorizon, setTimeHorizon, objective, setObjective,
    clearInterventions,
  } = useStore();

  const [filterCat, setFilterCat] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => interventions.filter(i =>
    (filterCat === 'All' || i.category === filterCat) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()))
  ), [interventions, filterCat, search]);

  const activeIds = new Set(activeInterventions.map(i => i.id));
  const totalAllocated = activeInterventions.reduce((s, i) => s + i.budget, 0);
  const remaining = budgetTotal - totalAllocated;

  return (
    <>
      <div className="panel-header">
        <div className="panel-title">Intervention Builder</div>
        <div className="panel-subtitle">{activeInterventions.length} selected · ${budgetTotal.toLocaleString()} budget</div>
      </div>

      {/* Everything below the header goes into the scrolling body to avoid squishing */}
      <div className="panel-body" style={{ padding: 0 }}>
        {/* Objective */}
        <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
          <div className="section-label">Health Objective</div>
          <textarea
            className="objective-input"
            rows={2}
            placeholder="e.g. Reduce obesity by 5% in rural counties over 5 years…"
            value={objective}
            onChange={e => setObjective(e.target.value)}
          />
        </div>

        {/* Budget & Settings */}
        <div style={{ padding: '10px 12px', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="slider-row">
            <div className="slider-label">
              Total Budget <span>${(budgetTotal / 1_000_000).toFixed(1)}M</span>
            </div>
            <input
              type="range" min={100000} max={50000000} step={100000}
              value={budgetTotal}
              onChange={e => setBudgetTotal(Number(e.target.value))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
            <div>
              <div className="section-label">Targeting</div>
              <select value={targeting} onChange={e => setTargeting(e.target.value)}>
                <option value="all">All Populations</option>
                <option value="low_income">Low Income</option>
                <option value="elderly">Elderly (65+)</option>
                <option value="minority">Minority Groups</option>
                <option value="rural">Rural Areas</option>
                <option value="uninsured">Uninsured</option>
              </select>
            </div>
            <div>
              <div className="section-label">Time Horizon</div>
              <select value={timeHorizon} onChange={e => setTimeHorizon(Number(e.target.value))}>
                <option value={1}>1 Year</option>
                <option value={3}>3 Years</option>
                <option value={5}>5 Years</option>
                <option value={10}>10 Years</option>
              </select>
            </div>
          </div>
        </div>

        {/* Active interventions */}
        {activeInterventions.length > 0 && (
          <div style={{ padding: '10px 12px', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="section-label">Active ({activeInterventions.length})</div>
              <button className="btn btn-danger btn-sm" onClick={clearInterventions}>Clear All</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeInterventions.map(inp => {
                const def = interventions.find(i => i.id === inp.id);
                if (!def) return null;
                return (
                  <div key={inp.id} className="active-intervention">
                    <div className="active-int-header">
                      <span style={{ fontSize: 16 }}>{def.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{def.name}</span>
                      <button className="remove-btn" onClick={() => removeIntervention(inp.id)}>✕</button>
                    </div>
                    <div className="slider-row">
                      <div className="slider-label">
                        Budget <span>${(inp.budget / 1000).toFixed(0)}K</span>
                      </div>
                      <input
                        type="range" min={10000} max={budgetTotal} step={10000}
                        value={inp.budget}
                        onChange={e => updateIntervention(inp.id, { budget: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Budget summary */}
            <div style={{
              marginTop: 8, padding: '6px 8px', borderRadius: 'var(--radius-sm)',
              background: remaining < 0 ? 'rgba(255,107,107,0.1)' : 'rgba(0,212,170,0.06)',
              border: `1px solid ${remaining < 0 ? 'rgba(255,107,107,0.2)' : 'rgba(0,212,170,0.15)'}`,
              fontSize: 12, display: 'flex', justifyContent: 'space-between'
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>Allocated</span>
              <span style={{ color: remaining < 0 ? 'var(--accent-coral)' : 'var(--accent-primary)', fontWeight: 600 }}>
                ${totalAllocated.toLocaleString()} / ${budgetTotal.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Search & Filter */}
        <div style={{ padding: '8px 12px', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Search interventions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <div className="tab-group">
            {['All', 'Preventive Care', 'Behavioral', 'Env.', 'Access', 'Edu.'].map((cat, i) => (
              <button
                key={cat}
                className={`tab-btn${filterCat === CATEGORIES[i] ? ' active' : ''}`}
                onClick={() => setFilterCat(CATEGORIES[i])}
                style={{ fontSize: 10, padding: '4px 6px' }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Intervention list */}
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(int => (
            <InterventionCard
              key={int.id}
              intervention={int}
              active={activeIds.has(int.id)}
              onClick={() => activeIds.has(int.id) ? removeIntervention(int.id) : addIntervention(int.id)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function InterventionCard({
  intervention: i,
  active,
  onClick,
}: { intervention: Intervention; active: boolean; onClick: () => void }) {
  const topEffect = Object.entries(i.effects).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

  return (
    <div
      className={`intervention-card${active ? ' active' : ''}`}
      onClick={onClick}
      id={`intervention-${i.id}`}
    >
      <div className="intervention-icon">{i.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span className="intervention-name">{i.name}</span>
          {active && <span style={{ color: 'var(--accent-primary)', fontSize: 12 }}>✓</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span className={`intervention-badge ${CAT_BADGE[i.category] ?? 'badge-preventive'}`}>
            {i.category}
          </span>
          <span className={`intervention-badge ${i.evidenceLevel === 'strong' ? 'badge-preventive' : 'badge-access'}`}>
            {i.evidenceLevel} evidence
          </span>
        </div>
        {topEffect && (
          <div className="intervention-meta" style={{ marginTop: 4 }}>
            ${i.costPerCapita}/capita · {topEffect[0]}: {topEffect[1] > 0 ? '+' : ''}{topEffect[1]}pp
          </div>
        )}
      </div>
    </div>
  );
}
