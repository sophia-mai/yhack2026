import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import geographyRouter from './routes/geography.js';
import simulateRouter from './routes/simulate.js';
import optimizeRouter from './routes/optimize.js';
import individualRouter from './routes/individual.js';
import aiRouter from './routes/ai.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/geography', geographyRouter);
app.use('/api/simulate', simulateRouter);
app.use('/api/optimize', optimizeRouter);
app.use('/api/individual', individualRouter);
app.use('/api/ai', aiRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n🚀 PulsePolicy API running on http://localhost:${PORT}\n`);
});

export default app;
