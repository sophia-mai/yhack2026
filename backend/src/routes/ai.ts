import { Router } from 'express';
import { getCountyData } from '../engine/simulation.js';

const router = Router();

const LAVA_CHAT_URL = 'https://api.lava.so/v1/chat/completions';
const DEFAULT_MODEL = process.env.LAVA_MODEL || process.env.CLAUDE_MODEL || 'openai/gpt-4o-mini';
const FAST_MODEL = process.env.LAVA_MODEL_FAST || DEFAULT_MODEL;
const SUMMARY_MODEL = process.env.LAVA_MODEL_SUMMARY || DEFAULT_MODEL;
const DEEP_MODEL = process.env.LAVA_MODEL_DEEP || DEFAULT_MODEL;

type LavaMessage = { role: 'system' | 'user' | 'assistant'; content: string };

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

// POST /api/ai/patient-timeline — generate a branchable timeline from patient data + medical history
router.post('/patient-timeline', async (req, res) => {
  try {
    const { profile, medicalHistory, interventions } = req.body;
    // interventions is optional — set when re-evaluating after applying them

    const currentYear = new Date().getFullYear();
    const birthYear = currentYear - (profile.age || 40);

    const systemPrompt = `You are a clinical data analyst processing patient health records for Prophis. Return ONLY a valid JSON array of health timeline events — no prose, no markdown fences. IMPORTANT: Never use the words "predict", "will develop", or "will have". Instead frame all future events as statistical risk comparisons using phrases like "People with similar profiles commonly experience...", "X% of individuals with these risk factors develop...", or "Risk profile aligns with...". Each object must have: age (number), year (number), type ("past"|"present"|"risk"), title (string, max 7 words, no word "predict"), description (string, 1 sentence using risk similarity framing), severity ("low"|"medium"|"high"|"critical"), category ("diagnosis"|"lifestyle"|"medication"|"screening"|"risk_factor"|"intervention"|"outcome"), avoided (boolean). Rules: 2-4 past events, exactly 1 present, 3-5 risk events ordered by age ascending. If interventions are provided, mark reduced-risk outcomes as avoided=true.`;

    const interventionNote = interventions?.length
      ? `\n\nThe following preventive interventions are now part of this patient's care plan. Re-show the risk profile with improved outcomes. Mark reduced-risk events as avoided=true and describe improved outcomes using phrases like "With this intervention, risk aligns more closely with non-diabetic population profiles.":\n${interventions.map((i: Record<string, string>) => `- ${i.name}: ${i.description}`).join('\n')}`
      : '';

    const userPrompt = `Patient: ${profile.name || 'Patient'}, Age ${profile.age}, ${profile.sex}, BMI ${profile.bmi || 'unknown'}, Ethnicity: ${profile.ethnicity || 'not stated'}, Smoker: ${profile.smoker ? 'Yes' : 'No'}, Family Hx: ${profile.familyHistory || 'none'}.

Medical History:
${(medicalHistory || 'No history provided — infer realistic events from demographics.').slice(0, 800)}
${interventionNote}

Return JSON array only.`;

    const rawText = await callLavaWithFallback({
      primaryModel: DEEP_MODEL,
      fallbackModel: SUMMARY_MODEL,
      maxTokens: 1400,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    // Strip markdown code fences if present
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let timeline: unknown[];
    try {
      timeline = JSON.parse(cleaned);
    } catch {
      // Partial recovery: response was cut off mid-JSON — salvage complete objects
      // Find the last complete event closing brace before the truncation
      const lastComplete = cleaned.lastIndexOf('},');
      const lastCompleteAlt = cleaned.lastIndexOf('}\n]');
      const cutAt = Math.max(lastComplete, lastCompleteAlt);
      if (cutAt !== -1) {
        try {
          const recovered = cleaned.slice(0, cutAt + 1) + '\n]';
          timeline = JSON.parse(recovered);
          console.warn(`patient-timeline: JSON was truncated, recovered ${(timeline as unknown[]).length} events`);
        } catch {
          return res.status(500).json({ error: 'Failed to parse timeline response', raw: rawText });
        }
      } else {
        return res.status(500).json({ error: 'Failed to parse timeline response', raw: rawText });
      }
    }

    return res.json({ timeline });
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
