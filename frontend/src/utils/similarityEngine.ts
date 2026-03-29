import type { CountyRecord } from '../types';

// Legacy insight type — kept for reference only; use DemographicInsight for new code
export interface MetricInsight {
  metric:             string;
  label:              string;
  unit:               string;
  userCountyValue:    number;
  nationalPercentile: number;
  peerCountyAvg:      number;
  peerCountyRange:    [number, number];
  nationalAvg:        number;
  personalAlignment: {
    alignment: 'higher' | 'lower' | 'similar';
    detail:    string;
  };
  interpretation: string;
}

// ── Demographic feature weights for peer-county Euclidean distance ──────────
// Weights reflect which axes are most meaningful for health outcome similarity.
// pctPoverty and pctUninsured are prioritized as primary drivers of inter-county variation.
const DEMO_WEIGHTS: Record<keyof CountyRecord['demographics'], number> = {
  pctPoverty:   2.0,
  pctUninsured: 1.8,
  pctElderly:   1.2,
  pctBlack:     1.0,
  pctHispanic:  1.0,
  pctWhite:     0.8,
};

// ── Metric configuration ─────────────────────────────────────────────────────
interface MetricConfig {
  key: keyof CountyRecord['health'];
  label: string;
  unit: string;
  higherIsWorse: boolean; // true = higher county value is worse (drives percentile direction)
}

const METRICS: MetricConfig[] = [
  { key: 'obesity',            label: 'Obesity Rate',                  unit: '%', higherIsWorse: true },
  { key: 'smoking',            label: 'Smoking Rate',                  unit: '%', higherIsWorse: true },
  { key: 'diabetes',           label: 'Diabetes Rate',                 unit: '%', higherIsWorse: true },
  { key: 'physicalInactivity', label: 'Physical Inactivity Rate',      unit: '%', higherIsWorse: true },
  { key: 'mentalHealth',       label: 'Frequent Mental Distress Rate', unit: '%', higherIsWorse: true },
];

// ── Public input type ─────────────────────────────────────────────────────────
export interface EngineInput {
  matchedCounty: CountyRecord;
  allCounties:   CountyRecord[];
  bmi:           number | null;   // null when height/weight fields were blank
  smoker:        boolean;
  familyHistory: string;          // raw text, lowercased internally
}

// ── Layer 2: national percentile ─────────────────────────────────────────────
// Returns 0–100. For "higher is worse" metrics p=99 means the county is in the
// worst 1%; p=1 means it is in the best 1%.
function nationalPercentile(
  value: number,
  allValues: number[],
  higherIsWorse: boolean,
): number {
  const sorted = [...allValues].sort((a, b) => a - b);
  const rank = sorted.filter(v => v < value).length;
  const pct = (rank / sorted.length) * 100;
  return higherIsWorse ? pct : 100 - pct;
}

// ── Layer 3: personal alignment ──────────────────────────────────────────────
function personalAlignment(
  metricKey: keyof CountyRecord['health'],
  bmi: number | null,
  smoker: boolean,
  familyHistory: string,
): { alignment: 'higher' | 'lower' | 'similar'; detail: string } {
  const fhLower = familyHistory.toLowerCase();

  switch (metricKey) {
    case 'obesity':
      if (bmi !== null && bmi >= 30)
        return { alignment: 'higher',  detail: `Your BMI of ${bmi.toFixed(1)} (obese range) is above the threshold associated with elevated obesity prevalence in this county.` };
      if (bmi !== null && bmi >= 25)
        return { alignment: 'similar', detail: `Your BMI of ${bmi.toFixed(1)} (overweight range) is close to this county's obesity profile.` };
      if (bmi !== null)
        return { alignment: 'lower',   detail: `Your BMI of ${bmi.toFixed(1)} (healthy range) is below the county's obesity rate.` };
      return { alignment: 'similar',   detail: 'BMI could not be calculated — county rate shown as reference.' };

    case 'smoking':
      if (smoker)
        return { alignment: 'higher',  detail: 'As a current smoker, your personal rate is above the county average.' };
      return   { alignment: 'lower',   detail: 'As a non-smoker, your personal rate is below the county average.' };

    case 'diabetes':
      if (fhLower.includes('diabetes'))
        return { alignment: 'higher',  detail: "Family history of diabetes is associated with elevated personal likelihood above this county's rate." };
      if (bmi !== null && bmi >= 30)
        return { alignment: 'similar', detail: `BMI of ${bmi.toFixed(1)} and no reported family history places you near the county's diabetes rate.` };
      return   { alignment: 'lower',   detail: 'No family history of diabetes and a healthy BMI suggest a lower personal likelihood than the county rate.' };

    case 'physicalInactivity':
      if (bmi !== null && bmi >= 30)
        return { alignment: 'higher',  detail: `A BMI of ${bmi.toFixed(1)} is often associated with higher physical inactivity than the county average.` };
      return   { alignment: 'similar', detail: "Your profile does not provide a strong signal above or below the county's inactivity rate." };

    case 'mentalHealth':
      return   { alignment: 'similar', detail: 'Mental distress patterns are difficult to infer from demographic data alone; the county rate serves as the best available reference.' };

    default:
      return   { alignment: 'similar', detail: '' };
  }
}

