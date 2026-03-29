import { Router } from 'express';
import { getCountyData } from '../engine/simulation.js';

const router = Router();

const LAVA_CHAT_URL = 'https://api.lava.so/v1/chat/completions';
const DEFAULT_MODEL = process.env.LAVA_MODEL || process.env.CLAUDE_MODEL || 'openai/gpt-4o-mini';
const FAST_MODEL = process.env.LAVA_MODEL_FAST || DEFAULT_MODEL;
const SUMMARY_MODEL = process.env.LAVA_MODEL_SUMMARY || DEFAULT_MODEL;
const DEEP_MODEL = process.env.LAVA_MODEL_DEEP || DEFAULT_MODEL;

type LavaMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type TimelineEvent = {
  age: number;
  year: number;
  type: 'past' | 'present';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  avoided: boolean;
};

type PreventionOpportunity = {
  age: number;
  year: number;
  title: string;
  action: string;
  rationale: string;
  priority: 'medium' | 'high' | 'critical';
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeSeverity(value: unknown): TimelineEvent['severity'] {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value;
  return 'medium';
}

function normalizePriority(value: unknown): PreventionOpportunity['priority'] {
  if (value === 'medium' || value === 'high' || value === 'critical') return value;
  return 'high';
}

function hasPredictiveLanguage(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    'people with similar profiles',
    'commonly experience',
    'risk profile',
    'future',
    'forecast',
    'projected',
    'will develop',
    'will have',
    'may develop',
    'could develop',
    'x% of individuals',
    'likely to experience',
  ].some(pattern => normalized.includes(pattern));
}

function findMatchingBracket(source: string, startIndex: number, openChar: '[' | '{', closeChar: ']' | '}'): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function extractNamedArray(source: string, key: 'timeline' | 'opportunities'): string | null {
  const keyIndex = source.indexOf(`"${key}"`);
  if (keyIndex === -1) return null;
  const arrayStart = source.indexOf('[', keyIndex);
  if (arrayStart === -1) return null;
  const arrayEnd = findMatchingBracket(source, arrayStart, '[', ']');
  if (arrayEnd === -1) return null;
  return source.slice(arrayStart, arrayEnd + 1);
}

function recoverPartialObjectArray(source: string, key: 'timeline' | 'opportunities'): unknown[] {
  const keyIndex = source.indexOf(`"${key}"`);
  if (keyIndex === -1) return [];
  const arrayStart = source.indexOf('[', keyIndex);
  if (arrayStart === -1) return [];

  const items: unknown[] = [];
  let inString = false;
  let escaped = false;
  let objectStart = -1;
  let depth = 0;

  for (let i = arrayStart + 1; i < source.length; i += 1) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === ']') break;

    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        const objectText = source.slice(objectStart, i + 1);
        try {
          items.push(JSON.parse(objectText));
        } catch {
          // Skip malformed partial object and continue scanning.
        }
        objectStart = -1;
      }
    }
  }

  return items;
}

function recoverTimelinePayload(source: string): { timeline: unknown[]; opportunities: unknown[] } | null {
  const timelineArray = extractNamedArray(source, 'timeline');
  if (!timelineArray) return null;

  try {
    const timeline = JSON.parse(timelineArray) as unknown[];
    const opportunitiesArray = extractNamedArray(source, 'opportunities');
    if (opportunitiesArray) {
      try {
        return {
          timeline,
          opportunities: JSON.parse(opportunitiesArray) as unknown[],
        };
      } catch {
        return {
          timeline,
          opportunities: recoverPartialObjectArray(source, 'opportunities'),
        };
      }
    }

    return {
      timeline,
      opportunities: recoverPartialObjectArray(source, 'opportunities'),
    };
  } catch {
    return null;
  }
}

