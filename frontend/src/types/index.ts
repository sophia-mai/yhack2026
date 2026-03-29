// TypeScript types for Prophis

// ── Race-stratified data extracted from County Health Rankings ───────────────
export interface CountyRaceData {
  // Health Outcomes
  lifeExpOverall:      number | null;
  lifeExpBlack:        number | null;
  lifeExpWhite:        number | null;
  lifeExpHispanic:     number | null;
  lifeExpAsian:        number | null;

  ypllOverall:         number | null;
  ypllBlack:           number | null;
  ypllWhite:           number | null;
  ypllHispanic:        number | null;

  // Economic Equity
  incomeOverall:       number | null;
  incomeBlack:         number | null;
  incomeWhite:         number | null;
  incomeHispanic:      number | null;
  incomeAsian:         number | null;

  childPovertyOverall: number | null;
  childPovertyBlack:   number | null;
  childPovertyWhite:   number | null;
  childPovertyHispanic: number | null;

  // Healthcare Access
  fluVaxOverall:       number | null;
  fluVaxBlack:         number | null;
  fluVaxWhite:         number | null;
  fluVaxHispanic:      number | null;
  fluVaxAsian:         number | null;

  prevHospOverall:     number | null;
  prevHospBlack:       number | null;
  prevHospWhite:       number | null;
}

export interface CountyRecord {
  fips: string;
  name: string;
  state: string;
  stateName: string;
  population: number;
  isUrban: boolean;
  demographics: {
    pctPoverty: number;
    pctUninsured: number;
    pctElderly: number;
    pctBlack: number;
    pctHispanic: number;
    pctWhite: number;
  };
  health: {
    obesity: number;
    smoking: number;
    diabetes: number;
    physicalInactivity: number;
    mentalHealth: number;
    heartDisease: number;
    copd: number;
    checkups: number;
    mortalityRate: number;
  };
  environment: {
    aqiPM25: number;
    aqiO3: number;
  };
  svi: {
    overall: number;
    socioeconomic: number;
    householdComp: number;
    minority: number;
    housingTransport: number;
  };
  raceData: CountyRaceData;
}

// ── Demographic Health Equity Score types ────────────────────────────────────
export interface MetricPoint {
  label:          string;
  unit:           string;
  countyValue:    number | null;
  peerAvg:        number | null;
  nationalPct:    number;           // 0–100; 100 = best position
  dataSource:     'race' | 'overall';
  raceLabel:      string;           // e.g. "Black residents" or "all residents"
  higherIsBetter: boolean;
}

export interface DimensionScore {
  name:    string;
  weight:  number;
  score:   number;                  // 0–100
  metrics: MetricPoint[];
  summary: string;
}

export interface DemographicInsight {
  compositeScore: number;           // 0–100
  grade:          'A' | 'B' | 'C' | 'D' | 'F';
  raceLabel:      string;           // "Black residents" or "all residents"
  countyName:     string;
  peerCount:      number;
  dimensions:     [DimensionScore, DimensionScore, DimensionScore];
  headline:       string;
}

export interface Intervention {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  costPerCapita: number;
  effects: Record<string, number>;
  targetableBy: string[];
  timeHorizon: string;
  evidenceLevel: string;
  qalyWeight: number;
}

export interface InterventionInput {
  id: string;
  budget: number;
  targeting: string;
}

export interface SimulationResult {
  fips: string;
  name: string;
  state: string;
  population: number;
  baseline: Record<string, number>;
  projected: Record<string, number>;
  absoluteChange: Record<string, number>;
  pctChange: Record<string, number>;
  qalysGained: number;
  costPerQaly: number;
  equityScore: number;
}

export interface SimulationSummary {
  countiesAnalyzed: number;
  totalPopulation: number;
  totalQalysGained: number;
  avgCostPerQaly: number;
  giniCoefficient: number;
  objective: string;
  timeHorizonYears: number;
  budgetTotal: number;
}

export interface SimulationResponse {
  summary: SimulationSummary;
  topImproved: Array<{ fips: string; name: string; state: string; qalysGained: number }>;
  results: SimulationResult[];
}

export interface SimilarityFactorBreakdown {
  id: string;
  label: string;
  normalizedValue: number;
  weight: number;
  displayValue: string;
  explanation: string;
}

export interface SimilarityResult {
  score: number;
  county: { name: string; state: string; fips: string };
  countyDiabetesRate: number;
  countyObesityRate: number;
  countySmokingRate: number;
  countyPhysicalInactivityRate: number;
  population: number;
  matchedBy: 'patient_county' | 'state_demographic_match';
  title: string;
  summary: string;
  interpretation: string;
  caveat: string;
  factors: SimilarityFactorBreakdown[];
}

export interface PatientContextSnapshot {
  patientName: string;
  patientAge: number | null;
  patientEthnicity: string;
  bmi: number | null;
  smoker: boolean;
  locationLabel: string;
  matchedCountyFips: string | null;
  matchedCountyName: string | null;
  matchedCountyState: string | null;
  similarity: SimilarityResult | null;
}

export type HealthMetric = keyof CountyRecord['health'];

export const HEALTH_METRIC_LABELS: Record<string, string> = {
  obesity: 'Obesity Rate',
  smoking: 'Smoking Rate',
  diabetes: 'Diabetes Rate',
  physicalInactivity: 'Physical Inactivity',
  mentalHealth: 'Frequent Mental Distress',
  heartDisease: 'Insufficient Sleep',
  copd: 'Excessive Drinking',
  checkups: 'Flu Vaccination',
  mortalityRate: 'Premature Death (YPLL)',
};

export const HEALTH_METRIC_UNITS: Record<string, string> = {
  obesity: '%',
  smoking: '%',
  diabetes: '%',
  physicalInactivity: '%',
  mentalHealth: '%',
  heartDisease: '%',
  copd: '%',
  checkups: '%',
  mortalityRate: '/100k',
};

export type MapMode = 'baseline' | 'impact' | 'equity' | 'vulnerability';
export type TabId = 'map' | 'individual';
