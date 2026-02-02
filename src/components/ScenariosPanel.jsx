import { useState, useEffect, useRef } from 'react';
import useBopStore from '../store/bopStore';
import * as XLSX from 'xlsx';

function ScenariosPanel() {
  const {
    exportBopData,
    setBopData,
    addMessage,
    normalizeAllProcesses,
    bopData,
    saveScenario,
    loadScenario,
    deleteScenario,
    listScenarios,
    createNewScenario
  } = useBopStore();

  // Scenario Management
  const [scenarios, setScenarios] = useState([]);
  const [scenarioName, setScenarioName] = useState('');
  const [showScenarioList, setShowScenarioList] = useState(false);

  // Scenario Comparison
  const [selectedForComparison, setSelectedForComparison] = useState([]);

  // Error
  const [error, setError] = useState('');

  const jsonUploadRef = useRef(null);
  const excelUploadRef = useRef(null);

  // Load scenario list on mount
  useEffect(() => {
    loadScenarioList();
  }, []);

  const loadScenarioList = () => {
    try {
      const list = listScenarios();
      setScenarios(list);
    } catch (err) {
      setError('시나리오 목록 로드 오류: ' + err.message);
    }
  };

  // === Scenario Management ===

  const handleSaveScenario = () => {
    if (!scenarioName.trim()) {
      setError('시나리오 이름을 입력하세요.');
      return;
    }

    if (!bopData) {
      setError('저장할 BOP 데이터가 없습니다.');
      return;
    }

    try {
      saveScenario(scenarioName.trim());
      loadScenarioList();
      setScenarioName('');
      addMessage('assistant', `시나리오 "${scenarioName.trim()}"이(가) 저장되었습니다.`);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLoadScenario = (id) => {
    try {
      loadScenario(id);
      const scenario = scenarios.find(s => s.id === id);
      addMessage('assistant', `시나리오 "${scenario?.name}"을(를) 불러왔습니다.`);
      setShowScenarioList(false);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteScenario = (id) => {
    const scenario = scenarios.find(s => s.id === id);
    if (!confirm(`"${scenario?.name}" 시나리오를 삭제하시겠습니까?`)) return;

    try {
      deleteScenario(id);
      loadScenarioList();
      addMessage('assistant', `시나리오 "${scenario?.name}"이(가) 삭제되었습니다.`);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleNewScenario = () => {
    if (bopData && !confirm('현재 작업 중인 BOP가 있습니다. 새로 시작하시겠습니까?')) {
      return;
    }

    createNewScenario();
    addMessage('assistant', '새 시나리오를 시작합니다.');
    setError('');
  };

  // === Scenario Comparison ===

  const toggleComparisonSelection = (id) => {
    setSelectedForComparison(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const getScenarioMetrics = (scenarioData) => {
    if (!scenarioData) return null;

    const processes = scenarioData.processes || [];

    // 공정 수: 부모 프로세스를 제외한 모든 프로세스 (병렬 라인 포함)
    // BopTable과 동일한 방식
    const processCount = processes.filter(p => !p.is_parent).length;

    // 예상 UPH 계산: BopTable의 getBottleneck 로직과 동일
    let expectedUph = 0;
    let maxEffectiveTime = 0;

    // Group processes by base ID (parent or independent)
    const baseProcesses = new Map();

    processes.forEach(process => {
      if (process.is_parent) {
        // Parent process - find all children and calculate effective CT
        const baseId = process.process_id;
        const children = processes.filter(p => p.parent_id === baseId);

        // Effective CT using harmonic mean (throughput sum)
        // Effective CT = 1 / Σ(1/CT_i)
        const childCTs = children.map(c => c.cycle_time_sec || 0);
        const effectiveCT = children.length > 0
          ? 1 / childCTs.reduce((sum, ct) => sum + (ct > 0 ? 1 / ct : 0), 0)
          : process.cycle_time_sec;

        baseProcesses.set(baseId, effectiveCT);
      } else if (!process.parent_id) {
        // Independent process (no parent)
        const baseId = process.process_id;
        const effectiveCT = process.cycle_time_sec;

        baseProcesses.set(baseId, effectiveCT);
      }
      // Skip child processes - they're already represented by their parent
    });

    // Find bottleneck (max effective CT)
    baseProcesses.forEach(effectiveCT => {
      if (effectiveCT > maxEffectiveTime) {
        maxEffectiveTime = effectiveCT;
      }
    });

    // 예상 UPH = 3600초 / 병목 사이클타임
    expectedUph = maxEffectiveTime > 0 ? Math.round(3600 / maxEffectiveTime) : 0;

    return {
      processCount: processCount,
      expectedUph: expectedUph,
      equipmentCount: (scenarioData.equipments || []).length,
      workerCount: (scenarioData.workers || []).length,
      materialCount: (scenarioData.materials || []).length,
      obstacleCount: (scenarioData.obstacles || []).length,
    };
  };

  const renderComparisonChart = (label, values, maxValue, unit = '') => (
    <div style={styles.chartContainer}>
      <div style={styles.chartLabel}>{label}</div>
      <div style={styles.chartBars}>
        {values.map((item, index) => {
          const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
          return (
            <div key={index} style={styles.chartRow}>
              <div style={styles.chartRowLabel}>{item.name}</div>
              <div style={styles.chartBarContainer}>
                <div
                  style={{
                    ...styles.chartBar,
                    width: `${percentage}%`,
                    backgroundColor: item.color || '#4a90e2'
                  }}
                />
                <span style={styles.chartValue}>{item.value}{unit}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderComparison = () => {
    const selectedScenarios = scenarios.filter(s => selectedForComparison.includes(s.id));

    if (selectedScenarios.length === 0) {
      return (
        <div style={styles.dataInfo}>
          비교할 시나리오를 2개 이상 선택하세요.
        </div>
      );
    }

    const colors = ['#4a90e2', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6'];
    const metricsData = selectedScenarios.map((scenario, index) => ({
      name: scenario.name,
      metrics: getScenarioMetrics(scenario.data),
      color: colors[index % colors.length]
    }));

    const processValues = metricsData.map(d => ({
      name: d.name,
      value: d.metrics?.processCount || 0,
      color: d.color
    }));
    const maxProcesses = Math.max(...processValues.map(v => v.value), 1);

    const uphValues = metricsData.map(d => ({
      name: d.name,
      value: d.metrics?.expectedUph || 0,
      color: d.color
    }));
    const maxUph = Math.max(...uphValues.map(v => v.value), 1);

    const equipmentValues = metricsData.map(d => ({
      name: d.name,
      value: d.metrics?.equipmentCount || 0,
      color: d.color
    }));
    const maxEquipment = Math.max(...equipmentValues.map(v => v.value), 1);

    const workerValues = metricsData.map(d => ({
      name: d.name,
      value: d.metrics?.workerCount || 0,
      color: d.color
    }));
    const maxWorkers = Math.max(...workerValues.map(v => v.value), 1);

    return (
      <div style={styles.comparisonContent}>
        <div style={styles.comparisonHeader}>
          <strong>선택된 시나리오: {selectedScenarios.length}개</strong>
        </div>

        {renderComparisonChart('공정 수', processValues, maxProcesses, '개')}
        {renderComparisonChart('예상 UPH', uphValues, maxUph)}
        {renderComparisonChart('설비 수', equipmentValues, maxEquipment, '개')}
        {renderComparisonChart('작업자 수', workerValues, maxWorkers, '명')}
      </div>
    );
  };

  // === Data Import/Export ===

  const handleDownloadJSON = () => {
    const data = exportBopData();
    if (!data) {
      setError('저장할 BOP 데이터가 없습니다.');
      return;
    }

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.project_title || 'bop'}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    addMessage('assistant', 'BOP 데이터를 JSON 파일로 다운로드했습니다.');
    setError('');
  };

  const handleDownloadExcel = () => {
    const data = exportBopData();
    if (!data) {
      setError('저장할 BOP 데이터가 없습니다.');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      // Process Structure Sheet (metadata only)
      const processStructureData = [
        ['공정 ID', '병렬수', '선행공정', '후속공정']
      ];
      data.processes.forEach(p => {
        processStructureData.push([
          p.process_id,
          p.parallel_count || 1,
          (p.predecessor_ids || []).join(', '),
          (p.successor_ids || []).join(', ')
        ]);
      });
      const wsStructure = XLSX.utils.aoa_to_sheet(processStructureData);
      XLSX.utils.book_append_sheet(wb, wsStructure, '공정 구조');

      // Process Details Sheet
      const processDetailsData = [
        ['공정 ID', '병렬라인 ID', '병렬인덱스', '공정명', '설명', '사이클타임(초)',
          '위치 X', '위치 Y', '위치 Z', '회전 Y']
      ];
      data.processes.forEach(p => {
        if (p.parallel_lines && p.parallel_lines.length > 0) {
          p.parallel_lines.forEach(line => {
            processDetailsData.push([
              p.process_id,
              line.process_id || '',
              line.parallel_index || 0,
              line.name || p.name,
              line.description || p.description,
              line.cycle_time_sec || p.cycle_time_sec,
              line.location?.x || p.location?.x || 0,
              line.location?.y || p.location?.y || 0,
              line.location?.z || p.location?.z || 0,
              line.rotation_y || p.rotation_y || 0
            ]);
          });
        } else {
          processDetailsData.push([
            p.process_id,
            '',
            0,
            p.name,
            p.description,
            p.cycle_time_sec,
            p.location?.x || 0,
            p.location?.y || 0,
            p.location?.z || 0,
            p.rotation_y || 0
          ]);
        }
      });
      const wsDetails = XLSX.utils.aoa_to_sheet(processDetailsData);
      XLSX.utils.book_append_sheet(wb, wsDetails, '공정 상세');

      XLSX.writeFile(wb, `${data.project_title || 'bop'}_${new Date().toISOString().split('T')[0]}.xlsx`);

      addMessage('assistant', 'BOP 데이터를 Excel 파일로 다운로드했습니다.');
      setError('');
    } catch (err) {
      setError('Excel 생성 오류: ' + err.message);
    }
  };

  const handleUploadJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target.result;
        const data = JSON.parse(json);
        setBopData(data);
        setTimeout(() => normalizeAllProcesses(), 0);
        addMessage('assistant', `"${file.name}" 파일에서 BOP 데이터를 불러왔습니다.`);
        setError('');
      } catch (err) {
        setError('JSON 파일 파싱 오류: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleUploadExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binaryStr = event.target.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary' });

        const structureSheet = workbook.Sheets['공정 구조'];
        if (!structureSheet) {
          throw new Error('"공정 구조" 시트를 찾을 수 없습니다.');
        }

        const structureData = XLSX.utils.sheet_to_json(structureSheet);
        const processes = structureData.map(row => ({
          process_id: row['공정 ID'],
          name: row['공정명'] || row['공정 ID'],
          description: row['설명'] || '',
          cycle_time_sec: parseFloat(row['사이클타임(초)']) || 60,
          parallel_count: parseInt(row['병렬수']) || 1,
          location: { x: 0, y: 0, z: 0 },
          rotation_y: 0,
          predecessor_ids: row['선행공정'] ? String(row['선행공정']).split(',').map(s => s.trim()).filter(Boolean) : [],
          successor_ids: row['후속공정'] ? String(row['후속공정']).split(',').map(s => s.trim()).filter(Boolean) : [],
          resources: []
        }));

        const data = {
          project_title: bopData?.project_title || '새 프로젝트',
          target_uph: bopData?.target_uph || 60,
          processes,
          equipments: bopData?.equipments || [],
          workers: bopData?.workers || [],
          materials: bopData?.materials || [],
          obstacles: bopData?.obstacles || []
        };

        if (processes.length > 0) {
          setBopData(data);
          setTimeout(() => normalizeAllProcesses(), 0);
          addMessage('assistant', `"${file.name}" 파일에서 BOP 데이터를 불러왔습니다.`);
          setError('');
        }
      } catch (err) {
        setError('Excel 파일 파싱 오류: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  return (
    <div style={styles.container}>
      {/* Scenario Management Section */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>💾 시나리오 관리</span>
        </div>

        {/* New Scenario */}
        <div style={{ marginBottom: '12px' }}>
          <button style={styles.newScenarioBtn} onClick={handleNewScenario}>
            ➕ 새 시나리오
          </button>
        </div>

        {/* Save Scenario */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              style={styles.scenarioInput}
              type="text"
              placeholder="시나리오 이름 입력..."
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSaveScenario()}
            />
            <button
              style={styles.saveScenarioBtn}
              onClick={handleSaveScenario}
              disabled={!scenarioName.trim() || !bopData}
            >
              💾 저장
            </button>
          </div>
        </div>

        {/* Load Scenario */}
        <div style={{ marginBottom: '12px' }}>
          <button
            style={styles.loadScenarioBtn}
            onClick={() => setShowScenarioList(!showScenarioList)}
          >
            📂 불러오기 ({scenarios.length})
          </button>
        </div>

        {/* Scenario List */}
        {showScenarioList && scenarios.length > 0 && (
          <div style={styles.scenarioList}>
            {scenarios.map(scenario => (
              <div key={scenario.id} style={styles.scenarioItem}>
                <div style={styles.scenarioInfo}>
                  <div style={styles.scenarioName}>{scenario.name}</div>
                  <div style={styles.scenarioDate}>
                    {new Date(scenario.updatedAt).toLocaleDateString('ko-KR')}
                  </div>
                </div>
                <div style={styles.scenarioActions}>
                  <button
                    style={styles.scenarioLoadBtn}
                    onClick={() => handleLoadScenario(scenario.id)}
                  >
                    열기
                  </button>
                  <button
                    style={styles.scenarioDeleteBtn}
                    onClick={() => handleDeleteScenario(scenario.id)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showScenarioList && scenarios.length === 0 && (
          <div style={styles.dataInfo}>저장된 시나리오가 없습니다.</div>
        )}
      </div>

      {/* Scenario Comparison Section */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>📊 시나리오 비교</span>
        </div>

        {/* Scenario Selection */}
        {scenarios.length > 0 && (
          <div style={styles.comparisonList}>
            {scenarios.map(scenario => (
              <div key={scenario.id} style={styles.comparisonItem}>
                <label style={styles.comparisonLabel}>
                  <input
                    type="checkbox"
                    checked={selectedForComparison.includes(scenario.id)}
                    onChange={() => toggleComparisonSelection(scenario.id)}
                    style={styles.checkbox}
                  />
                  <span style={styles.comparisonName}>{scenario.name}</span>
                  <span style={styles.comparisonDate}>
                    {new Date(scenario.updatedAt).toLocaleDateString('ko-KR')}
                  </span>
                </label>
              </div>
            ))}
          </div>
        )}

        {scenarios.length === 0 && (
          <div style={styles.dataInfo}>저장된 시나리오가 없습니다.</div>
        )}

        {/* Comparison Results */}
        {selectedForComparison.length > 0 && renderComparison()}
      </div>

      {/* Data Import/Export Section */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>📂 데이터 관리</span>
        </div>
        <div style={styles.dataButtons}>
          <div style={styles.dataButtonGroup}>
            <span style={styles.dataButtonLabel}>내보내기:</span>
            <button style={styles.dataBtn} onClick={handleDownloadJSON}>
              JSON 다운로드
            </button>
            <button style={styles.dataBtn} onClick={handleDownloadExcel}>
              Excel 다운로드
            </button>
          </div>
          <div style={styles.dataButtonGroup}>
            <span style={styles.dataButtonLabel}>가져오기:</span>
            <input
              ref={jsonUploadRef}
              type="file"
              accept=".json"
              onChange={handleUploadJSON}
              style={{ display: 'none' }}
            />
            <button style={styles.dataBtn} onClick={() => jsonUploadRef.current?.click()}>
              JSON 업로드
            </button>
            <input
              ref={excelUploadRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUploadExcel}
              style={{ display: 'none' }}
            />
            <button style={styles.dataBtn} onClick={() => excelUploadRef.current?.click()}>
              Excel 업로드
            </button>
          </div>
        </div>
        <div style={styles.dataInfo}>
          현재 BOP 데이터를 파일로 저장하거나, 이전에 저장한 파일을 불러올 수 있습니다.
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

const styles = {
  container: {
    height: '100%',
    overflow: 'auto',
    padding: '16px',
    backgroundColor: '#fff',
  },
  section: {
    backgroundColor: '#f0f8ff',
    border: '1px solid #b3d9ff',
    borderRadius: '6px',
    padding: '14px',
    marginBottom: '16px',
  },
  sectionHeader: {
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '2px solid #4a90e2',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  },
  newScenarioBtn: {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: '#50c878',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: '600',
  },
  scenarioInput: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
  },
  saveScenarioBtn: {
    padding: '8px 16px',
    backgroundColor: '#4a90e2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: '600',
  },
  loadScenarioBtn: {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: '#fff',
    color: '#4a90e2',
    border: '1px solid #4a90e2',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: '600',
  },
  scenarioList: {
    marginTop: '12px',
    maxHeight: '300px',
    overflowY: 'auto',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
  },
  scenarioItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid #f0f0f0',
  },
  scenarioInfo: {
    flex: 1,
  },
  scenarioName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '4px',
  },
  scenarioDate: {
    fontSize: '11px',
    color: '#888',
  },
  scenarioActions: {
    display: 'flex',
    gap: '6px',
  },
  scenarioLoadBtn: {
    padding: '4px 12px',
    backgroundColor: '#4a90e2',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  scenarioDeleteBtn: {
    padding: '4px 12px',
    backgroundColor: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  comparisonList: {
    marginTop: '12px',
    marginBottom: '12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  comparisonItem: {
    padding: '8px 12px',
    borderBottom: '1px solid #f0f0f0',
  },
  comparisonLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  comparisonName: {
    flex: 1,
    fontWeight: '500',
    color: '#333',
  },
  comparisonDate: {
    fontSize: '11px',
    color: '#888',
  },
  checkbox: {
    cursor: 'pointer',
  },
  comparisonContent: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '4px',
  },
  comparisonHeader: {
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '2px solid #4a90e2',
    fontSize: '14px',
    color: '#333',
  },
  chartContainer: {
    marginBottom: '20px',
  },
  chartLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '10px',
  },
  chartBars: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  chartRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  chartRowLabel: {
    minWidth: '120px',
    fontSize: '12px',
    color: '#555',
    fontWeight: '500',
  },
  chartBarContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
    height: '24px',
  },
  chartBar: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
    minWidth: '2px',
  },
  chartValue: {
    position: 'absolute',
    right: '8px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#333',
  },
  dataButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '12px',
  },
  dataButtonGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  dataButtonLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#555',
    minWidth: '70px',
  },
  dataBtn: {
    padding: '6px 12px',
    backgroundColor: '#4a90e2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  dataInfo: {
    fontSize: '12px',
    color: '#666',
    lineHeight: '1.5',
    padding: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: '4px',
  },
  error: {
    padding: '12px',
    backgroundColor: '#fee',
    border: '1px solid #fcc',
    borderRadius: '4px',
    color: '#c00',
    fontSize: '13px',
    marginTop: '12px',
  },
};

export default ScenariosPanel;
