import { Router } from 'express';
import { getCountyData } from '../engine/simulation.js';

const router = Router();

const LAVA_FORWARD_URL = 'https://api.lavapayments.com/v1/forward?u=https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

function getLavaToken(): string {
  const token = process.env.LAVA_FORWARD_TOKEN;
  if (!token) throw new Error('LAVA_FORWARD_TOKEN is not set in environment');
  return token;
}

function getLavaSecret(): string {
  const secret = process.env.LAVA_SECRET_KEY;
  if (!secret) throw new Error('LAVA_SECRET_KEY is not set in environment');
  return secret;
}

// POST /api/ai/summarize — streaming summary via Lava
router.post('/summarize', async (req, res) => {
  try {
    const { simulationSummary, interventions, objective, countyCount } = req.body;
    const prompt = buildPrompt(simulationSummary, interventions, objective, countyCount);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const claudeRes = await fetch(LAVA_FORWARD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getLavaToken()}`,
        'x-api-key': getLavaSecret(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        stream: true,
        system: `You are a public health policy expert and data scientist. You analyze simulation results from PulsePolicy, a decision-support tool for public health interventions. Your summaries are clear, evidence-based, and equity-focused. Write in a professional but accessible tone. Use specific numbers from the data. Structure your response with clear sections.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok || !claudeRes.body) {
      const errText = await claudeRes.text();
      res.write(`data: ${JSON.stringify({ error: `Lava API error: ${claudeRes.status} ${errText}` })}\n\n`);
      res.end();
      return;
    }

    const reader = claudeRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep incomplete last line

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim();
          if (raw === '[DONE]' || !raw) continue;
          try {
            const event = JSON.parse(raw);
            // Lava-forwarded streaming events: content_block_delta carries text
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              const text = event.delta.text ?? '';
              if (text) res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
            }
            if (event.type === 'message_stop') {
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            }
          } catch { /* skip malformed lines */ }
        }
      }
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
    const { county, metric, value, percentile } = req.body;

    const claudeRes = await fetch(LAVA_FORWARD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getLavaToken()}`,
        'x-api-key': getLavaSecret(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `In 2 sentences, explain the public health significance of ${county} having a ${metric} rate of ${value}% (${percentile}th percentile nationally). Focus on impact and actionable framing.`,
        }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return res.status(claudeRes.status).json({ error: err });
    }

    const data = await claudeRes.json() as { content: Array<{ text: string }> };
    return res.json({ insight: data.content[0]?.text ?? '' });
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

    const claudeRes = await fetch(LAVA_FORWARD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getLavaToken()}`,
        'x-api-key': getLavaSecret(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return res.status(claudeRes.status).json({ error: `Lava API error: ${claudeRes.status} ${err}` });
    }

    const data = await claudeRes.json() as { content: Array<{ text: string }> };
    const rawText = data.content[0]?.text ?? '[]';

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
          return res.status(500).json({ error: 'Failed to parse Lava timeline response', raw: rawText });
        }
      } else {
        return res.status(500).json({ error: 'Failed to parse Lava timeline response', raw: rawText });
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
    // profile: { age, sex, ethnicity, bmi, smoker, state }
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

    // 2. Pick county with highest demographic match for patient's ethnicity
    const ethnLower = (profile.ethnicity || '').toLowerCase();
    const getEthScore = (c: ReturnType<typeof getCountyData>[0]) => {
      if (ethnLower.includes('black') || ethnLower.includes('african')) return c.demographics.pctBlack;
      if (ethnLower.includes('hispanic') || ethnLower.includes('latin')) return c.demographics.pctHispanic;
      if (ethnLower.includes('white') || ethnLower.includes('caucasian')) return c.demographics.pctWhite;
      return 100 - c.demographics.pctBlack - c.demographics.pctHispanic; // default to majority non-minority
    };
    const refCounty = refPool.reduce((best, c) => getEthScore(c) > getEthScore(best) ? c : best, refPool[0]);

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

    return res.json({
      score,
      county: { name: refCounty.name, state: refCounty.state, fips: refCounty.fips },
      countyDiabetesRate: parseFloat(diabPrev.toFixed(1)),
      countyObesityRate: parseFloat((refCounty.health.obesity || 0).toFixed(1)),
      countySmokingRate: parseFloat((refCounty.health.smoking || 0).toFixed(1)),
      population: refCounty.population,
    });
  } catch (err) {
    console.error('similarity-score error:', err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
