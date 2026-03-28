import { Router } from 'express';
import { getCountyData, getInterventions, simulateCounty, InterventionInput } from '../engine/simulation.js';

const router = Router();

// POST /api/simulate
router.post('/', (req, res) => {
  try {
    const {
      countyFips,           // string[] | null — null means all counties
      interventions = [],   // InterventionInput[]
      budgetTotal,          // number
      timeHorizonYears = 5, // number
      objective = '',       // string (for logging/AI context)
    } = req.body as {
      countyFips?: string[] | null;
      interventions: InterventionInput[];
      budgetTotal: number;
      timeHorizonYears: number;
      objective: string;
    };

    const allCounties = getCountyData();
    const allInterventions = getInterventions();

    // Filter counties
    const targetCounties = countyFips
      ? allCounties.filter(c => countyFips.includes(c.fips))
      : allCounties;

    if (targetCounties.length === 0) {
      return res.status(400).json({ error: 'No counties matched the provided FIPS codes.' });
    }

    // Distribute interventions — if no specific budget provided, split evenly
    const results = targetCounties.map(county =>
      simulateCounty(county, interventions, allInterventions, timeHorizonYears)
    );

    // Aggregate summary
    const totalPop = results.reduce((s, r) => s + r.population, 0);
    const totalQalys = results.reduce((s, r) => s + r.qalysGained, 0);
    const avgCostPerQaly = totalQalys > 0 ? Math.round(budgetTotal / totalQalys) : 0;

    // National equity metrics (Gini-like disparity)
    const obesityValues = results.map(r => r.projected.obesity).sort((a, b) => a - b);
    const n = obesityValues.length;
    const gini = n > 1 ? calculateGini(obesityValues) : 0;

    // Top improved counties
    const topImproved = results
      .sort((a, b) => b.qalysGained - a.qalysGained)
      .slice(0, 10)
      .map(r => ({ fips: r.fips, name: r.name, state: r.state, qalysGained: r.qalysGained }));

    return res.json({
      summary: {
        countiesAnalyzed: results.length,
        totalPopulation: totalPop,
        totalQalysGained: totalQalys,
        avgCostPerQaly,
        giniCoefficient: Math.round(gini * 1000) / 1000,
        objective,
        timeHorizonYears,
        budgetTotal,
      },
      topImproved,
      results: results.map(r => ({
        fips: r.fips,
        name: r.name,
        state: r.state,
        population: r.population,
        absoluteChange: r.absoluteChange,
        pctChange: r.pctChange,
        qalysGained: r.qalysGained,
        costPerQaly: r.costPerQaly,
        equityScore: r.equityScore,
        projected: r.projected,
        baseline: r.baseline,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
});

function calculateGini(sortedValues: number[]): number {
  const n = sortedValues.length;
  if (n === 0) return 0;
  const mean = sortedValues.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;
  let sumDiffs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiffs += Math.abs(sortedValues[i] - sortedValues[j]);
    }
  }
  return sumDiffs / (2 * n * n * mean);
}

export default router;
