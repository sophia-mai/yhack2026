import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { generatePatientTimeline, getSimilarityScore } from '../api/client';
import type { TimelineEvent, SimilarityResult } from '../api/client';

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

// ── Available interventions for simulation ─────────────────────────────────
const INTERVENTIONS = [
  { id: 'smoking_cessation', name: 'Smoking Cessation Program', description: 'Structured counseling, NRT patches, and pharmacotherapy to achieve cessation within 3 months.' },
  { id: 'diabetes_management', name: 'Intensive Diabetes Management', description: 'CGM device, dietary counseling, HbA1c target <7%, medication optimization.' },
  { id: 'cardiac_rehab', name: 'Cardiac Rehabilitation', description: 'Supervised exercise program, dietary counseling, medication adherence for 12 weeks.' },
  { id: 'hypertension_control', name: 'Hypertension Control Protocol', description: 'Home BP monitoring, medication titration, low-sodium DASH diet, monthly check-ins.' },
  { id: 'nutrition_counseling', name: 'Medical Nutrition Therapy', description: 'Registered dietitian sessions, glycemic index reduction, 10% weight loss goal.' },
  { id: 'physical_activity', name: 'Structured Physical Activity', description: 'Physician-prescribed 150 min/week moderate exercise with fitness tracker.' },
];

// ── Visual config ──────────────────────────────────────────────────────────
const NODE_CONFIG = {
  past:        { fill: '#3D4A6E', border: '#5B6A90', glow: 'transparent', label: 'HISTORY' },
  present:     { fill: '#003D30', border: '#00D4AA', glow: 'rgba(0,212,170,0.4)', label: 'NOW' },
  predicted:   { fill: '#4A3000', border: '#FF9B3D', glow: 'rgba(255,155,61,0.3)', label: 'RISK' },
  risk:        { fill: '#4A3000', border: '#FF9B3D', glow: 'rgba(255,155,61,0.3)', label: 'RISK' },
  warning:     { fill: '#4A0000', border: '#FF5757', glow: 'rgba(255,87,87,0.4)', label: 'HIGH RISK' },
  intervention:{ fill: '#003040', border: '#60B8FF', glow: 'rgba(96,184,255,0.3)', label: 'INTERVENTION' },
};

