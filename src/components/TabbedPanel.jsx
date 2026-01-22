import BopTable from './BopTable';
import EquipmentsTable from './EquipmentsTable';
import WorkersTable from './WorkersTable';
import MaterialsTable from './MaterialsTable';
import useBopStore from '../store/bopStore';

function TabbedPanel() {
  const { activeTab, setActiveTab } = useBopStore();

  const tabs = [
    { id: 'bop', label: 'BOP', icon: '📋' },
    { id: 'equipments', label: '장비', icon: '🤖' },
    { id: 'workers', label: '작업자', icon: '👷' },
    { id: 'materials', label: '자재', icon: '📦' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'bop':
        return <BopTable />;
      case 'equipments':
        return <EquipmentsTable />;
      case 'workers':
        return <WorkersTable />;
      case 'materials':
        return <MaterialsTable />;
      default:
        return <BopTable />;
    }
  };

  return (
    <div style={styles.container}>
      {/* Tab Buttons */}
      <div style={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            style={{
              ...styles.tabButton,
              ...(activeTab === tab.id ? styles.tabButtonActive : {}),
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            <span style={styles.tabIcon}>{tab.icon}</span>
            <span style={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={styles.tabContent}>
        {renderContent()}
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '2px solid #ddd',
    backgroundColor: '#fafafa',
  },
  tabButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '12px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    color: '#666',
    transition: 'all 0.2s',
    borderBottom: '3px solid transparent',
  },
  tabButtonActive: {
    color: '#4a90e2',
    backgroundColor: 'white',
    borderBottom: '3px solid #4a90e2',
  },
  tabIcon: {
    fontSize: '16px',
  },
  tabLabel: {
    fontSize: '13px',
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
    overflow: 'hidden',
  },
};

export default TabbedPanel;
