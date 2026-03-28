import { useEffect } from 'react';
import { useStore } from './store/useStore';
import type { TabId } from './types';
import USMap from './components/Map/USMap';
import MapPage from './pages/MapPage';
import ComparePage from './pages/ComparePage';
import IndividualPage from './pages/IndividualPage';
import OptimizerPage from './pages/OptimizerPage';

const TABS: { id: TabId; label: string; icon: string; navIcon: string }[] = [
  { id: 'map', label: 'Intervention Map', icon: '🗺️', navIcon: '🗺️' },
  { id: 'compare', label: 'Compare Scenarios', icon: '⚖️', navIcon: '⚖️' },
  { id: 'individual', label: 'Individual Impact', icon: '👤', navIcon: '👤' },
  { id: 'optimizer', label: 'Budget Optimizer', icon: '📈', navIcon: '📈' },
];

export default function App() {
  const { activeTab, setActiveTab, setCounties, setInterventions } = useStore();

  // Load static data on mount
  useEffect(() => {
    fetch('/data/counties_health.json')
      .then(r => r.json())
      .then(data => setCounties(data))
      .catch(console.error);

    fetch('/data/interventions.json')
      .then(r => r.json())
      .then(data => setInterventions(data))
      .catch(console.error);
  }, [setCounties, setInterventions]);

  return (
    <>
      <div className="texture-overlay" />
      <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <a className="logo" href="#" style={{ letterSpacing: '-0.02em', fontSize: 20 }}>
          <div className="logo-icon" style={{ boxShadow: '0 0 24px rgba(0,212,170,0.4)', fontSize: 18 }}>✨</div>
          <span style={{ fontWeight: 800 }}>
            PR<span className="text-gradient">OPHIS</span>
          </span>
        </a>

        <nav className="header-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              className={`header-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="header-right">
          <div className="status-badge">
            <div className="status-dot" />
            <span>3,142 counties loaded</span>
          </div>
        </div>
      </header>

      {/* Side Nav */}
      <nav className="side-nav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`nav-icon-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
          >
            {tab.navIcon}
          </button>
        ))}
      </nav>

        {/* Global Background Map */}
        <div className={`global-map-layer ${activeTab !== 'map' ? 'map-dimmed' : ''}`}>
          <USMap />
        </div>

        {/* Page Content Layers */}
        {activeTab === 'map' && <MapPage />}
        {activeTab === 'compare' && <ComparePage />}
        {activeTab === 'individual' && <IndividualPage />}
        {activeTab === 'optimizer' && <OptimizerPage />}
      </div>
    </>
  );
}
