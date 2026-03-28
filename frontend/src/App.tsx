import { useEffect } from 'react';
import { useStore } from './store/useStore';
import type { CountyRecord, TabId } from './types';
import USMap from './components/Map/USMap';
import MapPage from './pages/MapPage';
import ComparePage from './pages/ComparePage';
import IndividualPage from './pages/IndividualPage';

const STATE_ABBREV: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

function safeNum(val: unknown): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformCounty(raw: any): CountyRecord {
  const g = (category: string, field: string): number =>
    safeNum((raw[category] as Record<string, unknown>)?.[field]);

  const pctPoverty      = g('Children in Poverty', '% Children in Poverty');
  const pctUninsured    = g('Uninsured', '% Uninsured');
  const pctElderly      = g('% 65 and Older', '% 65 and Over');
  const pctBlack        = g('% Non-Hispanic Black', '% Non-Hispanic Black');
  const pctHispanic     = g('% Hispanic', '% Hispanic');
  const pctWhite        = g('% Non-Hispanic White', '% Non-Hispanic White');
  const pctRural        = g('% Rural', '% Rural');
  const pctUnemployed   = g('Unemployment', '% Unemployed');
  const pctSingleParent = g('Children in Single-Parent Households', '% Children in Single-Parent Households');
  const pctHousingProb  = g('Severe Housing Problems', '% Severe Housing Problems');

  const sviSocioeconomic    = Math.min(1, (pctPoverty / 30 + pctUnemployed / 15) / 2);
  const sviHouseholdComp    = Math.min(1, (pctSingleParent / 50 + pctPoverty / 40) / 2);
  const sviMinority         = Math.min(1, (pctBlack + pctHispanic) / 100);
  const sviHousingTransport = Math.min(1, pctHousingProb / 40);
  const sviOverall = (sviSocioeconomic + sviHouseholdComp + sviMinority + sviHousingTransport) / 4;

  return {
    fips:      raw.fips as string,
    name:      raw.county as string,
    state:     STATE_ABBREV[raw.state as string] ?? (raw.state as string).slice(0, 2).toUpperCase(),
    stateName: raw.state as string,
    population: g('Population', 'Population'),
    isUrban: pctRural < 20,
    demographics: { pctPoverty, pctUninsured, pctElderly, pctBlack, pctHispanic, pctWhite },
    health: {
      obesity:            g('Adult Obesity', '% Adults with Obesity'),
      smoking:            g('Adult Smoking', '% Adults Reporting Currently Smoking'),
      diabetes:           g('Diabetes Prevalence', '% Adults with Diabetes'),
      physicalInactivity: g('Physical Inactivity', '% Physically Inactive'),
      mentalHealth:       g('Frequent Mental Distress', '% Frequent Mental Distress'),
      heartDisease:       g('Insufficient Sleep', '% Insufficient Sleep'),
      copd:               g('Excessive Drinking', '% Excessive Drinking'),
      checkups:           g('Flu Vaccinations', '% Vaccinated'),
      mortalityRate:      g('Premature Death', 'Years of Potential Life Lost Rate'),
    },
    environment: {
      aqiPM25: g('Air Pollution: Particulate Matter', 'Average Daily PM2.5'),
      aqiO3:   g('Poor Physical Health Days', 'Average Number of Physically Unhealthy Days'),
    },
    svi: {
      overall:          sviOverall,
      socioeconomic:    sviSocioeconomic,
      householdComp:    sviHouseholdComp,
      minority:         sviMinority,
      housingTransport: sviHousingTransport,
    },
  };
}

const TABS: { id: TabId; label: string; icon: string; navIcon: string }[] = [
  { id: 'map', label: 'Intervention Map', icon: '🗺️', navIcon: '🗺️' },
  { id: 'compare', label: 'Compare Scenarios', icon: '⚖️', navIcon: '⚖️' },
  { id: 'individual', label: 'Individual Impact', icon: '👤', navIcon: '👤' },
];

export default function App() {
  const { activeTab, setActiveTab, setCounties, setInterventions } = useStore();

  // Load static data on mount
  useEffect(() => {
    fetch('/data/county_health_data_full.json')
      .then(r => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((data: any[]) => setCounties(data.map(transformCounty)))
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
        <div className="header-left">
          <a className="logo" href="#" style={{ letterSpacing: '-0.02em', fontSize: 20 }}>
            <div className="logo-icon" style={{ boxShadow: '0 0 24px rgba(0,212,170,0.4)', fontSize: 18 }}>✨</div>
            <span style={{ fontWeight: 800 }}>
              PR<span className="text-gradient">OPHIS</span>
            </span>
          </a>
          <div className="header-divider" />
          <div className="header-breadcrumb">
            <span className="breadcrumb-icon">{TABS.find(t => t.id === activeTab)?.icon}</span>
            {TABS.find(t => t.id === activeTab)?.label}
          </div>
        </div>



        <div className="header-right">
          <div className="status-badge">
            <div className="status-dot" />
            <span>3,142 counties</span>
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
      </div>
    </>
  );
}