function normalizeTimelineEvents(raw: unknown[], currentYear: number, currentAge: number): TimelineEvent[] {
  const normalized = raw
    .map((entry): TimelineEvent | null => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Record<string, unknown>;
      const age = asFiniteNumber(item.age);
      const year = asFiniteNumber(item.year);
      if (age === null || year === null) return null;

      const title = asString(item.title, 'Clinical event');
      const description = asString(item.description, 'Clinical context noted in the record.');
      if (age > currentAge || year > currentYear) return null;
      if (hasPredictiveLanguage(`${title} ${description}`)) return null;

      const rawType = item.type === 'present' ? 'present' : 'past';
      const type: TimelineEvent['type'] = (age === currentAge || year === currentYear) ? 'present' : rawType;

      return {
        age,
        year,
        type,
        title,
        description,
        severity: normalizeSeverity(item.severity),
        category: asString(item.category, 'diagnosis'),
        avoided: false,
      };
    })
    .filter((entry): entry is TimelineEvent => Boolean(entry))
    .sort((a, b) => (a.year - b.year) || (a.age - b.age));

  const pastEvents = normalized.filter(event => event.year < currentYear && event.age < currentAge)
    .map(event => ({ ...event, type: 'past' as const }));

  const presentCandidate = [...normalized]
    .filter(event => event.year <= currentYear && event.age <= currentAge)
    .sort((a, b) => (b.year - a.year) || (b.age - a.age))[0];

  if (!presentCandidate) {
    return pastEvents.slice(-5);
  }

  const presentEvent: TimelineEvent = {
    ...presentCandidate,
    type: 'present',
    age: Math.min(presentCandidate.age, currentAge),
    year: Math.min(presentCandidate.year, currentYear),
  };

  return [...pastEvents.filter(event => event.year < presentEvent.year || event.age < presentEvent.age), presentEvent];
}

function normalizeOpportunities(raw: unknown[], currentYear: number, currentAge: number): PreventionOpportunity[] {
  return raw
    .map((entry): PreventionOpportunity | null => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Record<string, unknown>;
      const age = asFiniteNumber(item.age);
      const year = asFiniteNumber(item.year);
      if (age === null || year === null) return null;
      if (age >= currentAge || year >= currentYear) return null;

      return {
        age,
        year,
        title: asString(item.title, 'Earlier intervention point'),
        action: asString(item.action, 'Preventive follow-up could have been escalated earlier.'),
        rationale: asString(item.rationale, 'Earlier action may have changed the later clinical trajectory.'),
        priority: normalizePriority(item.priority),
      };
    })
    .filter((entry): entry is PreventionOpportunity => Boolean(entry))
    .sort((a, b) => (a.year - b.year) || (a.age - b.age))
    .slice(0, 4);
}

function getLavaAuthToken(): string {
  const token = process.env.LAVA_SECRET_KEY || process.env.LAVA_FORWARD_TOKEN;
  if (!token) throw new Error('Neither LAVA_SECRET_KEY nor LAVA_FORWARD_TOKEN is set in environment');
  return token;
}

