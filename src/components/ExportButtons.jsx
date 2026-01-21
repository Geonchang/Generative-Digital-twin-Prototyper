// TODO: implement

import { useState } from 'react';
import useBopStore from '../store/bopStore';
import { api } from '../services/api';

function ExportButtons() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { bopData } = useBopStore();

  const handleExportExcel = async () => {
    if (!bopData || !bopData.steps || bopData.steps.length === 0) {
      setError('먼저 BOP를 생성해주세요');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.exportExcel(bopData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport3D = async () => {
    if (!bopData || !bopData.steps || bopData.steps.length === 0) {
      setError('먼저 BOP를 생성해주세요');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.export3D(bopData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>내보내기</h2>
      {error && <div style={styles.error}>{error}</div>}
      <div style={styles.buttonGroup}>
        <button
          style={styles.button}
          onClick={handleExportExcel}
          disabled={loading}
        >
          Excel 내보내기
        </button>
        <button
          style={{ ...styles.button, ...styles.buttonSecondary }}
          onClick={handleExport3D}
          disabled={loading}
        >
          3D JSON 내보내기
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
  },
  title: {
    margin: '0 0 15px 0',
    fontSize: '18px',
    fontWeight: 'bold',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  button: {
    padding: '10px',
    backgroundColor: '#4a90e2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  buttonSecondary: {
    backgroundColor: '#888',
  },
  error: {
    color: '#ff6b6b',
    fontSize: '14px',
    marginBottom: '10px',
  },
};

export default ExportButtons;
