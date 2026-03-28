import { Router } from 'express';

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

// POST /api/ai/summarize — streaming summary via Claude + Lava
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
      res.write(`data: ${JSON.stringify({ error: `Claude API error: ${claudeRes.status} ${errText}` })}\n\n`);
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
            // Claude streaming events: content_block_delta carries text
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
    console.error('Claude/Lava error:', err);
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

    const systemPrompt = `You are a clinical AI. Return ONLY a valid JSON array of health timeline events — no prose, no markdown fences. Each object must have: age (number), year (number), type ("past"|"present"|"predicted"|"warning"), title (string, max 7 words), description (string, 1 sentence), severity ("low"|"medium"|"high"|"critical"), category ("diagnosis"|"lifestyle"|"medication"|"screening"|"risk_factor"|"intervention"|"outcome"), avoided (boolean). Rules: include 2-4 past events, exactly 1 present, and 3-5 future predictions ordered by age ascending. If interventions are provided, mark prevented bad outcomes as avoided=true.`;

    const interventionNote = interventions?.length
      ? `\n\nThe following preventive interventions have now been APPLIED to this patient. Re-project the future accordingly, showing improved outcomes and marking any previously bad predictions as avoided:\n${interventions.map((i: Record<string, string>) => `- ${i.name}: ${i.description}`).join('\n')}`
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
      return res.status(claudeRes.status).json({ error: `Claude API error: ${claudeRes.status} ${err}` });
    }

    const data = await claudeRes.json() as { content: Array<{ text: string }> };
    const rawText = data.content[0]?.text ?? '[]';

    // Strip markdown code fences if present
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let timeline: unknown[];
    try {
      timeline = JSON.parse(cleaned);
    } catch {
      // Partial recovery: Claude was cut off mid-JSON — salvage complete objects
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
          return res.status(500).json({ error: 'Failed to parse Claude timeline response', raw: rawText });
        }
      } else {
        return res.status(500).json({ error: 'Failed to parse Claude timeline response', raw: rawText });
      }
    }

    return res.json({ timeline });
  } catch (err) {
    console.error('patient-timeline error:', err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;

