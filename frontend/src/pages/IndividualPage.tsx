import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { generatePatientTimeline, getSimilarityScore } from '../api/client';
import type { TimelineEvent } from '../api/client';
import { runDemographicEngine } from '../utils/demographicEngine';
import type { DemographicInsight, SimilarityResult } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────
interface PatientProfile {
  name: string; age: string; sex: 'male' | 'female' | 'other';
  heightFt: string; heightIn: string; weightLbs: string;
  ethnicity: string; smoker: boolean; familyHistory: string; location: string;
}

// ── Mock demo data ─────────────────────────────────────────────────────────
const MOCK_PATIENT: PatientProfile = {
  name: 'Marcus Williams', age: '52', sex: 'male',
  heightFt: '5', heightIn: '11', weightLbs: '218',
  ethnicity: 'African American', smoker: true,
  familyHistory: 'Father had Type 2 diabetes, died of heart attack at 61. Mother has hypertension.',
  location: 'Bronx, New York',
};
const MOCK_HISTORY = `PATIENT MEDICAL RECORD — Marcus Williams, DOB 1973-04-12
- 1995 (Age 22): Began smoking cigarettes, 1 ppd habit.
- 2008 (Age 35): Fasting glucose 108 mg/dL (pre-diabetic). Declined lifestyle counseling.
- 2011 (Age 38): Diagnosed Type 2 Diabetes. HbA1c 7.8%. Started Metformin 500mg BID.
- 2014 (Age 41): BP 148/94 mmHg. Stage 1 Hypertension. Started Lisinopril 10mg.
- 2021 (Age 48): ER visit chest tightness. Ruled out STEMI, diagnosed unstable angina.
- 2023 (Age 50): Peripheral neuropathy symptoms. Early diabetic retinopathy bilateral.
- 2025 (Age 52): Current. HbA1c 8.6%. BP 152/96 on medication. Active smoker. Sedentary.`;

const ETHNICITY_OPTIONS = [
  { label: "Hispanic / Latino", value: "Hispanic (All Races)" },
  { label: "American Indian / Alaska Native", value: "Non-Hispanic American Indian / Alaska Native" },
  { label: "Asian", value: "Non-Hispanic Asian" },
  { label: "Black / African American", value: "Non-Hispanic Black" },
  { label: "Native Hawaiian / Pacific Islander", value: "Non-Hispanic Native Hawaiian and Other Pacific Islander" },
  { label: "Two or More Races", value: "Non-Hispanic Two or More Races" },
  { label: "White", value: "Non-Hispanic White" },
];

// ── Visual config ──────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  past: { fill: '#1E283B', border: '#7C8BAB', glow: 'rgba(124,139,171,0.18)', label: 'HISTORY' },
  present: { fill: '#073A39', border: '#2FE0C0', glow: 'rgba(47,224,192,0.26)', label: 'NOW' },
  intervention: { fill: '#073A39', border: '#2FE0C0', glow: 'rgba(47,224,192,0.26)', label: 'INTERVENTION' },
  predicted: { fill: '#43311F', border: '#E3A45C', glow: 'rgba(227,164,92,0.22)', label: 'FUTURE' },
  risk: { fill: '#43311F', border: '#E3A45C', glow: 'rgba(227,164,92,0.22)', label: 'FUTURE' },
  warning: { fill: '#43311F', border: '#E3A45C', glow: 'rgba(227,164,92,0.22)', label: 'FUTURE' },
} as const;

const SEVERITY_SIZE: Record<string, number> = {
  low: 32, medium: 32, high: 32, critical: 32,
};

