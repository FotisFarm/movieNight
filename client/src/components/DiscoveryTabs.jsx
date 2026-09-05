import { NavLink } from 'react-router-dom';
import './DiscoveryTabs.css';

const TABS = [
  {
    to: '/rankings',
    label: 'Leaderboards',
    icon: '🏆',
    sub: 'Top 10s, Directors & Decades',
    exact: true,
  },
  {
    to: '/recommendations',
    label: 'Smart Picks',
    icon: '🎯',
    sub: 'Bayesian Recommendations',
  },
  {
    to: '/controversy',
    label: 'Controversy',
    icon: '⚡',
    sub: 'Polarization & Divergence',
  },
];

export default function DiscoveryTabs() {
  return (
    <nav className="discovery-nav" aria-label="Discovery Hub Views">
      <div className="discovery-tabs" role="tablist">
        {TABS.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.exact}
            role="tab"
            className={({ isActive }) =>
              `discovery-tab ${isActive ? 'active' : ''}`
            }
          >
            <span className="discovery-tab-icon" aria-hidden="true">
              {tab.icon}
            </span>
            <div className="discovery-tab-info">
              <span className="discovery-tab-title">{tab.label}</span>
              <span className="discovery-tab-sub">{tab.sub}</span>
            </div>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
