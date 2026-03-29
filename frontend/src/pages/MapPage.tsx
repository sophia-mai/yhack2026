import { useEffect, useMemo } from 'react';
import AIPanel from '../components/AI/AIPanel';
import { useStore } from '../store/useStore';
import type { CountyRecord, HealthMetric, MapMode } from '../types';
import { HEALTH_METRIC_LABELS, HEALTH_METRIC_UNITS } from '../types';

const METRIC_OPTIONS: HealthMetric[] = [
  'diabetes',
  'obesity',
  'smoking',
  'physicalInactivity',
  'mentalHealth',
  'mortalityRate',
];

const MAP_MODE_OPTIONS: Array<{ id: MapMode; label: string; description: string }> = [
  { id: 'baseline', label: 'Health burden', description: 'Read the selected health metric directly by county.' },
  { id: 'equity', label: 'Socioeconomic strain', description: 'View the selected county alongside poverty burden.' },
  { id: 'vulnerability', label: 'SVI lens', description: 'Shift attention to community vulnerability and resilience.' },
];

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computePercentile(values: number[], value: number) {
  if (values.length === 0) return null;
  const lower = values.filter(item => item < value).length;
  return Math.round((lower / values.length) * 100);
}

function formatMetricValue(metric: HealthMetric, value: number | null) {
  if (value === null || Number.isNaN(value)) return '—';
  const unit = HEALTH_METRIC_UNITS[metric] ?? '%';
  if (unit === '/100k') return `${Math.round(value).toLocaleString()} ${unit}`;
  return `${value.toFixed(1)}${unit}`;
}

