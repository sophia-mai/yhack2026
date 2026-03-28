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
    heartDisease: number; // mapped from Insufficient Sleep %
    copd: number;         // mapped from Excessive Drinking %
    checkups: number;     // mapped from Flu Vaccinations %
    mortalityRate: number; // mapped from YPLL Rate
  };
  environment: {
    aqiPM25: number;
    aqiO3: number; // mapped from avg physically unhealthy days
  };
  svi: {
    overall: number;
    socioeconomic: number;
    householdComp: number;
    minority: number;
    housingTransport: number;
  };
}

// State name → abbreviation lookup
const STATE_ABBREV: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

function safeNum(val: unknown): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformCounty(raw: any): CountyRecord {
  const g = (category: string, field: string): number =>
    safeNum((raw[category] as Record<string, unknown>)?.[field]);

  const pctPoverty      = g('Children in Poverty', '% Children in Poverty');
  const pctUninsured    = g('Uninsured', '% Uninsured');
  const pctElderly      = g('% 65 and Older', '% 65 and Over');
  const pctBlack        = g('% Non-Hispanic Black', '% Non-Hispanic Black');
  const pctHispanic     = g('% Hispanic', '% Hispanic');
  const pctWhite        = g('% Non-Hispanic White', '% Non-Hispanic White');
  const pctRural        = g('% Rural', '% Rural');
  const pctUnemployed   = g('Unemployment', '% Unemployed');
  const pctSingleParent = g('Children in Single-Parent Households', '% Children in Single-Parent Households');
  const pctHousingProb  = g('Severe Housing Problems', '% Severe Housing Problems');

  // Compute SVI-like composite scores (0-1 normalized)
  const sviSocioeconomic    = Math.min(1, (pctPoverty / 30 + pctUnemployed / 15) / 2);
  const sviHouseholdComp    = Math.min(1, (pctSingleParent / 50 + pctPoverty / 40) / 2);
  const sviMinority         = Math.min(1, (pctBlack + pctHispanic) / 100);
  const sviHousingTransport = Math.min(1, pctHousingProb / 40);
  const sviOverall = (sviSocioeconomic + sviHouseholdComp + sviMinority + sviHousingTransport) / 4;

  return {
    fips:      raw.fips,
    name:      raw.county,
    state:     STATE_ABBREV[raw.state as string] ?? (raw.state as string).slice(0, 2).toUpperCase(),
    stateName: raw.state as string,
    population: g('Population', 'Population'),
    isUrban: pctRural < 20,
    demographics: { pctPoverty, pctUninsured, pctElderly, pctBlack, pctHispanic, pctWhite },
    health: {
      obesity:            g('Adult Obesity', '% Adults with Obesity'),
      smoking:            g('Adult Smoking', '% Adults Reporting Currently Smoking'),
      diabetes:           g('Diabetes Prevalence', '% Adults with Diabetes'),
      physicalInactivity: g('Physical Inactivity', '% Physically Inactive'),
      mentalHealth:       g('Frequent Mental Distress', '% Frequent Mental Distress'),
      heartDisease:       g('Insufficient Sleep', '% Insufficient Sleep'),
      copd:               g('Excessive Drinking', '% Excessive Drinking'),
      checkups:           g('Flu Vaccinations', '% Vaccinated'),
      mortalityRate:      g('Premature Death', 'Years of Potential Life Lost Rate'),
    },
    environment: {
      aqiPM25: g('Air Pollution: Particulate Matter', 'Average Daily PM2.5'),
      aqiO3:   g('Poor Physical Health Days', 'Average Number of Physically Unhealthy Days'),
    },
    svi: {
      overall:          sviOverall,
      socioeconomic:    sviSocioeconomic,
      householdComp:    sviHouseholdComp,
      minority:         sviMinority,
      housingTransport: sviHousingTransport,
    },
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

function resolveDataPath(filename: string): string {
  // Try multiple locations to handle different cwd contexts
  const candidates = [
    path.resolve(process.cwd(), 'frontend/public/data', filename),
    path.resolve(process.cwd(), '../frontend/public/data', filename),
    path.resolve(__dirname, '../../../frontend/public/data', filename),
    path.resolve(__dirname, '../../frontend/public/data', filename),
  ];
  for (const p of candidates) {
    try { readFileSync(p); return p; } catch { /* try next */ }
  }
  throw new Error(`Cannot find data file: ${filename}. Checked: ${candidates.join(', ')}`);
}

export function getCountyData(): CountyRecord[] {
  if (!_countyData) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = JSON.parse(readFileSync(resolveDataPath('county_health_data_full.json'), 'utf-8'));
    _countyData = raw.map(transformCounty);
  }
  return _countyData!;
}

export function getInterventions(): Intervention[] {
  if (!_interventions) {
    _interventions = JSON.parse(readFileSync(resolveDataPath('interventions.json'), 'utf-8'));
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
// heartDisease = Insufficient Sleep %, copd = Excessive Drinking %, checkups = Flu Vaccination %
const QALY_WEIGHTS: Record<string, number> = {
  obesity: 0.04,
  smoking: 0.08,
  diabetes: 0.07,
  physicalInactivity: 0.04,
  mentalHealth: 0.09,
  heartDisease: 0.06, // insufficient sleep
  copd: 0.07,         // excessive drinking
  checkups: -0.03,    // improving flu vaccination is positive
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
        // Flu vaccination: clamp to [5, 90]
        (projected as Record<string, number>)[indicator] = Math.min(90, Math.max(5, projected[indicator as keyof typeof projected] as number));
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