const SEVERITY_SIZE: Record<string, number> = {
  low: 28, medium: 34, high: 40, critical: 46,
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
  const [activeInterventions, setActiveInterventions] = useState<Set<string>>(new Set());
  const [showInterventionPanel, setShowInterventionPanel] = useState(false);
  const [reloading, setReloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const counties = useStore(s => s.counties);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  const countyOptions = useMemo(() => {
    if (profile.location.length < 2) return [];
    const lower = profile.location.toLowerCase();
    return counties
      .filter(c => `${c.name}, ${c.stateName}`.toLowerCase().includes(lower))
      .slice(0, 10);
  }, [profile.location, counties]);

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
    setActiveInterventions(new Set()); setShowInterventionPanel(false);
    try {
      const bmi = calcBMI();
      // Match county
      const matchedCounty = counties.find(c => `${c.name}, ${c.stateName}` === profile.location);
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
    } catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  }

  async function handleSimulateInterventions() {
    if (!timeline || activeInterventions.size === 0) return;
    setReloading(true); setError(null);
    try {
      const bmi = calcBMI();
      const selected = INTERVENTIONS.filter(i => activeInterventions.has(i.id))
        .map(i => ({ name: i.name, description: i.description }));
      const res = await generatePatientTimeline({
        profile: {
          name: profile.name, age: parseInt(profile.age), sex: profile.sex,
          bmi: bmi || undefined, ethnicity: profile.ethnicity || undefined,
          smoker: profile.smoker, familyHistory: profile.familyHistory || undefined,
        },
        medicalHistory,
        interventions: selected,
      });
      setTimeline(res.timeline);
    } catch (err) { setError(String(err)); }
    finally { setReloading(false); }
  }

  function toggleIntervention(id: string) {
    setActiveInterventions(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
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
            <p className="patient-form-subtitle">Enter demographics & medical history to generate an AI health timeline</p>
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
            <div className="form-field">
              <label className="field-label">Ethnicity</label>
              <input className="field-input" placeholder="e.g. African American"
                value={profile.ethnicity} onChange={e => setProfile(p => ({ ...p, ethnicity: e.target.value }))} />
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
            <div className="timeline-empty-icon">⏱</div>
            <div className="timeline-empty-title">Your patient timeline will appear here</div>
            <div className="timeline-empty-sub">
              Fill in the profile and click "Generate Health Timeline" — Lava will analyze the records
              and map a personalized chronological timeline with risk similarity analysis.
            </div>
            <button className="btn-mock-large" onClick={() => { loadMock(); }}>
              ⚡ Load Demo Patient
            </button>
          </div>
        )}

        {loading && (
          <div className="timeline-loading">
            <div className="loading-orb" />
            <div className="loading-title">Analyzing patient data…</div>
            <div className="loading-sub">Lava is reading the medical records and building a personalized health timeline</div>
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
                  {activeInterventions.size > 0 && timeline.some(e => e.avoided) && (
                    <span className="avoided-badge">✓ Risk profile improved with {activeInterventions.size} intervention{activeInterventions.size > 1 ? 's' : ''}</span>
                  )}
                </p>
              </div>
              <button className="btn-simulate-interventions"
                onClick={() => setShowInterventionPanel(p => !p)}>
                {showInterventionPanel ? '✕ Close' : '⚕ Simulate Preventions'}
              </button>
            </div>

            {/* Similarity Score Card */}
            {similarity && (
              <div className="similarity-card">
                <div className="similarity-left">
                  <div className="similarity-score-ring">
                    <svg viewBox="0 0 80 80" style={{ position: 'absolute', inset: 0 }}>
                      <circle cx="40" cy="40" r="33" fill="none" stroke="rgba(255,155,61,0.15)" strokeWidth="6" />
                      <circle cx="40" cy="40" r="33" fill="none" stroke="#FF9B3D" strokeWidth="6"
                        strokeDasharray={`${2 * Math.PI * 33}`}
                        strokeDashoffset={`${2 * Math.PI * 33 * (1 - similarity.score / 100)}`}
                        strokeLinecap="round" transform="rotate(-90 40 40)" />
                    </svg>
                    <span className="similarity-score-num">{similarity.score}%</span>
                  </div>
                  <div className="similarity-label-block">
                    <div className="similarity-headline">Risk Profile Similarity</div>
                    <div className="similarity-subhead">
                      to confirmed diabetes cases in {similarity.county.name}, {similarity.county.state}
                    </div>
                  </div>
                </div>
                <div className="similarity-stats">
                  <div className="sim-stat">
                    <span className="sim-stat-val">{similarity.countyDiabetesRate}%</span>
                    <span className="sim-stat-label">County diabetes rate</span>
                  </div>
                  <div className="sim-stat">
                    <span className="sim-stat-val">{similarity.countyObesityRate}%</span>
                    <span className="sim-stat-label">County obesity rate</span>
                  </div>
                  <div className="sim-stat">
                    <span className="sim-stat-val">{(similarity.population / 1000).toFixed(0)}k</span>
                    <span className="sim-stat-label">Reference population</span>
                  </div>
                </div>
              </div>
            )}

            {/* Intervention Simulation Panel */}
            {showInterventionPanel && (
              <div className="intervention-sim-panel">
                <div className="intervention-strip-label">SELECT PREVENTIVE INTERVENTIONS TO SIMULATE</div>
                <div className="intervention-chips">
                  {INTERVENTIONS.map(intv => (
                    <button key={intv.id}
                      className={`intervention-chip${activeInterventions.has(intv.id) ? ' active' : ''}`}
                      onClick={() => toggleIntervention(intv.id)} title={intv.description}>
                      {activeInterventions.has(intv.id) ? '✓ ' : ''}{intv.name}
                    </button>
                  ))}
                </div>
                {activeInterventions.size > 0 && (
                  <button className="btn-reevaluate" onClick={handleSimulateInterventions} disabled={reloading}>
                    {reloading
                      ? <><div className="btn-spinner btn-spinner-sm" />Re-evaluating risk profile…</>
                      : `↺ Apply ${activeInterventions.size} intervention${activeInterventions.size > 1 ? 's' : ''} & re-evaluate`}
                  </button>
                )}
              </div>
            )}

            {/* 2D Horizontal Timeline Canvas */}
            <HorizontalTimeline events={timeline} />
          </>
        )}
      </div>
    </div>
  );
}

// ── 2D Horizontal Draggable Timeline ──────────────────────────────────────
const NODE_GAP = 220;
const CANVAS_PADDING = 120;
const LINE_Y = 320;