// ── Main Component ─────────────────────────────────────────────────────────
export default function IndividualPage() {
  const [profile, setProfile] = useState<PatientProfile>({
    name: '', age: '', sex: 'male', heightFt: '', heightIn: '',
    weightLbs: '', ethnicity: '', smoker: false, familyHistory: '', location: '',
  });
  const [medicalHistory, setMedicalHistory] = useState('');
  const [timeline, setTimeline] = useState<TimelineEvent[] | null>(null);
  const [similarity, setSimilarity] = useState<SimilarityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<DemographicInsight | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const counties = useStore(s => s.counties);
  const setPatientContext = useStore(s => s.setPatientContext);
  const setActiveTab = useStore(s => s.setActiveTab);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  const [showEthAutocomplete, setShowEthAutocomplete] = useState(false);

  const ethDisplayLabel = ETHNICITY_OPTIONS.find(e => e.value === profile.ethnicity)?.label || profile.ethnicity || "";

  const filteredEthnicities = ETHNICITY_OPTIONS.filter(e =>
    e.label.toLowerCase().includes(ethDisplayLabel.toLowerCase())
  );

  const countyOptions = useMemo(() => {
    if (profile.location.length < 2) return [];
    const lower = profile.location.toLowerCase();
    return counties
      .filter(c => `${c.name}, ${c.stateName}`.toLowerCase().includes(lower))
      .slice(0, 10);
  }, [profile.location, counties]);

  const matchedCounty = useMemo(
    () => counties.find(c => `${c.name}, ${c.stateName}` === profile.location) ?? null,
    [counties, profile.location]
  );

  function calcBMI(): string {
    const h = (parseFloat(profile.heightFt) * 12) + parseFloat(profile.heightIn);
    const lbs = parseFloat(profile.weightLbs);
    if (!h || !lbs) return '';
    return ((lbs / (h * h)) * 703).toFixed(1);
  }

  function loadMock() {
    setProfile(MOCK_PATIENT);
    setMedicalHistory(MOCK_HISTORY);
  }

  async function handleGenerate() {
    if (!profile.age || !profile.name) { setError('Please enter a patient name and age.'); return; }
    setLoading(true); setError(null); setTimeline(null); setSimilarity(null);
    setInsight(null); setShowInsights(false);
    setPatientContext(null);
    try {
      const bmi = calcBMI();
      const stateFallback = matchedCounty ? matchedCounty.stateName : profile.location.split(',')[1]?.trim() || profile.location;

      const [timelineRes, simRes] = await Promise.all([
        generatePatientTimeline({
          profile: {
            name: profile.name, age: parseInt(profile.age), sex: profile.sex,
            height: profile.heightFt ? `${profile.heightFt}'${profile.heightIn}"` : undefined,
            weight: profile.weightLbs ? `${profile.weightLbs} lbs` : undefined,
            bmi: bmi || undefined, ethnicity: profile.ethnicity || undefined,
            smoker: profile.smoker, familyHistory: profile.familyHistory || undefined,
          },
          medicalHistory,
        }),
        profile.age ? getSimilarityScore({
          age: parseInt(profile.age), sex: profile.sex,
          ethnicity: profile.ethnicity, bmi,
          smoker: profile.smoker, state: stateFallback, countyFips: matchedCounty?.fips,
        }).catch(() => null) : Promise.resolve(null),
      ]);
      setTimeline(timelineRes.timeline);
      setSimilarity(simRes);
      // Community health equity engine (client-side, synchronous)
      const bmiNum = bmi ? parseFloat(bmi) : null;
      const countyForInsight = matchedCounty ?? (simRes ? counties.find(c => c.fips === simRes.county.fips) ?? null : null);
      if (countyForInsight) {
        setInsight(runDemographicEngine({
          matchedCounty: countyForInsight,
          allCounties: counties,
          ethnicity: profile.ethnicity,
          bmi: bmiNum,
          smoker: profile.smoker,
          familyHistory: profile.familyHistory,
        }));
        setShowInsights(true);
      } else {
        setInsight(null);
      }

      setPatientContext({
        patientName: profile.name,
        patientAge: profile.age ? parseInt(profile.age) : null,
        patientEthnicity: profile.ethnicity,
        bmi: bmi ? parseFloat(bmi) : null,
        smoker: profile.smoker,
        locationLabel: profile.location,
        matchedCountyFips: simRes?.county.fips ?? matchedCounty?.fips ?? null,
        matchedCountyName: simRes?.county.name ?? matchedCounty?.name ?? null,
        matchedCountyState: simRes?.county.state ?? matchedCounty?.state ?? null,
        similarity: simRes,
      });
    } catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  }

  const bmi = calcBMI();
  const bmiNum = parseFloat(bmi);

  return (
    <div className="individual-page">
      {/* ── LEFT: Patient Form ──────────────────────────────── */}
      <div className="patient-form-panel">
        <div className="patient-form-header">
          <div>
            <h2 className="patient-form-title">Patient Profile</h2>
            <p className="patient-form-subtitle">Build a patient context report — combine medical records with county and national health data</p>
          </div>
          <button className="btn-mock" onClick={loadMock}>⚡ Demo</button>
        </div>

        <div className="patient-form-scroll">
          <div className="form-section">
          <div className="form-label">BASIC INFORMATION</div>
          <div className="form-grid-2">
            <div className="form-field">
              <label className="field-label">Full Name</label>
              <input className="field-input" placeholder="e.g. John Smith" value={profile.name}
                onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="form-field">
              <label className="field-label">Age</label>
              <input className="field-input" type="number" min={1} max={120} placeholder="52"
                value={profile.age} onChange={e => setProfile(p => ({ ...p, age: e.target.value }))} />
            </div>
          </div>

          <div className="form-field">
            <label className="field-label">Biological Sex</label>
            <div className="sex-pills">
              {(['male', 'female', 'other'] as const).map(s => (
                <button key={s} className={`sex-pill${profile.sex === s ? ' active' : ''}`}
                  onClick={() => setProfile(p => ({ ...p, sex: s }))}>
                  {s === 'male' ? '♂ Male' : s === 'female' ? '♀ Female' : '⊕ Other'}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grid-3">
            <div className="form-field">
              <label className="field-label">Height (ft)</label>
              <input className="field-input" type="number" min={3} max={8} placeholder="5"
                value={profile.heightFt} onChange={e => setProfile(p => ({ ...p, heightFt: e.target.value }))} />
            </div>
            <div className="form-field">
              <label className="field-label">Height (in)</label>
              <input className="field-input" type="number" min={0} max={11} placeholder="11"
                value={profile.heightIn} onChange={e => setProfile(p => ({ ...p, heightIn: e.target.value }))} />
            </div>
            <div className="form-field">
              <label className="field-label">Weight (lbs)</label>
              <input className="field-input" type="number" min={50} max={600} placeholder="180"
                value={profile.weightLbs} onChange={e => setProfile(p => ({ ...p, weightLbs: e.target.value }))} />
            </div>
          </div>

          {bmi && (
            <div className="bmi-badge">
              BMI <strong>{bmi}</strong>
              <span className={`bmi-label ${bmiNum >= 30 ? 'bmi-obese' : bmiNum >= 25 ? 'bmi-overweight' : 'bmi-normal'}`}>
                {bmiNum >= 30 ? 'Obese' : bmiNum >= 25 ? 'Overweight' : 'Normal'}
              </span>
            </div>
          )}

          <div className="form-grid-2">
            <div className="form-field" style={{ position: 'relative' }}>
              <label className="field-label">Ethnicity</label>
              <input
                className="field-input"
                placeholder="e.g. Black / African American"
                value={ethDisplayLabel}
                onFocus={() => setShowEthAutocomplete(true)}
                onBlur={() => setTimeout(() => setShowEthAutocomplete(false), 200)}
                onChange={e => {
                  const typed = e.target.value;
                  const match = ETHNICITY_OPTIONS.find(o => o.label.toLowerCase() === typed.toLowerCase());
                  setProfile(p => ({ ...p, ethnicity: match ? match.value : typed }));
                  setShowEthAutocomplete(true);
                }}
              />
              {showEthAutocomplete && filteredEthnicities.length > 0 && (
                <div className="autocomplete-dropdown">
                  {filteredEthnicities.map(option => (
                    <div
                      key={option.value}
                      className="autocomplete-item"
                      onClick={() => {
                        setProfile(p => ({ ...p, ethnicity: option.value }));
                        setShowEthAutocomplete(false);
                      }}
                    >
                      {option.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="form-field" style={{ position: 'relative' }}>
              <label className="field-label">Location (County & State)</label>
              <input className="field-input" placeholder="e.g. Bronx, New York"
                value={profile.location} 
                onFocus={() => setShowAutocomplete(true)}
                onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
                onChange={e => {
                  setProfile(p => ({ ...p, location: e.target.value }));
                  setShowAutocomplete(true);
                }} />
              {showAutocomplete && countyOptions.length > 0 && (
                <div className="autocomplete-dropdown">
                  {countyOptions.map(c => (
                    <div key={c.fips} className="autocomplete-item"
                         onClick={() => {
                           setProfile(p => ({ ...p, location: `${c.name}, ${c.stateName}` }));
                           setShowAutocomplete(false);
                         }}>
                      {c.name}, {c.stateName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="smoker-toggle">
            <input type="checkbox" checked={profile.smoker}
              onChange={e => setProfile(p => ({ ...p, smoker: e.target.checked }))} />
            <span className={`smoker-box${profile.smoker ? ' active' : ''}`}>{profile.smoker ? '✓' : ''}</span>
            🚬 Current smoker
          </label>

          <div className="form-field">
            <label className="field-label">Family History</label>
            <textarea className="field-input field-textarea" rows={2}
              placeholder="e.g. Father had Type 2 diabetes, Mother has hypertension..."
              value={profile.familyHistory}
              onChange={e => setProfile(p => ({ ...p, familyHistory: e.target.value }))} />
          </div>
        </div>

        <div className="form-section">
          <div className="form-label">MEDICAL RECORDS</div>
          <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
            <div className="upload-icon">📋</div>
            <div className="upload-text">Upload Medical Records (PDF)</div>
            <div className="upload-sub">or click to select — text will be extracted</div>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt" style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.name.endsWith('.txt')) {
                  const reader = new FileReader();
                  reader.onload = ev => setMedicalHistory(ev.target?.result as string ?? '');
                  reader.readAsText(file);
                } else {
                  setMedicalHistory(`[PDF: ${file.name}]\nMedical records would be extracted here.`);
                }
              }} />
          </div>
          <div className="form-field" style={{ marginTop: 8 }}>
            <label className="field-label">Or paste medical history</label>
            <textarea className="field-input field-textarea field-textarea-tall"
              placeholder="Paste clinical notes, diagnoses, medications, lab results..."
              value={medicalHistory} onChange={e => setMedicalHistory(e.target.value)} />
          </div>
        </div>
        </div>

        {error && <div className="timeline-error">{error}</div>}

        <div className="patient-form-bottom">
          <button className="btn-generate" onClick={handleGenerate} disabled={loading}>
            {loading ? <><div className="btn-spinner" />Analyzing with Lava…</> : <>✦ Generate Health Timeline</>}
          </button>
        </div>
      </div>

      {/* ── RIGHT: Timeline Panel ───────────────────────────── */}
      <div className="timeline-panel">
        {!timeline && !loading && (
          <div className="timeline-empty">
            <div className="timeline-empty-icon">🩺</div>
            <div className="timeline-empty-title">Enter a patient to build their health context</div>
            <div className="timeline-empty-sub">
              Prophis reads a patient's medical history and maps it into a chronological health
              narrative — then grounds it in real county and national data to surface how the patient's
              trajectory relates to the population patterns around them.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: 'center', flexWrap: 'wrap', fontSize: 11, color: 'var(--text-dim)' }}>
              <span style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 10px' }}>📋 Chronological timeline</span>
              <span style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 10px' }}>📍 County health context</span>
              <span style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 10px' }}>⚕ Intervention explorer</span>
            </div>
            <button className="btn-mock-large" onClick={() => { loadMock(); }}>
              ⚡ Load Demo Patient
            </button>
          </div>
        )}

        {loading && (
          <div className="timeline-loading">
            <div className="loading-orb" />
            <div className="loading-title">Building patient health context…</div>
            <div className="loading-sub">Lava is reading the records and mapping the health narrative against county and national data</div>
          </div>
        )}

        {timeline && (
          <>
            {/* Header */}
            <div className="timeline-header">
              <div>
                <h2 className="timeline-patient-name">{profile.name}'s Health Timeline</h2>
                <p className="timeline-patient-meta">
                  {profile.age}yo · {profile.sex} · {profile.ethnicity || 'Patient'}
                  {profile.location && <> · {profile.location}</>}
                </p>
              </div>
              <button
                className="btn-simulate-interventions"
                onClick={() => setActiveTab('map')}
              >
                ↗ View Population Context
              </button>
            </div>

            {/* Diabetes context signal */}
            {similarity && (
              <div className="diabetes-context-card">
                <div className="diabetes-context-summary">
                  <div className="diabetes-context-ring">
                    <svg viewBox="0 0 96 96" style={{ position: 'absolute', inset: 0 }}>
                      <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(255,155,61,0.12)" strokeWidth="8" />
                      <circle
                        cx="48" cy="48" r="38" fill="none" stroke="#FF9B3D" strokeWidth="8"
                        strokeDasharray={`${2 * Math.PI * 38}`}
                        strokeDashoffset={`${2 * Math.PI * 38 * (1 - similarity.score / 100)}`}
                        strokeLinecap="round" transform="rotate(-90 48 48)"
                      />
                    </svg>
                    <span className="diabetes-context-score">{similarity.score}%</span>
                  </div>
                  <div className="diabetes-context-copy">
                    <div className="diabetes-context-kicker">Diabetes Cohort Signal</div>
                    <h3 className="diabetes-context-title">{similarity.title}</h3>
                    <p className="diabetes-context-subhead">
                      {similarity.score >= 70
                        ? `Strong pattern overlap with the diabetes population in ${similarity.county.name}, ${similarity.county.state}.`
                        : similarity.score >= 40
                        ? `Moderate pattern overlap with the diabetes population in ${similarity.county.name}, ${similarity.county.state}.`
                        : `Limited pattern overlap with the diabetes population in ${similarity.county.name}, ${similarity.county.state}.`}
                    </p>
                  </div>
                </div>
                <div className="diabetes-context-stats">
                  <div className="diabetes-context-stat">
                    <span className="diabetes-context-stat-value">{similarity.countyDiabetesRate}%</span>
                    <span className="diabetes-context-stat-label">County diabetes rate</span>
                  </div>
                  <div className="diabetes-context-stat">
                    <span className="diabetes-context-stat-value">{similarity.countyObesityRate}%</span>
                    <span className="diabetes-context-stat-label">Obesity rate</span>
                  </div>
                  <div className="diabetes-context-stat">
                    <span className="diabetes-context-stat-value">{similarity.countyPhysicalInactivityRate}%</span>
                    <span className="diabetes-context-stat-label">Physical inactivity</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Community Health Equity Score ── */}
            {insight && (
              <div style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                <button
                  type="button"
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', padding: '10px 24px',
                    background: 'rgba(61,142,255,0.04)', border: 'none',
                    cursor: 'pointer', fontFamily: '"Outfit", sans-serif',
                  }}
                  onClick={() => setShowInsights(v => !v)}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    County Health Context
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--accent-blue)' }}>
                    {showInsights ? '▲ Collapse' : `▼ Expand · Grade ${insight.grade}`}
                  </span>
                </button>
                {showInsights && (
                  <div style={{ padding: '0 24px 16px' }}>
                    <HealthEquityScoreCard insight={insight} />
                  </div>
                )}
              </div>
            )}

            <div className="timeline-stage-shell">
              {/* 2D Horizontal Timeline Canvas */}
              <HorizontalTimeline events={timeline} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── 2D Horizontal Draggable Timeline ──────────────────────────────────────
function getEventDescriptor(event: TimelineEvent) {
  if (event.avoided) return 'Prevented outcome';
  if (event.type === 'present') return 'Current patient state';
  if (event.type === 'intervention') return 'Intervention milestone';
  if (event.type === 'warning') return 'Escalation warning';
  if (event.type === 'predicted' || event.type === 'risk') return 'Projected future event';
  return 'Recorded history';
}

function getEventVisual(event: TimelineEvent) {
  return TYPE_CONFIG[event.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.past;
}

// ── Health Equity Score Components ───────────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  A: '#00D4AA', B: '#60B8FF', C: '#FFB84D', D: '#FF9B3D', F: '#FF6B6B',
};
const DIM_ICONS: Record<string, string> = {
  'Health Outcomes': '❤️',
  'Economic Equity': '💰',
  'Healthcare Access': '🏥',
};

function scoreColor(pct: number): string {
  if (pct >= 75) return '#00D4AA';
  if (pct >= 50) return '#60B8FF';
  if (pct >= 30) return '#FF9B3D';
  return '#FF6B6B';
}

function DimensionTile({ dim }: { dim: DemographicInsight['dimensions'][number] }) {
  const sc = scoreColor(dim.score);
  return (
    <div className="card-glass" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
          {DIM_ICONS[dim.name]} {dim.name}
        </span>
        <span style={{
          fontSize: 13, fontWeight: 800, color: sc,
          background: `${sc}18`, borderRadius: 6, padding: '2px 8px',
        }}>{dim.score}</span>
      </div>
      {/* Score bar */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2, background: sc,
          width: `${dim.score}%`,
          transition: 'width 0.9s cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </div>
      {/* Summary */}
      <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.55 }}>{dim.summary}</div>
      {/* Metric rows */}
      {dim.metrics.map(m => {
        const mc = scoreColor(m.nationalPct);
        const valStr = m.countyValue != null
          ? (m.unit === '' ? `$${Math.round(m.countyValue / 1000)}k` : `${m.countyValue.toFixed(1)}${m.unit}`)
          : 'N/A';
        const peerStr = m.peerAvg != null
          ? (m.unit === '' ? `$${Math.round(m.peerAvg / 1000)}k` : `${m.peerAvg.toFixed(1)}${m.unit}`)
          : '—';
        return (
          <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                {m.label}
                {m.dataSource === 'race' && (
                  <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--accent-blue)', fontStyle: 'italic' }}>
                    ({m.raceLabel})
                  </span>
                )}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{valStr}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: mc,
                  width: `${m.nationalPct}%`,
                  transition: 'width 0.9s cubic-bezier(0.16, 1, 0.3, 1)',
                }} />
              </div>
              <span style={{ fontSize: 9, color: mc, fontWeight: 700, width: 28, textAlign: 'right' }}>
                {m.nationalPct}th
              </span>
            </div>
            {m.peerAvg !== null && (
              <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                Peer avg: <span style={{ color: 'var(--text-secondary)' }}>{peerStr}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HealthEquityScoreCard({ insight: ins }: { insight: DemographicInsight }) {
  const gc = GRADE_COLORS[ins.grade] ?? '#60B8FF';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Headline card */}
      <div className="card-glass" style={{ padding: '16px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Grade ring */}
        <div style={{
          width: 72, height: 72, flexShrink: 0,
          borderRadius: '50%',
          border: `3px solid ${gc}`,
          background: `${gc}12`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 18px ${gc}30`,
        }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: gc, lineHeight: 1, fontFamily: '"Outfit", sans-serif' }}>{ins.grade}</span>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 1 }}>{ins.compositeScore}/100</span>
        </div>
        {/* Text block */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Health Equity Score
            </span>
            {ins.raceLabel !== 'all residents' && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: 'var(--accent-blue)',
                background: 'rgba(96,184,255,0.12)',
                border: '1px solid rgba(96,184,255,0.3)',
                borderRadius: 99, padding: '2px 7px',
              }}>
                {ins.raceLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6 }}>{ins.headline}</div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
            Benchmarked against {ins.peerCount} demographically similar counties · Scoring uses race-specific data where available
          </div>
        </div>
      </div>
      {/* 3 Dimension tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {ins.dimensions.map(dim => <DimensionTile key={dim.name} dim={dim} />)}
      </div>
    </div>
  );
}

function HorizontalTimeline({ events }: { events: TimelineEvent[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });
  const dragEndedAtRef = useRef(0);
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const presentIndex = useMemo(() => {
    const idx = events.findIndex(e => e.type === 'present');
    return idx >= 0 ? idx : Math.floor(events.length / 2);
  }, [events]);
  const focusedIndex = hoveredIndex ?? activeIndex;
  const focusedEvent = events[focusedIndex] ?? events[presentIndex];
  const focusedCfg = getEventVisual(focusedEvent);
  const focusedIsFuture = focusedEvent?.type === 'risk' || focusedEvent?.type === 'predicted' || focusedEvent?.type === 'warning';
  const firstAge = events[0]?.age;
  const lastAge = events[events.length - 1]?.age;
  const compact = wrapperSize.height > 0 && (wrapperSize.height < 620 || wrapperSize.width < 1280);
  const layout = compact
    ? {
        gap: 310,
        padding: 220,
        lineY: 304,
        previewWidth: 186,
        previewHeight: 84,
        previewTop: 122,
        detailWidth: 292,
        detailTop: 22,
        tailPadding: 140,
        minCanvasHeight: 472,
        nodeScale: 0.88,
      }
    : {
        gap: 380,
        padding: 320,
        lineY: 360,
        previewWidth: 214,
        previewHeight: 94,
        previewTop: 152,
        detailWidth: 364,
        detailTop: 28,
        tailPadding: 160,
        minCanvasHeight: 680,
        nodeScale: 1,
      };
  const lastNodeX = layout.padding + Math.max(events.length - 1, 0) * layout.gap;
  const canvasWidth = Math.max(compact ? 1180 : 1400, lastNodeX + layout.detailWidth + layout.tailPadding);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const node = wrapperRef.current;
    const updateSize = () => {
      setWrapperSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const centerEvent = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounded = Math.max(0, Math.min(events.length - 1, index));
    const targetX = layout.padding + bounded * layout.gap;
    const safeRightInset = layout.detailWidth + 48;
    const visibleCenter = Math.max(140, (viewport.clientWidth - safeRightInset) / 2);
    const maxLeft = Math.max(0, canvasWidth - viewport.clientWidth);
    const nextLeft = Math.max(0, Math.min(maxLeft, targetX - visibleCenter));
    viewport.scrollTo({ left: nextLeft, behavior });
    setActiveIndex(bounded);
  }, [canvasWidth, events.length, layout.detailWidth, layout.gap, layout.padding]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => centerEvent(presentIndex, 'auto'));
    return () => window.cancelAnimationFrame(frame);
  }, [centerEvent, presentIndex, events]);

  useEffect(() => {
    const onResize = () => centerEvent(activeIndex, 'auto');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeIndex, centerEvent]);

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const safeRightInset = layout.detailWidth + 48;
    const visibleCenter = Math.max(140, (viewport.clientWidth - safeRightInset) / 2);
    const centerX = viewport.scrollLeft + visibleCenter;
    const rawIndex = Math.round((centerX - layout.padding) / layout.gap);
    const nextIndex = Math.max(0, Math.min(events.length - 1, rawIndex));
    setActiveIndex(nextIndex);
  }, [events.length, layout.detailWidth, layout.gap, layout.padding]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const viewport = viewportRef.current;
    if (!wrapper || !viewport) return;

    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('.timeline-focus-desc.scrollable')) {
        return;
      }
      const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (dominantDelta === 0) return;
      event.preventDefault();
      event.stopPropagation();
      viewport.scrollBy({ left: dominantDelta * 1.05, behavior: 'auto' });
    };

    wrapper.addEventListener('wheel', onWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', onWheel);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      scrollLeft: viewport.scrollLeft,
      moved: false,
    };
    setHoveredIndex(null);
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const delta = e.clientX - dragRef.current.startX;
    if (Math.abs(delta) > 4) dragRef.current.moved = true;
    viewport.scrollLeft = dragRef.current.scrollLeft - delta;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.moved) dragEndedAtRef.current = Date.now();
    dragRef.current.active = false;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleEventFocus = useCallback((index: number) => {
    if (Date.now() - dragEndedAtRef.current < 120) return;
    centerEvent(index);
  }, [centerEvent]);

  const detailShouldScroll = focusedEvent.description.length > (compact ? 90 : 120);

  return (
    <div ref={wrapperRef} className={`timeline-canvas-wrapper${compact ? ' compact' : ''}`}>
      <div className="timeline-stage-hud">
        <div className="timeline-stage-copy">
          <div className="timeline-stage-kicker">Health Narrative</div>
          <div className="timeline-stage-title">
            {events.length} key clinical moments
            {typeof firstAge === 'number' && typeof lastAge === 'number' ? ` · age ${firstAge} – ${lastAge}` : ''}
          </div>
          <div className="timeline-stage-hint">Drag or scroll to move through the record. Click any event to read details.</div>
        </div>
      </div>

      <div
        className="timeline-focus-card"
        style={{
          width: layout.detailWidth,
          top: layout.detailTop,
          borderColor: focusedEvent?.avoided ? 'rgba(0,212,170,0.34)' : `${focusedCfg.border}55`,
          boxShadow: `0 20px 54px rgba(0,0,0,0.34), 0 0 24px ${focusedCfg.glow}`,
          background: focusedEvent?.avoided
            ? 'linear-gradient(180deg, rgba(5, 22, 24, 0.94), rgba(4, 14, 22, 0.82))'
            : `linear-gradient(180deg, rgba(7, 12, 24, 0.95), ${focusedCfg.fill}30)`,
        }}
      >
        <div className="timeline-focus-row">
          <span
            className="timeline-focus-badge"
            style={{
              color: focusedEvent?.avoided ? '#86f4dd' : focusedCfg.border,
              borderColor: focusedEvent?.avoided ? 'rgba(0,212,170,0.26)' : `${focusedCfg.border}33`,
            }}
          >
            {getEventDescriptor(focusedEvent)}
          </span>
          <span className="timeline-focus-year">{focusedEvent?.year}</span>
        </div>
        <div className="timeline-focus-title">{focusedEvent?.title}</div>
        <div className={`timeline-focus-desc${detailShouldScroll ? ' scrollable' : ''}`}>{focusedEvent?.description}</div>
        <div className="timeline-focus-footer">
          <span className="timeline-focus-age">Age {focusedEvent?.age}</span>
          <span className={`timeline-card-severity timeline-card-severity-${focusedEvent?.severity}`}>{focusedEvent?.severity}</span>
        </div>
        {focusedIsFuture && !focusedEvent?.avoided && (
          <div className="timeline-focus-note">Lava projection — not a clinical prediction.</div>
        )}
      </div>

      <div className="timeline-nav timeline-nav-left">
        <button type="button" className="timeline-nav-btn" onClick={() => centerEvent(activeIndex - 1)} aria-label="Scroll timeline left">
          ←
        </button>
      </div>
      <div className="timeline-nav timeline-nav-right">
        <button type="button" className="timeline-nav-btn" onClick={() => centerEvent(activeIndex + 1)} aria-label="Scroll timeline right">
          →
        </button>
      </div>

      <div
        ref={viewportRef}
        className={`timeline-viewport${isDragging ? ' dragging' : ''}`}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); centerEvent(activeIndex + 1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); centerEvent(activeIndex - 1); }
        }}
        tabIndex={0}
        aria-label="Patient health timeline"
      >
        <div className="timeline-inner-canvas" style={{ width: canvasWidth, minHeight: layout.minCanvasHeight }}>
          <div className="timeline-baseline" style={{ top: layout.lineY, width: Math.max(0, lastNodeX - 72 + 28) }} />
          <div className="timeline-baseline-glow" style={{ top: layout.lineY - 6, width: Math.max(0, lastNodeX - 72 + 28) }} />

          {events.map((ev, i) => {
            const x = layout.padding + i * layout.gap;
            const cfg = getEventVisual(ev);
            const size = Math.round((SEVERITY_SIZE[ev.severity] ?? 32) * layout.nodeScale);
            const isFuture = ev.type === 'risk' || ev.type === 'predicted' || ev.type === 'warning';
            const isWarning = ev.severity === 'critical' || ev.type === 'warning';
            const isActive = focusedIndex === i;
            const previewTop = layout.previewTop + (compact ? [0, 10, 18][i % 3] : [0, 14, 24][i % 3]);
            const connectorTop = previewTop + layout.previewHeight - 8;
            const connectorHeight = Math.max(18, layout.lineY - connectorTop - Math.floor(size / 2) - 8);

            return (
              <div key={`${ev.age}-${i}`}>
                <button
                  type="button"
                  className={`timeline-preview-card${isActive ? ' active' : ''}${ev.avoided ? ' avoided' : ''}${ev.type === 'present' ? ' present' : ''}`}
                  style={{
                    left: x - layout.previewWidth / 2,
                    top: previewTop,
                    width: layout.previewWidth,
                    height: layout.previewHeight,
                    borderColor: ev.avoided ? 'rgba(0,212,170,0.36)' : `${cfg.border}55`,
                    boxShadow: isActive
                      ? `0 18px 42px rgba(0,0,0,0.42), 0 0 20px ${cfg.glow}`
                      : '0 12px 28px rgba(0,0,0,0.24)',
                    background: ev.avoided
                      ? 'linear-gradient(180deg, rgba(5, 22, 24, 0.96), rgba(4, 14, 22, 0.78))'
                      : `linear-gradient(180deg, rgba(5, 12, 24, 0.96), ${cfg.fill}33)`,
                  }}
                  onMouseEnter={() => !isDragging && setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(i)}
                  onBlur={() => setHoveredIndex(null)}
                  onClick={() => handleEventFocus(i)}
                >
                  <div className="timeline-preview-row">
                    <span
                      className="timeline-preview-badge"
                      style={{
                        color: ev.avoided ? '#86f4dd' : cfg.border,
                        borderColor: ev.avoided ? 'rgba(0,212,170,0.28)' : `${cfg.border}33`,
                      }}
                    >
                      {ev.avoided ? 'Avoided' : cfg.label}
                    </span>
                    <span className="timeline-preview-year">{ev.year}</span>
                  </div>
                  <div className="timeline-preview-title">{ev.title}</div>
                </button>

                <div
                  className={`timeline-preview-connector${isActive ? ' active' : ''}`}
                  style={{
                    left: x,
                    top: connectorTop,
                    height: connectorHeight,
                    background: `linear-gradient(180deg, ${cfg.border}55, rgba(255,255,255,0.02))`,
                  }}
                />

                <div
                  className={`timeline-node-wrap${isActive ? ' active' : ''}`}
                  style={{ left: x - size / 2, top: layout.lineY - size / 2 }}
                >
                  {ev.avoided && <div className="node-avoided-ribbon">Avoided</div>}
                  <div
                    className="timeline-node-halo"
                    style={{ background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 72%)` }}
                  />
                  {isWarning && isFuture ? (
                    <div
                      className="node-triangle"
                      style={{
                        width: size + 4,
                        height: size + 4,
                        filter: isActive ? `drop-shadow(0 0 18px ${cfg.glow})` : `drop-shadow(0 0 8px ${cfg.glow})`,
                        opacity: ev.avoided ? 0.4 : 1,
                      }}
                    >
                      <svg viewBox="0 0 52 52" style={{ width: '100%', height: '100%' }}>
                        <polygon
                          points="26,4 50,48 2,48"
                          fill={ev.avoided ? 'rgba(0,212,170,0.12)' : cfg.fill}
                          stroke={ev.avoided ? '#00D4AA' : cfg.border}
                          strokeWidth="2.5"
                        />
                        <text x="26" y="38" textAnchor="middle" fill={ev.avoided ? '#00D4AA' : cfg.border} fontSize="20" fontWeight="bold">!</text>
                      </svg>
                    </div>
                  ) : (
                    <div
                      className={`node-circle${isActive ? ' node-circle-hovered' : ''}${ev.type === 'present' ? ' node-present' : ''}`}
                      style={{
                        width: size,
                        height: size,
                        background: ev.avoided ? 'rgba(0,212,170,0.12)' : `linear-gradient(180deg, ${cfg.fill}, rgba(6,11,24,0.9))`,
                        border: `2px solid ${ev.avoided ? '#00D4AA' : cfg.border}`,
                        boxShadow: isActive
                          ? `0 0 22px ${ev.avoided ? 'rgba(0,212,170,0.5)' : cfg.glow}, inset 0 1px 0 rgba(255,255,255,0.18)`
                          : `0 10px 20px rgba(0,0,0,0.4), 0 0 12px ${cfg.glow}`,
                        opacity: ev.avoided ? 0.58 : 1,
                      }}
                    >
                      {ev.type === 'present' && <div className="node-pulse-ring node-pulse-ring-1" style={{ borderColor: cfg.border }} />}
                      {ev.type === 'present' && <div className="node-pulse-ring node-pulse-ring-2" style={{ borderColor: cfg.border }} />}
                    </div>
                  )}
                  <div className="node-age-label" style={{ color: ev.avoided ? '#86f4dd' : cfg.border }}>
                    Age {ev.age}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
