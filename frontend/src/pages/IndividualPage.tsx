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

            <div className="timeline-stage-shell">
              {showInterventionPanel && (
                <>
                  <button
                    type="button"
                    className="timeline-overlay-backdrop"
                    aria-label="Close intervention simulation panel"
                    onClick={() => setShowInterventionPanel(false)}
                  />
                  <div className="intervention-sim-panel">
                    <div className="intervention-panel-topline">
                      <span className="intervention-strip-label">Prevention Studio</span>
                      <span className="intervention-panel-count">{activeInterventions.size} selected</span>
                    </div>
                    <div className="intervention-panel-title">Model alternate futures without shifting the timeline canvas.</div>
                    <div className="intervention-panel-subtitle">
                      Choose interventions, then re-run the patient projection against the current record and county profile.
                    </div>
                    <div className="intervention-chips">
                      {INTERVENTIONS.map(intv => (
                        <button
                          key={intv.id}
                          className={`intervention-chip${activeInterventions.has(intv.id) ? ' active' : ''}`}
                          onClick={() => toggleIntervention(intv.id)}
                          title={intv.description}
                        >
                          <span className="intervention-chip-check">{activeInterventions.has(intv.id) ? '✓' : '+'}</span>
                          {intv.name}
                        </button>
                      ))}
                    </div>
                    <div className="intervention-panel-footer">
                      <div className="intervention-panel-note">
                        {activeInterventions.size > 0
                          ? 'Selected interventions will mark prevented outcomes directly on the future path.'
                          : 'Pick at least one intervention to compare the projected risk horizon.'}
                      </div>
                      <button className="btn-reevaluate" onClick={handleSimulateInterventions} disabled={reloading || activeInterventions.size === 0}>
                        {reloading
                          ? <><div className="btn-spinner btn-spinner-sm" />Re-evaluating risk profile…</>
                          : `↺ Apply ${activeInterventions.size} intervention${activeInterventions.size > 1 ? 's' : ''}`}
                      </button>
                    </div>
                  </div>
                </>
              )}

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
  const focusedCfg = NODE_CONFIG[focusedEvent?.type as keyof typeof NODE_CONFIG] ?? NODE_CONFIG.past;
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
        minCanvasHeight: 680,
        nodeScale: 1,
      };
  const canvasWidth = Math.max(compact ? 1180 : 1400, layout.padding * 2 + Math.max(events.length - 1, 0) * layout.gap);

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
    const maxLeft = Math.max(0, canvasWidth - viewport.clientWidth);
    const nextLeft = Math.max(0, Math.min(maxLeft, targetX - viewport.clientWidth / 2));
    viewport.scrollTo({ left: nextLeft, behavior });
    setActiveIndex(bounded);
  }, [canvasWidth, events.length, layout.gap, layout.padding]);

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
    const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
    const rawIndex = Math.round((centerX - layout.padding) / layout.gap);
    const nextIndex = Math.max(0, Math.min(events.length - 1, rawIndex));
    setActiveIndex(nextIndex);
  }, [events.length, layout.gap, layout.padding]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    viewport.scrollBy({ left: e.deltaY * 1.05, behavior: 'auto' });
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

  return (
    <div ref={wrapperRef} className={`timeline-canvas-wrapper${compact ? ' compact' : ''}`}>
      <div className="timeline-stage-hud">
        <div className="timeline-stage-copy">
          <div className="timeline-stage-kicker">Patient trajectory</div>
          <div className="timeline-stage-title">
            {events.length} key moments
            {typeof firstAge === 'number' && typeof lastAge === 'number' ? ` from age ${firstAge} to ${lastAge}` : ''}
          </div>
          <div className="timeline-stage-hint">Drag, scroll, or use arrow keys to move through the story.</div>
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
        <div className="timeline-focus-desc">{focusedEvent?.description}</div>
        <div className="timeline-focus-footer">
          <span className="timeline-focus-age">Age {focusedEvent?.age}</span>
          <span className={`timeline-card-severity timeline-card-severity-${focusedEvent?.severity}`}>{focusedEvent?.severity}</span>
        </div>
        {focusedIsFuture && !focusedEvent?.avoided && (
          <div className="timeline-focus-note">Projected from the patient profile, prior history, and similarity model.</div>
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
        onWheel={handleWheel}
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
          <div className="timeline-ambient timeline-ambient-left" />
          <div className="timeline-ambient timeline-ambient-center" />
          <div className="timeline-ambient timeline-ambient-right" />

          <div className="timeline-baseline" />
          <div className="timeline-baseline-glow" />

          {events.map((ev, i) => {
            const x = layout.padding + i * layout.gap;
            const cfg = NODE_CONFIG[ev.type as keyof typeof NODE_CONFIG] ?? NODE_CONFIG.past;
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
                        width: size + 18,
                        height: size + 18,
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
