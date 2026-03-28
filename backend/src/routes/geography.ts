import { Router } from 'express';
import { getCountyData } from '../engine/simulation.js';

const router = Router();

// GET /api/geography?state=AL&fips=01001
router.get('/', (req, res) => {
  try {
    const { state, fips, limit } = req.query as Record<string, string>;
    let data = getCountyData();

    if (state) data = data.filter(c => c.state === state.toUpperCase());
    if (fips) {
      const fipsList = fips.split(',');
      data = data.filter(c => fipsList.includes(c.fips));
    }
    if (limit) data = data.slice(0, parseInt(limit, 10));

    res.json({ count: data.length, counties: data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/geography/states — aggregate by state
router.get('/states', (_req, res) => {
  try {
    const data = getCountyData();
    const stateMap = new Map<string, { state: string; stateName: string; counties: number; population: number; avgObesity: number; avgSVI: number }>();

    for (const c of data) {
      if (!stateMap.has(c.state)) {
        stateMap.set(c.state, { state: c.state, stateName: c.stateName, counties: 0, population: 0, avgObesity: 0, avgSVI: 0 });
      }
      const s = stateMap.get(c.state)!;
      s.counties++;
      s.population += c.population;
      s.avgObesity += c.health.obesity;
      s.avgSVI += c.svi.overall;
    }

    const states = Array.from(stateMap.values()).map(s => ({
      ...s,
      avgObesity: Math.round(s.avgObesity / s.counties * 10) / 10,
      avgSVI: Math.round(s.avgSVI / s.counties * 1000) / 1000,
    }));

    res.json({ states });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
