// TypeScript types for PulsePolicy
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

export type HealthMetric = keyof CountyRecord['health'];

export const HEALTH_METRIC_LABELS: Record<string, string> = {
  obesity: 'Obesity Rate',
  smoking: 'Smoking Rate',
  diabetes: 'Diabetes Rate',
  physicalInactivity: 'Physical Inactivity',
  mentalHealth: 'Poor Mental Health',
  heartDisease: 'Heart Disease',
  copd: 'COPD',
  checkups: 'Annual Checkups',
  mortalityRate: 'Mortality Rate',
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
export type TabId = 'map' | 'compare' | 'individual' | 'optimizer';