async function callLavaChat(options: {
  model: string;
  messages: LavaMessage[];
  maxTokens: number;
  temperature?: number;
}): Promise<string> {
  const response = await fetch(LAVA_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getLavaAuthToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Lava API error: ${response.status} ${errText}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? '';
}

async function callLavaWithFallback(options: {
  primaryModel: string;
  fallbackModel: string;
  messages: LavaMessage[];
  maxTokens: number;
  temperature?: number;
}): Promise<string> {
  try {
    return await callLavaChat({
      model: options.primaryModel,
      messages: options.messages,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
  } catch (primaryErr) {
    console.warn(`Primary model failed (${options.primaryModel}), falling back to ${options.fallbackModel}.`, primaryErr);
    return callLavaChat({
      model: options.fallbackModel,
      messages: options.messages,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
  }
}

// POST /api/ai/summarize — summary using Lava unified API
router.post('/summarize', async (req, res) => {
  try {
    const { simulationSummary, interventions, objective, countyCount } = req.body;
    const prompt = buildPrompt(simulationSummary, interventions, objective, countyCount);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const content = await callLavaWithFallback({
      primaryModel: SUMMARY_MODEL,
      fallbackModel: FAST_MODEL,
      maxTokens: 1024,
      messages: [
        {
          role: 'system',
          content: 'You are a public health policy expert and data scientist. Generate concise, evidence-based, equity-aware summaries with concrete numbers and actionable recommendations.',
        },
        { role: 'user', content: prompt },
      ],
    });

    if (content) {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    console.error('Lava error:', err);
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
    res.end();
  }
});

// POST /api/ai/insight — non-streaming quick insight
router.post('/insight', async (req, res) => {
  try {
    const {
      county,
      metric,
      value,
      percentile,
      stateAverage,
      nationalAverage,
      matchedCounty,
      patientLabel,
    } = req.body;

    const insight = await callLavaWithFallback({
      primaryModel: FAST_MODEL,
      fallbackModel: SUMMARY_MODEL,
      maxTokens: 220,
      messages: [{
        role: 'user',
        content: `Write 2-3 sentences for a doctor or analyst looking at county-level health data. County: ${county}. Metric: ${metric}. County value: ${value}. National percentile: ${percentile}. State average: ${stateAverage ?? 'unknown'}. National average: ${nationalAverage ?? 'unknown'}. Matched patient county: ${matchedCounty || 'not provided'}. Patient anchor: ${patientLabel || 'not provided'}. Explain what stands out, how it compares to broader context, and one practical interpretation. Avoid hype and avoid pretending this is a diagnosis.`,
      }],
    });

    return res.json({ insight });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

function buildPrompt(summary: Record<string, unknown>, interventions: Record<string, unknown>[], objective: string, countyCount: number): string {
  return `
Analyze the following public health simulation results and write a comprehensive policy summary.

**Objective:** ${objective || 'General public health improvement'}

**Interventions Selected:**
${Array.isArray(interventions) ? interventions.map((i) => `- ${i.name || i.id}: $${Number(i.budget || 0).toLocaleString()} budget, targeting ${i.targeting || 'all populations'}`).join('\n') : 'None specified'}

**Simulation Results (${countyCount} counties analyzed):**
- Total QALYs Gained: ${summary?.totalQalysGained?.toLocaleString?.() || 'N/A'}
- Cost per QALY: $${summary?.avgCostPerQaly?.toLocaleString?.() || 'N/A'}
- Gini Coefficient (health disparity): ${summary?.giniCoefficient || 'N/A'}
- Total Budget: $${summary?.budgetTotal?.toLocaleString?.() || 'N/A'}
- Time Horizon: ${summary?.timeHorizonYears || 5} years

Please provide:
1. **Key Findings** (2-3 bullet points on most impactful outcomes)
2. **Equity Analysis** (who benefits most, disparity implications)
3. **Cost-Effectiveness** (value for money assessment)
4. **Priority Recommendations** (2-3 actionable next steps)
5. **Risks & Limitations** (caveats about the model)

Keep the total response under 600 words. Use specific numbers. Be direct and evidence-based.
`.trim();
}

// POST /api/ai/patient-timeline — generate a retrospective timeline + prevention review
router.post('/patient-timeline', async (req, res) => {
  try {
    const { profile, medicalHistory } = req.body;
    const currentYear = new Date().getFullYear();
    const currentAge = Math.max(0, Number(profile?.age) || 0);

    const systemPrompt = `You are a clinical data analyst processing patient health records for Prophis. Return ONLY a valid JSON object with two keys: "timeline" and "opportunities". No prose, no markdown fences.

"timeline" must be an array of chronological health events with these fields:
- age (number)
- year (number)
- type ("past"|"present")
- title (string, max 7 words)
- description (string, 1 sentence grounded in the record)
- severity ("low"|"medium"|"high"|"critical")
- category ("diagnosis"|"lifestyle"|"medication"|"screening"|"risk_factor"|"symptom"|"outcome")
- avoided (boolean, always false)

"opportunities" must be an array of 2-4 retrospective prevention opportunities with these fields:
- age (number)
- year (number)
- title (string, max 7 words)
- action (string, 1 sentence describing what preventive action, screening, counseling, monitoring, or follow-up could have happened at that point)
- rationale (string, 1 sentence explaining why that missed moment mattered for this patient's later trajectory)
- priority ("medium"|"high"|"critical")

Rules:
- Build 3-6 past events and exactly 1 present event.
- The final timeline event must be the present state at the patient's current age/year.
- Do not include future risks, forecasts, projections, or hypothetical future years.
- Every opportunity must point to an earlier moment in the history where prevention, earlier escalation, or better follow-up could reasonably have occurred.
- Use the medical history first; if the record is sparse, infer only conservative, plausible prevention gaps from the demographics and stated history.
- Keep titles short and keep action/rationale sentences concise.
- Keep the language retrospective and analytical, not speculative.`;

    const userPrompt = `Patient: ${profile.name || 'Patient'}, Age ${profile.age}, ${profile.sex}, BMI ${profile.bmi || 'unknown'}, Ethnicity: ${profile.ethnicity || 'not stated'}, Smoker: ${profile.smoker ? 'Yes' : 'No'}, Family Hx: ${profile.familyHistory || 'none'}.

Medical History:
${(medicalHistory || 'No history provided — infer realistic events from demographics.').slice(0, 800)}

Do not place any event after the current year ${currentYear} or after age ${currentAge}. Prevention opportunities must refer to past moments only.

Return JSON object only.`;

    const rawText = await callLavaWithFallback({
      primaryModel: DEEP_MODEL,
      fallbackModel: SUMMARY_MODEL,
      maxTokens: 1800,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    // Strip markdown code fences if present
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const recovered = recoverTimelinePayload(cleaned);
      if (recovered) {
        parsed = recovered;
        console.warn('patient-timeline: JSON was truncated, recovered payload from partial response');
      } else {
        return res.status(500).json({ error: 'Failed to parse patient timeline response', raw: rawText });
      }
    }

    if (Array.isArray(parsed)) {
      return res.json({ timeline: parsed, opportunities: [] });
    }

    const payload = (parsed && typeof parsed === 'object') ? parsed as {
      timeline?: unknown[];
      opportunities?: unknown[];
    } : null;

    if (!payload || !Array.isArray(payload.timeline)) {
      return res.status(500).json({ error: 'Patient timeline payload missing timeline array', raw: rawText });
    }

    const timeline = normalizeTimelineEvents(payload.timeline, currentYear, currentAge);
    const opportunities = normalizeOpportunities(
      Array.isArray(payload.opportunities) ? payload.opportunities : [],
      currentYear,
      currentAge
    );

    return res.json({
      timeline,
      opportunities,
    });
  } catch (err) {
    console.error('patient-timeline error:', err);
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/ai/similarity-score — compute county-matched diabetes risk similarity (no AI needed)
router.post('/similarity-score', (req, res) => {
  try {
    const { profile } = req.body;
    // profile: { age, sex, ethnicity, bmi, smoker, state, countyFips }
    const counties = getCountyData();

    // 1. Narrow to patient's state
    const stateLower = (profile.state || '').toLowerCase();
    const pool = stateLower
      ? counties.filter(c =>
          c.stateName?.toLowerCase() === stateLower ||
          c.state?.toLowerCase() === stateLower
        )
      : counties;
    const refPool = pool.length > 0 ? pool : counties;
    const exactCounty = profile.countyFips
      ? counties.find(c => c.fips === profile.countyFips)
      : null;

    // 2. Pick county with highest demographic match for patient's ethnicity when no exact county is available
    const ethnLower = (profile.ethnicity || '').toLowerCase();
    const getEthScore = (c: ReturnType<typeof getCountyData>[0]) => {
      if (ethnLower.includes('black') || ethnLower.includes('african')) return c.demographics.pctBlack;
      if (ethnLower.includes('hispanic') || ethnLower.includes('latin')) return c.demographics.pctHispanic;
      if (ethnLower.includes('white') || ethnLower.includes('caucasian')) return c.demographics.pctWhite;
      return 100 - c.demographics.pctBlack - c.demographics.pctHispanic; // default to majority non-minority
    };
    const refCounty = exactCounty
      ?? refPool.reduce((best, c) => getEthScore(c) > getEthScore(best) ? c : best, refPool[0]);

    // 3. Compute similarity to county's diabetic population profile
    const bmi = parseFloat(profile.bmi) || 26;
    const age = parseInt(profile.age) || 40;
    const isSmoker = !!profile.smoker;

    // Known US averages for type 2 diabetics vs non-diabetics
    // BMI: diabetic avg ~32, non-diabetic avg ~26
    const bmiSim = Math.max(0, Math.min(1, (bmi - 22) / 18));  // 22=low risk, 40=high risk

    // Smoking: ~17% of diabetics smoke vs ~14% general — not huge, but still a factor
    const smokingSim = isSmoker ? 0.75 : 0.25;

    // County diabetes prevalence — higher prevalence = environment matches diabetic risk
    const diabPrev = refCounty.health.diabetes || 10;
    const countyFactor = Math.min(1, diabPrev / 18); // 18% = very high prevalence

    // County physical inactivity — strong predictor
    const inactFactor = Math.min(1, (refCounty.health.physicalInactivity || 25) / 40);

    // Age factor: risk rises with age (30 = low, 70 = high)
    const ageFactor = Math.min(1, Math.max(0, (age - 25) / 50));

    // Weighted similarity score (0-100)
    const rawScore =
      bmiSim       * 0.35 +
      smokingSim   * 0.20 +
      countyFactor * 0.20 +
      inactFactor  * 0.10 +
      ageFactor    * 0.15;

    const score = Math.round(Math.min(97, Math.max(25, rawScore * 100)));
    const factors = [
      {
        id: 'bmi',
        label: 'BMI context',
        normalizedValue: bmiSim,
        weight: 0.35,
        displayValue: `${bmi.toFixed(1)} BMI`,
        explanation: 'Higher BMI raises alignment with aggregate diabetes-related patterns.',
      },
      {
        id: 'smoking',
        label: 'Smoking status',
        normalizedValue: smokingSim,
        weight: 0.20,
        displayValue: isSmoker ? 'Current smoker' : 'Not currently smoking',
        explanation: 'Smoking modestly increases alignment with diabetes complication burden.',
      },
      {
        id: 'county_diabetes',
        label: 'County diabetes burden',
        normalizedValue: countyFactor,
        weight: 0.20,
        displayValue: `${diabPrev.toFixed(1)}% adults with diabetes`,
        explanation: 'Higher local diabetes prevalence means the surrounding population context is more diabetes-heavy.',
      },
      {
        id: 'county_inactivity',
        label: 'Physical inactivity context',
        normalizedValue: inactFactor,
        weight: 0.10,
        displayValue: `${(refCounty.health.physicalInactivity || 0).toFixed(1)}% physically inactive`,
        explanation: 'County inactivity levels add broader lifestyle context around disease burden.',
      },
      {
        id: 'age',
        label: 'Age context',
        normalizedValue: ageFactor,
        weight: 0.15,
        displayValue: `${age} years old`,
        explanation: 'Older age increases alignment because diabetes risk rises across adulthood.',
      },
    ];

    return res.json({
      score,
      county: { name: refCounty.name, state: refCounty.state, fips: refCounty.fips },
      countyDiabetesRate: parseFloat(diabPrev.toFixed(1)),
      countyObesityRate: parseFloat((refCounty.health.obesity || 0).toFixed(1)),
      countySmokingRate: parseFloat((refCounty.health.smoking || 0).toFixed(1)),
      countyPhysicalInactivityRate: parseFloat((refCounty.health.physicalInactivity || 0).toFixed(1)),
      population: refCounty.population,
      matchedBy: exactCounty ? 'patient_county' : 'state_demographic_match',
      title: 'Diabetes Context Match',
      summary: exactCounty
        ? `Compares this patient against diabetes-related population patterns in ${refCounty.name}, ${refCounty.state}.`
        : `Compares this patient against a diabetes-related reference county in ${refCounty.state} chosen by the entered state and demographic profile.`,
      interpretation: 'This is a contextual comparison signal built from personal risk markers plus local population burden. It is intended to support clinical interpretation, not replace diagnosis or formal risk scoring.',
      caveat: 'The score blends patient inputs with aggregate county patterns. It should be read as a context lens, not a probability that a patient has or will develop diabetes.',
      factors,
    });
  } catch (err) {
    console.error('similarity-score error:', err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
