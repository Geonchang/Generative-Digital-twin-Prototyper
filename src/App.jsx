import { useEffect } from 'react';
import Viewer3D from './components/Viewer3D';
import TabbedPanel from './components/TabbedPanel';
import UnifiedChatPanel from './components/UnifiedChatPanel';
import useBopStore from './store/bopStore';
import { mockBopData } from './data/mockBopData';

function App() {
  const { bopData, setBopData } = useBopStore();

  // Load mock data on initial mount if no BOP data exists
  useEffect(() => {
    if (!bopData) {
      console.log('[APP] Loading mock BOP data...');
      setBopData(mockBopData);
    }
  }, [bopData, setBopData]);

  return (
    <div style={styles.container}>
      {/* 왼쪽: 탭 패널 (BOP, 장비, 작업자, 자재) */}
      <div style={styles.tableSection}>
        <TabbedPanel />
      </div>

      {/* 중간: 3D 뷰어 */}
      <div style={styles.viewerSection}>
        <Viewer3D />
      </div>

      {/* 오른쪽: AI 어시스턴트 패널 */}
      <div style={styles.controlSection}>
        <UnifiedChatPanel />
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
  },
  viewerSection: {
    flex: '1.5',
    position: 'relative',
    minWidth: '400px',
  },
  tableSection: {
    flex: '1',
    borderLeft: '1px solid #ddd',
    borderRight: '1px solid #ddd',
    minWidth: '350px',
    overflow: 'hidden',
  },
  controlSection: {
    width: '400px',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'white',
    overflow: 'hidden',
  },
};

export default App
