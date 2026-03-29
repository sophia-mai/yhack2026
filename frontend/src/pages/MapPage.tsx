import { useEffect, useMemo, useRef } from 'react';
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

const MAP_MODE_OPTIONS: Array<{
  id: MapMode;
  label: string;
  description: string;
  useCase: (metricLabel: string) => string;
  interpretation: string;
}> = [
  {
    id: 'baseline',
    label: 'Health burden',
    description: 'Map the raw county rate for the selected health outcome.',
    useCase: metricLabel => `You want the direct county rate for ${metricLabel.toLowerCase()}.`,
    interpretation: 'Darker counties mean a heavier burden for the selected metric.',
  },
  {
    id: 'equity',
    label: 'Economic strain',
    description: 'Map county poverty rates to understand structural barriers around the issue.',
    useCase: metricLabel => `You want to see where poverty may be intensifying ${metricLabel.toLowerCase()}.`,
    interpretation: 'Darker counties mean a larger share of residents living in poverty.',
  },
  {
    id: 'vulnerability',
    label: 'Community vulnerability',
    description: 'Map overall SVI to find places with the least buffer against disruption.',
    useCase: () => 'You are deciding where broader community conditions could make response or outreach harder.',
    interpretation: 'Darker counties have higher Social Vulnerability Index scores.',
  },
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

function formatMetricDelta(metric: HealthMetric, value: number | null) {
  if (value === null || Number.isNaN(value)) return '—';
  const unit = HEALTH_METRIC_UNITS[metric] ?? '%';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const absolute = Math.abs(value);
  if (unit === '/100k') return `${sign}${Math.round(absolute).toLocaleString()} ${unit}`;
  return `${sign}${absolute.toFixed(1)}${unit}`;
}

function getPercentileSummary(percentile: number | null) {
  if (percentile === null) return 'National rank unavailable.';
  if (percentile >= 90) return `This county is above ${percentile}% of counties on this measure.`;
  if (percentile >= 70) return `This county sits in the upper tier nationally at the ${percentile}th percentile.`;
  if (percentile >= 40) return `This county is near the middle of the national distribution.`;
  return `This county is below most counties nationally at the ${percentile}th percentile.`;
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
  const autoOpenedAnchorFipsRef = useRef<string | null>(null);

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
    if (matchedCounty && autoOpenedAnchorFipsRef.current !== matchedCounty.fips) {
      setSelectedCounty(matchedCounty);
      autoOpenedAnchorFipsRef.current = matchedCounty.fips;
    }
  }, [matchedCounty, setSelectedCounty]);

  const activeCounty = selectedCounty ?? matchedCounty ?? null;
  const activeMode = MAP_MODE_OPTIONS.find(mode => mode.id === mapMode) ?? MAP_MODE_OPTIONS[0];
  const selectedMetricLabel = HEALTH_METRIC_LABELS[selectedMetric] ?? selectedMetric;

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
  const stateDelta = activeMetricValue !== null && stateAverage !== null
    ? activeMetricValue - stateAverage
    : null;
  const nationalDelta = activeMetricValue !== null && nationalAverage !== null
    ? activeMetricValue - nationalAverage
    : null;
  const matchedCountyDelta = activeMetricValue !== null && matchedMetricValue !== null
    ? activeMetricValue - matchedMetricValue
    : null;
  const isActiveCountyMatched = !!activeCounty && !!matchedCounty && activeCounty.fips === matchedCounty.fips;
  const focusSummary = matchedCounty
    ? `Track ${selectedMetricLabel.toLowerCase()} around ${matchedCounty.name}, ${matchedCounty.state} using the ${activeMode.label.toLowerCase()} lens.`
    : `Track ${selectedMetricLabel.toLowerCase()} across counties using the ${activeMode.label.toLowerCase()} lens.`;
  const benchmarkCopy = activeCounty
    ? isActiveCountyMatched
      ? `This is the patient anchor county. Use it as the baseline for every county comparison.`
      : getPercentileSummary(percentile)
    : null;

  return (
    <div className="map-page-overlays">
      <div className="left-panel population-left-panel">
        <div className="panel-header">
          <div className="panel-title">Population Context</div>
          <div className="panel-subtitle">
            Zoom out from the individual patient to see the county and national forces shaping their health story.
          </div>
        </div>

        <div className="panel-body">
          <div className="population-panel-card population-focus-card">
            <div className="section-label">Current View</div>
            <div className="population-focus-header">
              <div>
                <div className="population-focus-metric">{selectedMetricLabel}</div>
                <div className="population-focus-copy">{activeMode.label}</div>
              </div>
              {matchedCounty && (
                <span className="population-chip population-focus-chip">
                  Anchor linked
                </span>
              )}
            </div>
            <div className="population-explainer-copy">
              {focusSummary}
            </div>
          </div>

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
                  aria-pressed={selectedMetric === metric}
                >
                  <span>{HEALTH_METRIC_LABELS[metric]}</span>
                  <small>{HEALTH_METRIC_UNITS[metric]}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="population-panel-card">
            <div className="section-label">Map Lens</div>
            <div className="population-mode-pill-row">
              {MAP_MODE_OPTIONS.map(mode => (
                <button
                  key={mode.id}
                  className={`population-mode-pill${mapMode === mode.id ? ' active' : ''}`}
                  onClick={() => setMapMode(mode.id)}
                  aria-pressed={mapMode === mode.id}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div className="population-lens-guide">
              <div className="population-lens-guide-label">Use this lens when</div>
              <div className="population-lens-guide-copy">
                {activeMode.description}
              </div>
              <div className="population-lens-guide-rule">
                <span>{activeMode.useCase(selectedMetricLabel)}</span>
                <span>Read colors as</span>
                <strong>{activeMode.interpretation}</strong>
              </div>
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
                : 'Click any county on the map — or use the patient anchor to jump to the matched county.'}
            </div>
          </div>

          <div className="panel-body">
            {activeCounty ? (
              <>
                <div className="population-panel-card">
                  <div className="section-label">Benchmark Read</div>
                  <div className="population-benchmark-hero">
                    <div className="population-benchmark-value">
                      {formatMetricValue(selectedMetric, activeMetricValue)}
                    </div>
                    <div className="population-benchmark-label">{HEALTH_METRIC_LABELS[selectedMetric]}</div>
                    <div className="population-benchmark-copy">{benchmarkCopy}</div>
                  </div>
                  <div className="population-bridge-list">
                    <div className="population-bridge-row">
                      <span>Vs {activeCounty.state} average</span>
                      <strong>{formatMetricDelta(selectedMetric, stateDelta)}</strong>
                    </div>
                    <div className="population-bridge-row">
                      <span>Vs national average</span>
                      <strong>{formatMetricDelta(selectedMetric, nationalDelta)}</strong>
                    </div>
                    <div className="population-bridge-row">
                      <span>National percentile</span>
                      <strong>{percentile !== null ? `${percentile}th` : '—'}</strong>
                    </div>
                  </div>
                </div>

                <div className="population-panel-card">
                  <div className="section-label">Patient Connection</div>
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
                        {formatMetricDelta(selectedMetric, matchedCountyDelta)}
                      </strong>
                    </div>
                    <div className="population-bridge-row">
                      <span>County role</span>
                      <strong>{isActiveCountyMatched ? 'Patient anchor' : 'Comparison county'}</strong>
                    </div>
                  </div>
                  {matchedCounty && !isActiveCountyMatched && (
                    <button
                      className="population-action-btn"
                      onClick={() => setSelectedCounty(matchedCounty)}
                    >
                      Jump to patient anchor
                    </button>
                  )}
                </div>

                <div className="population-panel-card">
                  <div className="section-label">Community Conditions</div>
                  <div className="population-context-grid">
                    <div className="population-context-stat">
                      <div className="population-context-value">{activeCounty.demographics.pctPoverty.toFixed(1)}%</div>
                      <div className="population-context-label">Below poverty line</div>
                    </div>
                    <div className="population-context-stat">
                      <div className="population-context-value">{activeCounty.demographics.pctUninsured.toFixed(1)}%</div>
                      <div className="population-context-label">Uninsured</div>
                    </div>
                    <div className="population-context-stat">
                      <div className="population-context-value">{activeCounty.demographics.pctElderly.toFixed(1)}%</div>
                      <div className="population-context-label">Age 65+</div>
                    </div>
                    <div className="population-context-stat">
                      <div className="population-context-value population-context-value-accent">
                        {activeCounty.svi.overall.toFixed(3)}
                      </div>
                      <div className="population-context-label">SVI score</div>
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
