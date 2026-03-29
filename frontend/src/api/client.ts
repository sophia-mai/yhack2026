const API_BASE = '/api';

export async function fetchCounties(params?: { state?: string; fips?: string }) {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${API_BASE}/geography${query ? `?${query}` : ''}`);
  return res.json();
}

export async function runSimulation(body: {
  countyFips?: string[] | null;
  interventions: Array<{ id: string; budget: number; targeting: string }>;
  budgetTotal: number;
  timeHorizonYears: number;
  objective: string;
}) {
  const res = await fetch(`${API_BASE}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function runOptimizer(body: {
  countyFips?: string[];
  budgetTotal: number;
  objectiveMetric?: string;
  timeHorizonYears?: number;
  targetingStrategy?: string;
}) {
  const res = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function runIndividual(body: {
  profile: Record<string, unknown>;
  interventionIds: string[];
  timeHorizonYears?: number;
}) {
  const res = await fetch(`${API_BASE}/individual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function streamAISummary(
  body: {
    simulationSummary: Record<string, unknown>;
    interventions: unknown[];
    objective: string;
    countyCount: number;
  },
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (e: string) => void
) {
  fetch(`${API_BASE}/ai/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(res => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) { onDone(); return; }
      const text = decoder.decode(value);
      const lines = text.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) onChunk(data.content);
          if (data.done) onDone();
          if (data.error) onError(data.error);
        } catch { /* ignore parse errors */ }
      }
      pump();
    });
    pump();
  }).catch(e => onError(String(e)));
}

export async function generatePatientTimeline(body: {
  profile: Record<string, unknown>;
  medicalHistory: string;
  interventions?: Array<{ name: string; description: string }>;
}) {
  const res = await fetch(`${API_BASE}/ai/patient-timeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ timeline: TimelineEvent[] }>;
}

export async function getSimilarityScore(profile: {
  age: number;
  sex: string;
  ethnicity: string;
  bmi: string;
  smoker: boolean;
  state: string;
  countyFips?: string;
}): Promise<SimilarityResult> {
  const res = await fetch(`${API_BASE}/ai/similarity-score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface SimilarityResult {
  score: number;
  county: { name: string; state: string; fips: string };
  countyDiabetesRate: number;
  countyObesityRate: number;
  countySmokingRate: number;
  population: number;
}

export interface TimelineEvent {
  age: number;
  year: number;
  type: 'past' | 'present' | 'predicted' | 'intervention' | 'warning' | 'risk';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  avoided: boolean;
}

