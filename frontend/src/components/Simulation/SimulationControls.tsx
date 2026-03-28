import { useStore } from '../../store/useStore';
import { runSimulation } from '../../api/client';
import type { HealthMetric, MapMode } from '../../types';
import { HEALTH_METRIC_LABELS } from '../../types';

const METRICS: HealthMetric[] = ['obesity', 'smoking', 'diabetes', 'physicalInactivity', 'mentalHealth', 'heartDisease', 'copd', 'checkups'];
const MAP_MODES: { id: MapMode; label: string }[] = [
  { id: 'baseline', label: 'Baseline' },
  { id: 'impact', label: 'Impact' },
  { id: 'vulnerability', label: 'Vulnerability' },
  { id: 'equity', label: 'Equity' },
];

export default function SimulationControls() {
  const {
    activeInterventions, budgetTotal, timeHorizon, objective,
    isSimulating, setIsSimulating, setSimulationResult, simulationResult,
    selectedMetric, setSelectedMetric, mapMode, setMapMode,
  } = useStore();

  const canSimulate = activeInterventions.length > 0 && !isSimulating;

  async function handleSimulate() {
    if (!canSimulate) return;
    setIsSimulating(true);
    try {
      const result = await runSimulation({
        countyFips: null, // all counties
        interventions: activeInterventions,
        budgetTotal,
        timeHorizonYears: timeHorizon,
        objective,
      });
      setSimulationResult(result);
    } catch (err) {
      console.error('Simulation error:', err);
      alert(`Simulation failed: ${err}. Make sure the backend is running on port 3001.`);
    } finally {
      setIsSimulating(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Map Mode switcher */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="section-label">Map Layer</div>
        <div className="radio-pills" style={{ marginTop: 6 }}>
          {MAP_MODES.map(m => (
            <button
              key={m.id}
              id={`map-mode-${m.id}`}
              className={`radio-pill${mapMode === m.id ? ' active' : ''}`}
              onClick={() => setMapMode(m.id)}
              disabled={m.id === 'impact' && !simulationResult}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric selector */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="section-label">Health Metric</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
          {METRICS.map(m => (
            <button
              key={m}
              className={`map-control-btn${selectedMetric === m ? ' active' : ''}`}
              id={`metric-${m}`}
              onClick={() => setSelectedMetric(m)}
              style={{ borderBottom: 'none', padding: '5px 8px', textAlign: 'left', fontSize: 12 }}
            >
              {HEALTH_METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Run Simulation */}
      <div style={{ padding: 12 }}>
        <button
          id="run-simulation-btn"
          className="btn btn-primary btn-full"
          onClick={handleSimulate}
          disabled={!canSimulate}
        >
          {isSimulating ? (
            <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} /> Running…</>
          ) : (
            <>▶ Run Simulation</>
          )}
        </button>
        {activeInterventions.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, textAlign: 'center' }}>
            Select at least one intervention to simulate
          </div>
        )}
      </div>
    </div>
  );
}