function getComparableCounties(target: CountyRecord, counties: CountyRecord[]) {
  const distance = (county: CountyRecord) => {
    const demo = county.demographics;
    const ref = target.demographics;
    return (
      Math.abs(demo.pctPoverty - ref.pctPoverty) * 1.9 +
      Math.abs(demo.pctUninsured - ref.pctUninsured) * 1.5 +
      Math.abs(demo.pctElderly - ref.pctElderly) * 1.1 +
      Math.abs(demo.pctBlack - ref.pctBlack) +
      Math.abs(demo.pctHispanic - ref.pctHispanic) +
      Math.abs(demo.pctWhite - ref.pctWhite) * 0.8
    );
  };

  return counties
    .filter(county => county.fips !== target.fips)
    .map(county => ({ county, distance: distance(county) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4)
    .map(entry => entry.county);
}

export default function MapPage() {
  const {
    counties,
    selectedMetric,
    setSelectedMetric,
    mapMode,
    setMapMode,
    selectedCounty,
    setSelectedCounty,
    patientContext,
  } = useStore();

  const matchedCounty = useMemo(
    () => patientContext?.matchedCountyFips
      ? counties.find(county => county.fips === patientContext.matchedCountyFips) ?? null
      : null,
    [counties, patientContext]
  );

  useEffect(() => {
    if (mapMode === 'impact') {
      setMapMode('baseline');
    }
  }, [mapMode, setMapMode]);

  useEffect(() => {
    if (!selectedCounty && matchedCounty) {
      setSelectedCounty(matchedCounty);
    }
  }, [matchedCounty, selectedCounty, setSelectedCounty]);

  const activeCounty = selectedCounty ?? matchedCounty ?? null;

  const metricValues = useMemo(
    () => counties
      .map(county => (county.health as Record<string, number>)[selectedMetric])
      .filter(value => Number.isFinite(value)),
    [counties, selectedMetric]
  );

  const activeMetricValue = activeCounty
    ? (activeCounty.health as Record<string, number>)[selectedMetric] ?? null
    : null;
  const stateAverage = activeCounty
    ? average(
      counties
        .filter(county => county.state === activeCounty.state)
        .map(county => (county.health as Record<string, number>)[selectedMetric])
        .filter(value => Number.isFinite(value))
    )
    : null;
  const nationalAverage = average(metricValues);
  const percentile = activeMetricValue !== null ? computePercentile(metricValues, activeMetricValue) : null;
  const matchedMetricValue = matchedCounty
    ? (matchedCounty.health as Record<string, number>)[selectedMetric] ?? null
    : null;
  const comparableCounties = activeCounty ? getComparableCounties(activeCounty, counties) : [];

  return (
    <div className="map-page-overlays">
      <div className="left-panel population-left-panel">
        <div className="panel-header">
          <div className="panel-title">Population Context</div>
          <div className="panel-subtitle">
            Use county and national patterns to contextualize the patient story, not replace it.
          </div>
        </div>

        <div className="panel-body">
          <div className="population-panel-card">
            <div className="section-label">Patient Anchor</div>
            {patientContext ? (
              <>
                <div className="population-anchor-title">
                  {patientContext.patientName}
                  <span>{patientContext.patientAge ? ` · ${patientContext.patientAge}yo` : ''}</span>
                </div>
                <div className="population-anchor-copy">
                  {patientContext.locationLabel || 'No county selected yet'}
                </div>
                <div className="population-chip-row">
                  {patientContext.bmi !== null && (
                    <span className="population-chip">BMI {patientContext.bmi.toFixed(1)}</span>
                  )}
                  {patientContext.patientEthnicity && (
                    <span className="population-chip">{patientContext.patientEthnicity}</span>
                  )}
                  <span className="population-chip">{patientContext.smoker ? 'Current smoker' : 'Non-smoker'}</span>
                </div>
                {matchedCounty && (
                  <button
                    className="population-action-btn"
                    onClick={() => setSelectedCounty(matchedCounty)}
                  >
                    Focus matched county
                  </button>
                )}
              </>
            ) : (
              <div className="population-empty-copy">
                Generate a patient timeline first to pin the map to a matched county and carry context across pages.
              </div>
            )}
          </div>

          <div className="population-panel-card">
            <div className="section-label">Metric Focus</div>
            <div className="population-selector-grid">
              {METRIC_OPTIONS.map(metric => (
                <button
                  key={metric}
                  className={`population-selector-btn${selectedMetric === metric ? ' active' : ''}`}
                  onClick={() => setSelectedMetric(metric)}
                >
                  <span>{HEALTH_METRIC_LABELS[metric]}</span>
                  <small>{HEALTH_METRIC_UNITS[metric]}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="population-panel-card">
            <div className="section-label">Map Lens</div>
            <div className="population-mode-list">
              {MAP_MODE_OPTIONS.map(mode => (
                <button
                  key={mode.id}
                  className={`population-mode-btn${mapMode === mode.id ? ' active' : ''}`}
                  onClick={() => setMapMode(mode.id)}
                >
                  <span>{mode.label}</span>
                  <small>{mode.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="population-panel-card">
            <div className="section-label">How to Read This</div>
            <div className="population-explainer-copy">
              Start from the patient’s matched county, then compare it with the selected county, state average, and national position.
              This page is best used to explain why a case looks the way it does and which broader community signals should shape follow-up decisions.
            </div>
          </div>
        </div>
      </div>

      <div className="right-panel population-right-panel">
        <div className="population-right-scroll">
          <div className="panel-header">
            <div className="panel-title">
              {activeCounty ? `${activeCounty.name}, ${activeCounty.state}` : 'County Detail'}
            </div>
            <div className="panel-subtitle">
              {activeCounty
                ? 'Selected county compared against patient anchor, state, and national context.'
                : 'Select a county to inspect the broader population patterns behind the patient story.'}
            </div>
          </div>

          <div className="panel-body">
            {activeCounty ? (
              <>
                <div className="population-panel-card">
                  <div className="section-label">County Snapshot</div>
                  <div className="population-metric-grid">
                    <div className="metric-tile">
                      <div className="metric-tile-value">{formatMetricValue(selectedMetric, activeMetricValue)}</div>
                      <div className="metric-tile-label">{HEALTH_METRIC_LABELS[selectedMetric]}</div>
                    </div>
                    <div className="metric-tile">
                      <div className="metric-tile-value">{formatMetricValue(selectedMetric, stateAverage)}</div>
                      <div className="metric-tile-label">{activeCounty.state} average</div>
                    </div>
                    <div className="metric-tile">
                      <div className="metric-tile-value">{formatMetricValue(selectedMetric, nationalAverage)}</div>
                      <div className="metric-tile-label">National average</div>
                    </div>
                    <div className="metric-tile">
                      <div className="metric-tile-value">{percentile !== null ? `${percentile}th` : '—'}</div>
                      <div className="metric-tile-label">National percentile</div>
                    </div>
                  </div>
                </div>

                <div className="population-panel-card">
                  <div className="section-label">Patient-to-Population Bridge</div>
                  <div className="population-bridge-list">
                    <div className="population-bridge-row">
                      <span>Matched county</span>
                      <strong>
                        {matchedCounty ? `${matchedCounty.name}, ${matchedCounty.state}` : 'Not linked yet'}
                      </strong>
                    </div>
                    <div className="population-bridge-row">
                      <span>Selected metric gap vs matched county</span>
                      <strong>
                        {activeMetricValue !== null && matchedMetricValue !== null
                          ? `${(activeMetricValue - matchedMetricValue >= 0 ? '+' : '')}${(activeMetricValue - matchedMetricValue).toFixed(1)}${HEALTH_METRIC_UNITS[selectedMetric]}`
                          : '—'}
                      </strong>
                    </div>
                    <div className="population-bridge-row">
                      <span>Poverty rate</span>
                      <strong>{activeCounty.demographics.pctPoverty.toFixed(1)}%</strong>
                    </div>
                    <div className="population-bridge-row">
                      <span>Social vulnerability index</span>
                      <strong>{activeCounty.svi.overall.toFixed(3)}</strong>
                    </div>
                  </div>
                </div>

                <div className="population-panel-card">
                  <div className="section-label">Comparable Counties</div>
                  <div className="population-chip-row">
                    {comparableCounties.map(county => (
                      <button
                        key={county.fips}
                        className="population-chip population-chip-button"
                        onClick={() => setSelectedCounty(county)}
                      >
                        {county.name}, {county.state}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="population-panel-card">
                <div className="population-empty-copy">
                  Click a county on the map to inspect local burden, compare it to the patient’s matched county, and generate an AI interpretation.
                </div>
              </div>
            )}
          </div>

          <div className="population-ai-shell">
            <AIPanel
              county={activeCounty}
              metric={selectedMetric}
              value={activeMetricValue}
              percentile={percentile}
              stateAverage={stateAverage}
              nationalAverage={nationalAverage}
              matchedCountyLabel={matchedCounty ? `${matchedCounty.name}, ${matchedCounty.state}` : null}
              patientLabel={patientContext ? `${patientContext.patientName}${patientContext.patientAge ? `, ${patientContext.patientAge}yo` : ''}` : null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
