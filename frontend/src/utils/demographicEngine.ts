import type { CountyRecord, CountyRaceData, DemographicInsight, DimensionScore, MetricPoint } from '../types';
import { mapEthnicity, raceLabel, type RaceKey } from './ethnicityMapper';

// ── Public input type ─────────────────────────────────────────────────────────
export interface DemoEngineInput {
  matchedCounty: CountyRecord;
  allCounties:   CountyRecord[];
  ethnicity:     string;
  bmi:           number | null;
  smoker:        boolean;
  familyHistory: string;
}

// ── Grade thresholds ──────────────────────────────────────────────────────────
function toGrade(score: number): DemographicInsight['grade'] {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ── Peer county matching: weighted std-dev-normalized Euclidean ───────────────
const DEMO_WEIGHTS: Record<keyof CountyRecord['demographics'], number> = {
  pctPoverty:   2.0,
  pctUninsured: 1.8,
  pctElderly:   1.2,
  pctBlack:     1.0,
  pctHispanic:  1.0,
  pctWhite:     0.8,
};

function findPeerCounties(target: CountyRecord, allCounties: CountyRecord[], n = 20): CountyRecord[] {
  const dims = Object.keys(DEMO_WEIGHTS) as Array<keyof CountyRecord['demographics']>;
  const stddevs: Record<string, number> = {};
  for (const dim of dims) {
    const vals = allCounties.map(c => c.demographics[dim]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    stddevs[dim] = Math.sqrt(variance) || 1;
  }
  return allCounties
    .filter(c => c.fips !== target.fips)
    .map(c => {
      let dist = 0;
      for (const dim of dims) {
        const diff = (c.demographics[dim] - target.demographics[dim]) / stddevs[dim];
        dist += DEMO_WEIGHTS[dim] * diff * diff;
      }
      return { county: c, dist: Math.sqrt(dist) };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n)
    .map(d => d.county);
}

// ── Percentile scoring (0–100; 100 = best) ────────────────────────────────────
// pool: array of non-null values from all counties with data for that metric
function pctile(val: number, pool: number[], higherIsBetter: boolean): number {
  if (pool.length === 0) return 50;
  const sorted = [...pool].sort((a, b) => a - b);
  const rank = sorted.filter(v => v < val).length;
  const raw = (rank / sorted.length) * 100;
  return higherIsBetter ? raw : 100 - raw;
}

// ── Pick race-specific value with graceful fallback ───────────────────────────
type RaceDataKey = keyof CountyRaceData;

interface MetricSpec {
  label:          string;
  unit:           string;
  higherIsBetter: boolean;
  raceField:      (rk: RaceKey) => RaceDataKey | null;    // null when race not available for metric
  overallField:   RaceDataKey;
  poolMinimum:    number;    // fall back to overall if race-specific pool < this
}

function pickValue(
  county: CountyRecord,
  spec: MetricSpec,
  raceKey: RaceKey,
): { value: number | null; source: 'race' | 'overall' } {
  const rf = raceKey ? spec.raceField(raceKey) : null;
  const raceVal = rf ? county.raceData[rf] as number | null : null;
  if (raceVal !== null) return { value: raceVal, source: 'race' };
  const overall = county.raceData[spec.overallField] as number | null;
  return { value: overall, source: 'overall' };
}

// ── Build a MetricPoint ───────────────────────────────────────────────────────
function buildMetricPoint(
  target: CountyRecord,
  peers: CountyRecord[],
  allCounties: CountyRecord[],
  spec: MetricSpec,
  raceKey: RaceKey,
): MetricPoint {
  const { value: countyVal, source } = pickValue(target, spec, raceKey);

  // Build national pool for percentile calculation
  // Prefer race-specific; fall back to overall if pool too small
  const rf = raceKey ? spec.raceField(raceKey) : null;
  const racePool = rf
    ? (allCounties
        .map(c => c.raceData[rf] as number | null)
        .filter((v): v is number => v !== null))
    : [];

  const useRacePool = racePool.length >= spec.poolMinimum;
  const pool = useRacePool
    ? racePool
    : (allCounties
        .map(c => c.raceData[spec.overallField] as number | null)
        .filter((v): v is number => v !== null));

  const effectiveSource = (source === 'race' && useRacePool) ? 'race' : 'overall';

  // The value to score: prefer race-specific if pool is large enough
  const effectiveField = (useRacePool && rf) ? rf : spec.overallField;
  const effectiveVal = (county: CountyRecord) => county.raceData[effectiveField] as number | null;
  const targetVal = effectiveVal(target);

  const natPct = targetVal !== null ? pctile(targetVal, pool, spec.higherIsBetter) : 50;

  // Peer average: same field choice
  const peerVals = peers
    .map(c => effectiveVal(c))
    .filter((v): v is number => v !== null);
  const peerAvg = peerVals.length > 0
    ? peerVals.reduce((s, v) => s + v, 0) / peerVals.length
    : null;

  const rlabel = effectiveSource === 'race' && raceKey
    ? `${raceLabel(raceKey)}`
    : 'all residents';

  return {
    label:          spec.label,
    unit:           spec.unit,
    countyValue:    countyVal,
    peerAvg,
    nationalPct:    Math.round(natPct),
    dataSource:     effectiveSource,
    raceLabel:      rlabel,
    higherIsBetter: spec.higherIsBetter,
  };
}

// ── Metric specifications ─────────────────────────────────────────────────────
const METRIC_SPECS: Record<string, MetricSpec> = {
  lifeExp: {
    label:          'Life Expectancy',
    unit:           ' yrs',
    higherIsBetter: true,
    overallField:   'lifeExpOverall',
    poolMinimum:    200,
    raceField: (rk) => {
      if (rk === 'Black')    return 'lifeExpBlack';
      if (rk === 'White')    return 'lifeExpWhite';
      if (rk === 'Hispanic') return 'lifeExpHispanic';
      if (rk === 'Asian')    return 'lifeExpAsian';
      return null;
    },
  },
  ypll: {
    label:          'Premature Death Rate',
    unit:           '/100k',
    higherIsBetter: false,
    overallField:   'ypllOverall',
    poolMinimum:    200,
    raceField: (rk) => {
      if (rk === 'Black')    return 'ypllBlack';
      if (rk === 'White')    return 'ypllWhite';
      if (rk === 'Hispanic') return 'ypllHispanic';
      return null;
    },
  },
  income: {
    label:          'Median Household Income',
    unit:           '',
    higherIsBetter: true,
    overallField:   'incomeOverall',
    poolMinimum:    300,
    raceField: (rk) => {
      if (rk === 'Black')    return 'incomeBlack';
      if (rk === 'White')    return 'incomeWhite';
      if (rk === 'Hispanic') return 'incomeHispanic';
      if (rk === 'Asian')    return 'incomeAsian';
      return null;
    },
  },
  childPoverty: {
    label:          'Child Poverty Rate',
    unit:           '%',
    higherIsBetter: false,
    overallField:   'childPovertyOverall',
    poolMinimum:    300,
    raceField: (rk) => {
      if (rk === 'Black')    return 'childPovertyBlack';
      if (rk === 'White')    return 'childPovertyWhite';
      if (rk === 'Hispanic') return 'childPovertyHispanic';
      return null;
    },
  },
  fluVax: {
    label:          'Flu Vaccination Rate',
    unit:           '%',
    higherIsBetter: true,
    overallField:   'fluVaxOverall',
    poolMinimum:    300,
    raceField: (rk) => {
      if (rk === 'Black')    return 'fluVaxBlack';
      if (rk === 'White')    return 'fluVaxWhite';
      if (rk === 'Hispanic') return 'fluVaxHispanic';
      if (rk === 'Asian')    return 'fluVaxAsian';
      return null;
    },
  },
  prevHosp: {
    label:          'Preventable Hospitalizations',
    unit:           '/100k',
    higherIsBetter: false,
    overallField:   'prevHospOverall',
    poolMinimum:    200,
    raceField: (rk) => {
      if (rk === 'Black') return 'prevHospBlack';
      if (rk === 'White') return 'prevHospWhite';
      return null;
    },
  },
};

// ── Dimension score builder ───────────────────────────────────────────────────
function buildDimension(
  name: string,
  weight: number,
  metricKeys: string[],
  metricWeights: number[],
  target: CountyRecord,
  peers: CountyRecord[],
  allCounties: CountyRecord[],
  raceKey: RaceKey,
): DimensionScore {
  const metrics: MetricPoint[] = metricKeys.map(mk =>
    buildMetricPoint(target, peers, allCounties, METRIC_SPECS[mk], raceKey)
  );
  const score = metrics.reduce((sum, m, i) => sum + m.nationalPct * metricWeights[i], 0);

  const summary = buildDimensionSummary(name, score, metrics, raceKey);

  return { name, weight, score: Math.round(score), metrics, summary };
}

function buildDimensionSummary(name: string, score: number, metrics: MetricPoint[], raceKey: RaceKey): string {
  const lvl = score >= 75 ? 'strong' : score >= 50 ? 'moderate' : score >= 30 ? 'below average' : 'poor';
  const forLabel = raceKey ? ` for ${raceLabel(raceKey)}` : '';
  if (name === 'Health Outcomes') {
    const le = metrics.find(m => m.label === 'Life Expectancy');
    const leVal = le?.countyValue?.toFixed(1) ?? 'N/A';
    return `${name} in this county are ${lvl}${forLabel}. Local life expectancy is ${leVal} years (${le?.nationalPct ?? '—'}th percentile nationally).`;
  }
  if (name === 'Economic Equity') {
    const inc = metrics.find(m => m.label === 'Median Household Income');
    const incVal = inc?.countyValue != null ? `$${Math.round(inc.countyValue / 1000)}k` : 'N/A';
    return `Economic conditions${forLabel} are ${lvl}. Median household income is ${incVal} (${inc?.nationalPct ?? '—'}th percentile nationally).`;
  }
  // Healthcare Access
  const vax = metrics.find(m => m.label === 'Flu Vaccination Rate');
  const vaxVal = vax?.countyValue?.toFixed(0) ?? 'N/A';
  return `Healthcare access${forLabel} is ${lvl}. Flu vaccination coverage is ${vaxVal}% (${vax?.nationalPct ?? '—'}th percentile nationally).`;
}

// ── Headline generator ────────────────────────────────────────────────────────
function buildHeadline(score: number, countyName: string, raceLabel: string): string {
  const forLabel = raceLabel !== 'all residents' ? ` for ${raceLabel}` : '';
  if (score >= 75) {
    return `${countyName} provides relatively strong health conditions${forLabel}, scoring in the top quarter nationally. Community resources and outcomes compare favorably to demographically similar counties.`;
  }
  if (score >= 55) {
    return `${countyName} shows mixed health equity${forLabel}, with some dimensions performing well and others trailing the national median. Targeted investments in the weaker dimensions could meaningfully improve outcomes.`;
  }
  if (score >= 40) {
    return `${countyName} faces notable health equity challenges${forLabel}, with several dimensions performing below the national median. This county would benefit from focused community health investments.`;
  }
  return `${countyName} is among the counties with the most significant health equity gaps${forLabel}. Conditions across health outcomes, economic equity, and healthcare access place this community in the bottom tier nationally.`;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function runDemographicEngine(input: DemoEngineInput): DemographicInsight {
  const { matchedCounty, allCounties, ethnicity } = input;
  const raceKey: RaceKey = mapEthnicity(ethnicity);
  const rl = raceLabel(raceKey);

  const peers = findPeerCounties(matchedCounty, allCounties, 20);

  // Dimension 1: Health Outcomes (45%) — lifeExp 60% + ypll 40%
  const d1 = buildDimension(
    'Health Outcomes', 0.45,
    ['lifeExp', 'ypll'], [0.60, 0.40],
    matchedCounty, peers, allCounties, raceKey,
  );

  // Dimension 2: Economic Equity (35%) — income 55% + childPoverty 45%
  const d2 = buildDimension(
    'Economic Equity', 0.35,
    ['income', 'childPoverty'], [0.55, 0.45],
    matchedCounty, peers, allCounties, raceKey,
  );

  // Dimension 3: Healthcare Access (20%) — fluVax 50% + prevHosp 50%
  const d3 = buildDimension(
    'Healthcare Access', 0.20,
    ['fluVax', 'prevHosp'], [0.50, 0.50],
    matchedCounty, peers, allCounties, raceKey,
  );

  const compositeScore = Math.round(
    d1.score * 0.45 + d2.score * 0.35 + d3.score * 0.20
  );
  const grade = toGrade(compositeScore);

  return {
    compositeScore,
    grade,
    raceLabel: rl,
    countyName: matchedCounty.name,
    peerCount: peers.length,
    dimensions: [d1, d2, d3],
    headline: buildHeadline(compositeScore, matchedCounty.name, rl),
  };
}
