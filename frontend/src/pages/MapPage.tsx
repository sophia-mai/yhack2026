import USMap from '../components/Map/USMap';
import InterventionPanel from '../components/Interventions/InterventionPanel';
import SimulationControls from '../components/Simulation/SimulationControls';
import ResultsPanel from '../components/Simulation/ResultsPanel';
import AIPanel from '../components/AI/AIPanel';

export default function MapPage() {
  return (
    <>
      {/* Left panel: intervention builder */}
      <div className="left-panel">
        <InterventionPanel />
        <div className="panel-footer">
          <SimulationControls />
        </div>
      </div>

      {/* Center: map */}
      <USMap />

      {/* Right panel: results + AI */}
      <div className="right-panel">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: '0 0 auto', borderBottom: '1px solid var(--border-subtle)' }}>
            <ResultsPanel />
          </div>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <AIPanel />
          </div>
        </div>
      </div>
    </>
  );
}
