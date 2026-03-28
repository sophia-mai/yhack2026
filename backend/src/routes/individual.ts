import { Router } from 'express';
import { getInterventions } from '../engine/simulation.js';

const router = Router();

interface IndividualProfile {
  age: number;
  sex: 'male' | 'female';
  bmi: number;
  smoker: boolean;
  diabetic: boolean;
  incomeQuartile: 1 | 2 | 3 | 4; // 1=lowest
  countyFips?: string;
  countyName?: string;
}

// POST /api/individual
router.post('/', (req, res) => {
  try {
    const { profile, interventionIds = [], timeHorizonYears = 10 } = req.body as {
      profile: IndividualProfile;
      interventionIds: string[];
      timeHorizonYears: number;
    };

    const allInterventions = getInterventions();
    const selectedDefs = allInterventions.filter(i => interventionIds.includes(i.id));

    // Baseline risk scores (0–100 scale; higher = worse)
    const baseline = {
      cardiovascularRisk: calcCardioRisk(profile),
      diabetesRisk: calcDiabetesRisk(profile),
      mentalHealthRisk: calcMentalRisk(profile),
      mortalityRisk: calcMortalityRisk(profile),
      qualityOfLife: calcQoL(profile),
    };

    // Build yearly trajectory
    const trajectory: Array<{
      year: number;
      cardiovascularRisk: number;
      diabetesRisk: number;
      mentalHealthRisk: number;
      mortalityRisk: number;
      qualityOfLife: number;
    }> = [];

    for (let y = 0; y <= timeHorizonYears; y++) {
      const agingPenalty = y * 0.4;
      const interventionBenefit = selectedDefs.reduce((acc, def) => {
        const maturation = Math.min(1, y / 3); // interventions take time to work
        const incomeBonus = (5 - profile.incomeQuartile) * 0.1; // lower income benefits more
        return acc + maturation * (1 + incomeBonus);
      }, 0);

      trajectory.push({
        year: y,
        cardiovascularRisk: Math.max(0, Math.min(100, baseline.cardiovascularRisk + agingPenalty - interventionBenefit * 1.2)),
        diabetesRisk: Math.max(0, Math.min(100, baseline.diabetesRisk + agingPenalty * 0.6 - interventionBenefit * 0.9)),
        mentalHealthRisk: Math.max(0, Math.min(100, baseline.mentalHealthRisk + agingPenalty * 0.3 - interventionBenefit * 1.0)),
        mortalityRisk: Math.max(0, Math.min(100, baseline.mortalityRisk + agingPenalty * 0.5 - interventionBenefit * 0.8)),
        qualityOfLife: Math.max(0, Math.min(100, baseline.qualityOfLife - agingPenalty * 0.2 + interventionBenefit * 0.7)),
      });
    }

    const finalYear = trajectory[trajectory.length - 1];
    const qalysGained = selectedDefs.length > 0
      ? Math.round((finalYear.qualityOfLife - baseline.qualityOfLife) * timeHorizonYears * 0.01)
      : 0;

    res.json({
      profile,
      baseline,
      trajectory,
      summary: {
        qalysGained,
        cardiovascularRiskReduction: Math.round(baseline.cardiovascularRisk - finalYear.cardiovascularRisk),
        diabetesRiskReduction: Math.round(baseline.diabetesRisk - finalYear.diabetesRisk),
        qualityOfLifeGain: Math.round(finalYear.qualityOfLife - baseline.qualityOfLife),
        keyBenefits: selectedDefs.map(d => ({ id: d.id, name: d.name, icon: d.icon })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function calcCardioRisk(p: IndividualProfile): number {
  let risk = 15 + (p.age - 40) * 0.8;
  if (p.smoker) risk += 12;
  if (p.bmi > 30) risk += (p.bmi - 30) * 1.5;
  if (p.diabetic) risk += 10;
  if (p.incomeQuartile === 1) risk += 8;
  return Math.round(Math.min(95, Math.max(5, risk)));
}

function calcDiabetesRisk(p: IndividualProfile): number {
  let risk = p.diabetic ? 70 : 10;
  if (p.bmi > 25) risk += (p.bmi - 25) * 2;
  if (p.age > 45) risk += (p.age - 45) * 0.5;
  if (p.incomeQuartile <= 2) risk += 8;
  return Math.round(Math.min(95, Math.max(5, risk)));
}

function calcMentalRisk(p: IndividualProfile): number {
  let risk = 20;
  if (p.incomeQuartile === 1) risk += 15;
  else if (p.incomeQuartile === 2) risk += 8;
  if (p.smoker) risk += 6;
  if (p.age > 65) risk += 5;
  return Math.round(Math.min(90, Math.max(5, risk)));
}

function calcMortalityRisk(p: IndividualProfile): number {
  let risk = 5 + (p.age - 40) * 0.6;
  if (p.smoker) risk += 10;
  if (p.diabetic) risk += 8;
  if (p.bmi > 35) risk += 6;
  if (p.incomeQuartile === 1) risk += 10;
  return Math.round(Math.min(90, Math.max(1, risk)));
}

function calcQoL(p: IndividualProfile): number {
  let qol = 80;
  if (p.smoker) qol -= 6;
  if (p.diabetic) qol -= 8;
  if (p.bmi > 30) qol -= (p.bmi - 30) * 0.8;
  if (p.incomeQuartile === 1) qol -= 10;
  else if (p.incomeQuartile === 2) qol -= 5;
  if (p.age > 70) qol -= (p.age - 70) * 0.5;
  return Math.round(Math.min(100, Math.max(20, qol)));
}

export default router;