// ── Layer 4: peer county distance (weighted, std-dev normalized Euclidean) ────
function findPeerCounties(
  target: CountyRecord,
  allCounties: CountyRecord[],
  n = 20,
): CountyRecord[] {
  const dims = Object.keys(DEMO_WEIGHTS) as Array<keyof CountyRecord['demographics']>;

  // Pre-compute per-dimension standard deviations for normalization
  const stddevs: Record<string, number> = {};
  for (const dim of dims) {
    const vals = allCounties.map(c => c.demographics[dim]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    stddevs[dim] = Math.sqrt(variance) || 1; // avoid div-by-zero for constant dims
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

function peerStats(
  peers: CountyRecord[],
  metricKey: keyof CountyRecord['health'],
): { avg: number; range: [number, number] } {
  const vals = peers.map(c => c.health[metricKey]);
  return {
    avg:   vals.reduce((s, v) => s + v, 0) / vals.length,
    range: [Math.min(...vals), Math.max(...vals)],
  };
}

// ── Interpretation text — community-framed, never says "risk" ────────────────
function buildInterpretation(
  countyValue: number,
  nationalPct: number,
  peerAvg: number,
  nationalAvg: number,
  unit: string,
): string {
  const pctileLabel =
    nationalPct >= 75 ? 'among the highest nationally'
    : nationalPct >= 50 ? 'above the national median'
    : nationalPct >= 25 ? 'below the national median'
    : 'among the lowest nationally';

  const diff = Math.abs(countyValue - nationalAvg).toFixed(1);
  const dir  = countyValue > nationalAvg ? 'above' : 'below';

  return (
    `This county's rate of ${countyValue.toFixed(1)}${unit} is ${pctileLabel} ` +
    `(${diff}${unit} ${dir} the national average of ${nationalAvg.toFixed(1)}${unit}). ` +
    `Communities with a similar demographic profile have an average rate of ${peerAvg.toFixed(1)}${unit}.`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────
export function runSimilarityEngine(input: EngineInput): MetricInsight[] {
  const { matchedCounty, allCounties, bmi, smoker, familyHistory } = input;

  // Find peer counties once — shared across all metrics (O(N*6) ≈ 19k ops)
  const peers = findPeerCounties(matchedCounty, allCounties, 20);

  return METRICS.map(m => {
    const allVals     = allCounties.map(c => c.health[m.key]);
    const countyValue = matchedCounty.health[m.key];
    const nationalAvg = allVals.reduce((s, v) => s + v, 0) / allVals.length;
    const natPct      = nationalPercentile(countyValue, allVals, m.higherIsWorse);
    const { avg: peerAvg, range: peerRange } = peerStats(peers, m.key);
    const alignment   = personalAlignment(m.key, bmi, smoker, familyHistory);

    return {
      metric:             m.key,
      label:              m.label,
      unit:               m.unit,
      userCountyValue:    countyValue,
      nationalPercentile: Math.round(natPct),
      peerCountyAvg:      peerAvg,
      peerCountyRange:    peerRange,
      nationalAvg,
      personalAlignment:  alignment,
      interpretation:     buildInterpretation(countyValue, natPct, peerAvg, nationalAvg, m.unit),
    } satisfies MetricInsight;
  });
}
