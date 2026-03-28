import { Router } from 'express';
import { getCountyData, getInterventions, simulateCounty } from '../engine/simulation.js';

const router = Router();

// POST /api/optimize — greedy QALY-maximizing allocator
router.post('/', (req, res) => {
  try {
    const {
      countyFips,
      budgetTotal = 1_000_000,
      objectiveMetric = 'qalysGained',
      timeHorizonYears = 5,
      targetingStrategy = 'all',
    } = req.body as {
      countyFips?: string[];
      budgetTotal: number;
      objectiveMetric: string;
      timeHorizonYears: number;
      targetingStrategy: string;
    };

    const allCounties = getCountyData();
    const allInterventions = getInterventions();

    const targetCounties = countyFips
      ? allCounties.filter(c => countyFips.includes(c.fips))
      : allCounties.slice(0, 500); // limit for performance

    // Greedy allocation: score each intervention–targeting combo
    const candidates = allInterventions.map(interv => {
      const testBudget = Math.min(budgetTotal * 0.3, 500_000);
      const testInput = [{ id: interv.id, budget: testBudget, targeting: targetingStrategy }];

      let totalScore = 0;
      for (const county of targetCounties) {
        const result = simulateCounty(county, testInput, allInterventions, timeHorizonYears);
        totalScore += result.qalysGained;
      }

      const roi = totalScore / (testBudget * targetCounties.length / 1_000_000);
      return {
        intervention: interv,
        estimatedQalys: Math.round(totalScore),
        roi: Math.round(roi * 100) / 100,
        recommendedBudgetShare: 0,
      };
    });

    // Sort by ROI, allocate budget greedily
    candidates.sort((a, b) => b.roi - a.roi);

    let remaining = budgetTotal;
    const allocation: typeof candidates = [];

    for (const candidate of candidates.slice(0, 8)) {
      if (remaining <= 0) break;
      const share = Math.min(remaining, budgetTotal / Math.min(candidates.length, 5));
      candidate.recommendedBudgetShare = Math.round(share);
      remaining -= share;
      allocation.push(candidate);
    }

    // Fill remaining to first-ranked
    if (remaining > 0 && allocation.length > 0) {
      allocation[0].recommendedBudgetShare += remaining;
    }

    const totalQalys = allocation.reduce((s, a) => s + a.estimatedQalys, 0);

    res.json({
      totalBudget: budgetTotal,
      targetingStrategy,
      timeHorizonYears,
      totalEstimatedQalys: totalQalys,
      costPerQaly: totalQalys > 0 ? Math.round(budgetTotal / totalQalys) : 0,
      allocation: allocation.map(a => ({
        interventionId: a.intervention.id,
        interventionName: a.intervention.name,
        category: a.intervention.category,
        icon: a.intervention.icon,
        recommendedBudget: a.recommendedBudgetShare,
        estimatedQalys: a.estimatedQalys,
        roi: a.roi,
        budgetPct: Math.round((a.recommendedBudgetShare / budgetTotal) * 100),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
