import { create } from 'zustand';
import type {
  CountyRecord, Intervention, InterventionInput, SimulationResponse,
  HealthMetric, MapMode, PatientContextSnapshot, TabId
} from '../types';

interface AppState {
  // Data
  counties: CountyRecord[];
  interventions: Intervention[];
  setCounties: (c: CountyRecord[]) => void;
  setInterventions: (i: Intervention[]) => void;

  // Map state
  selectedMetric: HealthMetric;
  setSelectedMetric: (m: HealthMetric) => void;
  mapMode: MapMode;
  setMapMode: (m: MapMode) => void;
  hoveredFips: string | null;
  setHoveredFips: (f: string | null) => void;
  selectedCounty: CountyRecord | null;
  setSelectedCounty: (c: CountyRecord | null) => void;

  // Intervention builder
  activeInterventions: InterventionInput[];
  addIntervention: (id: string) => void;
  removeIntervention: (id: string) => void;
  updateIntervention: (id: string, patch: Partial<InterventionInput>) => void;
  clearInterventions: () => void;
  budgetTotal: number;
  setBudgetTotal: (b: number) => void;
  targeting: string;
  setTargeting: (t: string) => void;
  timeHorizon: number;
  setTimeHorizon: (t: number) => void;
  objective: string;
  setObjective: (o: string) => void;

  // Simulation results
  simulationResult: SimulationResponse | null;
  setSimulationResult: (r: SimulationResponse | null) => void;
  isSimulating: boolean;
  setIsSimulating: (v: boolean) => void;
  resultsByFips: Map<string, SimulationResponse['results'][0]>;

  // Navigation
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;

  // Shared patient context
  patientContext: PatientContextSnapshot | null;
  setPatientContext: (context: PatientContextSnapshot | null) => void;

  // Comparison mode
  scenarioA: InterventionInput[];
  scenarioB: InterventionInput[];
  setScenarioA: (s: InterventionInput[]) => void;
  setScenarioB: (s: InterventionInput[]) => void;
  simResultA: SimulationResponse | null;
  simResultB: SimulationResponse | null;
  setSimResultA: (r: SimulationResponse | null) => void;
  setSimResultB: (r: SimulationResponse | null) => void;
}

export const useStore = create<AppState>((set, get) => ({
  counties: [],
  interventions: [],
  setCounties: (counties) => set({ counties }),
  setInterventions: (interventions) => set({ interventions }),

  selectedMetric: 'obesity',
  setSelectedMetric: (selectedMetric) => set({ selectedMetric }),
  mapMode: 'baseline',
  setMapMode: (mapMode) => set({ mapMode }),
  hoveredFips: null,
  setHoveredFips: (hoveredFips) => set({ hoveredFips }),
  selectedCounty: null,
  setSelectedCounty: (selectedCounty) => set({ selectedCounty }),

  activeInterventions: [],
  addIntervention: (id) => {
    const existing = get().activeInterventions.find(i => i.id === id);
    if (existing) return;
    set(s => ({
      activeInterventions: [...s.activeInterventions, {
        id,
        budget: Math.round(s.budgetTotal / Math.max(1, s.activeInterventions.length + 1)),
        targeting: s.targeting,
      }],
    }));
  },
  removeIntervention: (id) => set(s => ({
    activeInterventions: s.activeInterventions.filter(i => i.id !== id),
  })),
  updateIntervention: (id, patch) => set(s => ({
    activeInterventions: s.activeInterventions.map(i => i.id === id ? { ...i, ...patch } : i),
  })),
  clearInterventions: () => set({ activeInterventions: [], simulationResult: null, resultsByFips: new Map(), mapMode: 'baseline' }),

  budgetTotal: 5_000_000,
  setBudgetTotal: (budgetTotal) => set({ budgetTotal }),
  targeting: 'all',
  setTargeting: (targeting) => set({ targeting }),
  timeHorizon: 5,
  setTimeHorizon: (timeHorizon) => set({ timeHorizon }),
  objective: '',
  setObjective: (objective) => set({ objective }),

  simulationResult: null,
  setSimulationResult: (simulationResult) => {
    const resultsByFips = new Map(
      simulationResult?.results.map(r => [r.fips, r]) ?? []
    );
    set({ simulationResult, resultsByFips, mapMode: simulationResult ? 'impact' : 'baseline' });
  },
  isSimulating: false,
  setIsSimulating: (isSimulating) => set({ isSimulating }),
  resultsByFips: new Map(),

  activeTab: 'individual',
  setActiveTab: (activeTab) => set({ activeTab }),

  patientContext: null,
  setPatientContext: (patientContext) => set({ patientContext }),

  scenarioA: [],
  scenarioB: [],
  setScenarioA: (scenarioA) => set({ scenarioA }),
  setScenarioB: (scenarioB) => set({ scenarioB }),
  simResultA: null,
  simResultB: null,
  setSimResultA: (simResultA) => set({ simResultA }),
  setSimResultB: (simResultB) => set({ simResultB }),
}));
