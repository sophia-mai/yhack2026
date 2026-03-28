import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load county data (shared across routes)
let _countyData: CountyRecord[] | null = null;

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

let _interventions: Intervention[] | null = null;

export function getCountyData(): CountyRecord[] {
  if (!_countyData) {
    const dataPath = path.resolve(__dirname, '../../frontend/public/data/counties_health.json');
    _countyData = JSON.parse(readFileSync(dataPath, 'utf-8'));
  }
  return _countyData!;
}

export function getInterventions(): Intervention[] {
  if (!_interventions) {
    const dataPath = path.resolve(__dirname, '../../frontend/public/data/interventions.json');
    _interventions = JSON.parse(readFileSync(dataPath, 'utf-8'));
  }
  return _interventions!;
}

export interface InterventionInput {
  id: string;
  budget: number;
  targeting: string; // 'all' | 'low_income' | 'elderly' | 'minority' | 'rural' | 'uninsured'
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
  confidenceInterval: { lower: Record<string, number>; upper: Record<string, number> };
}

// Targeting multiplier: how much more effective an intervention is when targeted
const TARGETING_MULTIPLIERS: Record<string, (county: CountyRecord) => number> = {
  all: () => 1.0,
  low_income: (c) => 1.0 + (c.demographics.pctPoverty / 40) * 0.6,
  elderly: (c) => 1.0 + (c.demographics.pctElderly / 30) * 0.5,
  minority: (c) => 1.0 + ((c.demographics.pctBlack + c.demographics.pctHispanic) / 80) * 0.5,
  rural: (c) => c.isUrban ? 0.7 : 1.4,
  uninsured: (c) => 1.0 + (c.demographics.pctUninsured / 30) * 0.6,
};

// QALY weights by health indicator
const QALY_WEIGHTS: Record<string, number> = {
  obesity: 0.04,
  smoking: 0.08,
  diabetes: 0.07,
  physicalInactivity: 0.04,
  mentalHealth: 0.09,
  heartDisease: 0.12,
  copd: 0.10,
  checkups: -0.03, // improving checkups is positive, but the weight is applied differently
};

// Saturation: diminishing returns function
function saturation(spendPerCapita: number, k = 0.015): number {
  return 1 - Math.exp(-k * spendPerCapita);
}

export function simulateCounty(
  county: CountyRecord,
  interventionInputs: InterventionInput[],
  interventionDefs: Intervention[],
  timeHorizonYears: number
): SimulationResult {
  const defMap = new Map(interventionDefs.map(d => [d.id, d]));
  const baseline = { ...county.health };
  const projected = { ...county.health };

  let totalQalys = 0;
  let totalCost = 0;

  for (const input of interventionInputs) {
    const def = defMap.get(input.id);
    if (!def) continue;

    const spendPerCapita = input.budget / county.population;
    totalCost += input.budget;

    // Targeting multiplier
    const targetKey = input.targeting || 'all';
    const targetMult = (TARGETING_MULTIPLIERS[targetKey] ?? TARGETING_MULTIPLIERS.all)(county);

    // Saturation factor
    const sat = saturation(spendPerCapita);

    // Time horizon scaling
    const timeScale = Math.sqrt(timeHorizonYears / 5); // normalize around 5 years

    for (const [indicator, effectSize] of Object.entries(def.effects)) {
      if (!(indicator in projected)) continue;
      const rawEffect = effectSize * sat * targetMult * timeScale;
      projected[indicator as keyof typeof projected] += rawEffect;

      // Clamp to realistic bounds
      if (indicator === 'checkups') {
        (projected as Record<string, number>)[indicator] = Math.min(97, Math.max(40, projected[indicator as keyof typeof projected] as number));
      } else {
        (projected as Record<string, number>)[indicator] = Math.max(0, projected[indicator as keyof typeof projected] as number);
      }
    }

    // QALY calculation
    for (const [ind, w] of Object.entries(QALY_WEIGHTS)) {
      const delta = def.effects[ind] ?? 0;
      if (delta !== 0) {
        const improvement = Math.abs(delta) * sat * targetMult * timeScale;
        totalQalys += improvement * w * county.population * 0.01; // pct point → proportion
      }
    }
    totalQalys *= def.qalyWeight;
  }

  const absoluteChange: Record<string, number> = {};
  const pctChange: Record<string, number> = {};
  for (const key of Object.keys(baseline)) {
    const b = (baseline as Record<string, number>)[key];
    const p = (projected as Record<string, number>)[key];
    absoluteChange[key] = Math.round((p - b) * 100) / 100;
    pctChange[key] = b !== 0 ? Math.round(((p - b) / b) * 10000) / 100 : 0;
  }

  // Equity score: bonus for targeting high-SVI counties
  const equityScore = Math.round(
    50 + county.svi.overall * 30 + (county.demographics.pctPoverty / 40) * 20
  );

  // Confidence interval: ±15% on projected
  const ci = {
    lower: {} as Record<string, number>,
    upper: {} as Record<string, number>,
  };
  for (const key of Object.keys(projected)) {
    const p = (projected as Record<string, number>)[key];
    ci.lower[key] = Math.round(p * 0.87 * 10) / 10;
    ci.upper[key] = Math.round(p * 1.13 * 10) / 10;
  }

  return {
    fips: county.fips,
    name: county.name,
    state: county.state,
    population: county.population,
    baseline,
    projected,
    absoluteChange,
    pctChange,
    qalysGained: Math.round(totalQalys),
    costPerQaly: totalQalys > 0 ? Math.round(totalCost / totalQalys) : 0,
    equityScore,
    confidenceInterval: ci,
  };
}