function HorizontalTimeline({ events }: { events: TimelineEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, offset: 0 });
  const [hovered, setHovered] = useState<{ event: TimelineEvent; nodeX: number } | null>(null);

  const canvasWidth = Math.max(900, CANVAS_PADDING * 2 + (events.length - 1) * NODE_GAP);

  // Center the "present" node on initial load
  useEffect(() => {
    if (!containerRef.current) return;
    const presentIdx = events.findIndex(e => e.type === 'present');
    const idx = presentIdx >= 0 ? presentIdx : Math.floor(events.length / 2);
    const nodeX = CANVAS_PADDING + idx * NODE_GAP;
    const containerW = containerRef.current.clientWidth;
    setOffsetX(containerW / 2 - nodeX);
  }, [events]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, offset: offsetX });
    setHovered(null);
  }, [offsetX]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const delta = e.clientX - dragStart.x;
    setOffsetX(dragStart.offset + delta);
  }, [isDragging, dragStart]);

  const onMouseUp = useCallback(() => setIsDragging(false), []);

  // Clamp offset to keep timeline within reasonable bounds
  const clampedOffset = Math.min(
    CANVAS_PADDING,
    Math.max(-(canvasWidth - (containerRef.current?.clientWidth ?? 900) + CANVAS_PADDING), offsetX)
  );

  return (
    <div className="timeline-canvas-wrapper"
      ref={containerRef}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}>

      {/* Dot grid background */}
      <svg className="timeline-grid timeline-grid-animated" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="dot-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="rgba(255,255,255,0.08)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
      </svg>

      {/* Era labels — fixed, not scrolling */}
      <div className="era-labels">
        {['◀  HISTORY', 'NOW', 'RISK PROFILE  ▶'].map((label, i) => (
          <div key={label} className={`era-label ${i === 1 ? 'era-label-now' : i === 2 ? 'era-label-future' : ''}`}>{label}</div>
        ))}
      </div>

      {/* Scrollable canvas */}
      <div className="timeline-inner-canvas"
        style={{ transform: `translateX(${clampedOffset}px)`, width: canvasWidth }}>

        {/* Gradient glowing line */}
        <svg style={{ position: 'absolute', top: LINE_Y - 4, left: 0, width: canvasWidth, height: 10, pointerEvents: 'none', filter: 'drop-shadow(0 0 10px rgba(0, 212, 170, 0.4))' }}>
          <defs>
            <linearGradient id="line-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={canvasWidth} y2="0">
              <stop offset="0%" stopColor="#3D4A6E" stopOpacity="0.4" />
              <stop offset="30%" stopColor="#5B6A90" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#00D4AA" stopOpacity="1" />
              <stop offset="75%" stopColor="#FF9B3D" stopOpacity="1" />
              <stop offset="100%" stopColor="#FF5757" stopOpacity="0.7" />
            </linearGradient>
          </defs>
          <line x1="0" y1="4.5" x2={canvasWidth} y2="4.5" stroke="url(#line-grad)" strokeWidth="3" />
        </svg>

        {/* Nodes */}
        {events.map((ev, i) => {
          const x = CANVAS_PADDING + i * NODE_GAP;
          const isHovered = hovered?.event === ev;
          const isWarning = ev.severity === 'critical' || ev.type === 'warning';
          const isFuture = ev.type === 'risk' || ev.type === 'predicted' || ev.type === 'warning';
          const cfg = NODE_CONFIG[ev.type as keyof typeof NODE_CONFIG] ?? NODE_CONFIG.past;
          const size = SEVERITY_SIZE[ev.severity] ?? 32;

          return (
            <div key={`${ev.age}-${i}`}
              className="timeline-node-wrap"
              style={{ left: x - size / 2, top: LINE_Y - size / 2 }}
              onMouseEnter={() => !isDragging && setHovered({ event: ev, nodeX: x })}
              onMouseLeave={() => setHovered(null)}>

              {/* Avoided ribbon */}
              {ev.avoided && (
                <div className="node-avoided-ribbon">AVOIDED</div>
              )}

              {/* Triangle for critical/warning, circle otherwise */}
              {isWarning && isFuture ? (
                <div className="node-triangle"
                  style={{
                    width: size + 14, height: size + 14,
                    filter: isHovered ? `drop-shadow(0 0 24px ${cfg.glow}) drop-shadow(0 0 8px ${cfg.border})` : `drop-shadow(0 0 8px ${cfg.glow})`,
                    opacity: ev.avoided ? 0.3 : 1,
                  }}>
                  <svg viewBox="0 0 52 52" style={{ width: '100%', height: '100%', backdropFilter: 'blur(8px)' }}>
                    <polygon points="26,4 50,48 2,48"
                      fill={ev.avoided ? 'rgba(0,212,170,0.1)' : `url(#triangle-grad-${i})`}
                      stroke={ev.avoided ? '#00D4AA' : cfg.border}
                      strokeWidth="2.5" />
                    <defs>
                      <linearGradient id={`triangle-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={cfg.fill} />
                        <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
                      </linearGradient>
                    </defs>
                    <text x="26" y="38" textAnchor="middle" fill={ev.avoided ? '#00D4AA' : cfg.border}
                      fontSize="20" fontWeight="bold">!</text>
                  </svg>
                </div>
              ) : (
                <div className={`node-circle${isHovered ? ' node-circle-hovered' : ''}${ev.type === 'present' ? ' node-present' : ''}`}
                  style={{
                    width: size, height: size,
                    background: ev.avoided ? 'rgba(0,212,170,0.1)' : `url(#circle-grad-${i})`,
                    backdropFilter: 'blur(8px)',
                    border: `2px solid ${ev.avoided ? '#00D4AA' : cfg.border}`,
                    boxShadow: isHovered ? `0 0 24px ${ev.avoided ? 'rgba(0,212,170,0.6)' : cfg.glow}, inset 0 2px 4px rgba(255,255,255,0.2)` : ev.type === 'present' ? `0 0 18px ${cfg.glow}` : `0 4px 8px rgba(0,0,0,0.5)`,
                    opacity: ev.avoided ? 0.5 : 1,
                  }}>
                    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                      <defs>
                        <linearGradient id={`circle-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={cfg.fill} stopOpacity="0.9" />
                          <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
                        </linearGradient>
                      </defs>
                    </svg>
                  {ev.type === 'present' && <div className="node-pulse-ring node-pulse-ring-1" style={{ borderColor: cfg.border }} />}
                  {ev.type === 'present' && <div className="node-pulse-ring node-pulse-ring-2" style={{ borderColor: cfg.border }} />}
                </div>
              )}

              {/* Age label below */}
              <div className="node-age-label" style={{ color: cfg.border }}>
                {ev.avoided ? '~~' : ''}Age {ev.age}
              </div>
            </div>
          );
        })}

        {/* Hover tooltip — renders inside scrolling container so position is correct */}
        {hovered && (
          <TimelineTooltip event={hovered.event} nodeX={hovered.nodeX} />
        )}
      </div>

      {/* Scroll hint */}
      <div className="timeline-scroll-hint">← drag to explore →</div>
    </div>
  );
}

// ── Tooltip Card ───────────────────────────────────────────────────────────
function TimelineTooltip({ event: ev, nodeX }: { event: TimelineEvent; nodeX: number }) {
  const cfg = NODE_CONFIG[ev.type as keyof typeof NODE_CONFIG] ?? NODE_CONFIG.past;
  const isFuture = ev.type === 'risk' || ev.type === 'predicted' || ev.type === 'warning';

  return (
    <div className="timeline-tooltip"
      style={{
        left: nodeX - 160,
        top: LINE_Y - 250,
        borderColor: ev.avoided ? '#00D4AA' : cfg.border,
        boxShadow: `0 24px 48px rgba(0,0,0,0.8), 0 0 32px ${cfg.glow}`,
      }}>
      <div className="tooltip-glass-surface" />
      <div className="tooltip-content-wrapper">
        <div className="tooltip-header">
        <span className="tooltip-type-badge"
          style={{ color: ev.avoided ? '#00D4AA' : cfg.border, borderColor: ev.avoided ? 'rgba(0,212,170,0.3)' : cfg.border + '50' }}>
          {ev.avoided ? 'AVOIDED' : cfg.label}
        </span>
        <span className="tooltip-age" style={{ color: cfg.border }}>Age {ev.age} · {ev.year}</span>
      </div>
      <div className="tooltip-title" style={{ color: ev.avoided ? 'var(--text-secondary)' : 'var(--text-primary)',
        textDecoration: ev.avoided ? 'line-through' : 'none' }}>
        {ev.title}
      </div>
      <div className="tooltip-desc">{ev.description}</div>
      {isFuture && !ev.avoided && (
        <div className="tooltip-risk-note">
          📊 Based on statistical comparison with similar patient profiles in this demographic
        </div>
      )}
      </div>
      <div className="tooltip-tail" style={{ borderTopColor: ev.avoided ? '#00D4AA' : cfg.border }} />
    </div>
  );
}
