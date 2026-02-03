import { useState, useEffect, useRef } from 'react';
import useBopStore from '../store/bopStore';
import { api } from '../services/api';
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
      api.exportExcel(data);
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

        // Helper: 시트 데이터 읽기 (없으면 빈 배열)
        const readSheet = (name) => {
          const sheet = workbook.Sheets[name];
          if (!sheet) return [];
          const data = XLSX.utils.sheet_to_json(sheet);
          // 빈 행 제거 (모든 값이 비어있는 경우)
          return data.filter(row => Object.values(row).some(v => v !== '' && v !== null && v !== undefined));
        };

        // 1. 프로젝트 정보
        const projectData = readSheet('프로젝트 정보');
        let project_title = '새 프로젝트';
        let target_uph = 60;
        projectData.forEach(row => {
          if (row['항목'] === '프로젝트명') project_title = row['값'] || project_title;
          if (row['항목'] === '목표 UPH') target_uph = parseInt(row['값']) || target_uph;
        });

        // 2. 공정 시트 (연결 정보만)
        const processData = readSheet('공정');
        if (processData.length === 0) {
          throw new Error('"공정" 시트에 데이터가 없습니다.');
        }

        // 3. 병렬라인 상세 시트 (모든 공정의 모든 라인)
        const parallelData = readSheet('병렬라인 상세');
        const parallelLinesMap = {};
        parallelData.forEach(row => {
          const processId = row['공정 ID'];
          if (!processId) return;
          if (!parallelLinesMap[processId]) parallelLinesMap[processId] = [];
          parallelLinesMap[processId].push({
            parallel_index: parseInt(row['병렬 인덱스']) || 1,
            name: row['공정명'] || '',
            description: row['설명'] || '',
            cycle_time_sec: parseFloat(row['사이클타임(초)']) || 60,
            location: {
              x: parseFloat(row['위치 X']) || 0,
              y: parseFloat(row['위치 Y']) || 0,
              z: parseFloat(row['위치 Z']) || 0,
            },
            rotation_y: parseFloat(row['회전 Y']) || 0,
          });
        });

        // 4. 리소스 배치 시트
        const resourceData = readSheet('리소스 배치');
        const resourcesMap = {};
        resourceData.forEach(row => {
          const processId = row['공정 ID'];
          if (!processId || !row['리소스 ID']) return;
          if (!resourcesMap[processId]) resourcesMap[processId] = [];

          const pliRaw = row['병렬라인 인덱스'];
          const parallel_line_index = (pliRaw !== '' && pliRaw !== null && pliRaw !== undefined)
            ? parseInt(pliRaw)
            : undefined;

          resourcesMap[processId].push({
            resource_type: row['리소스 유형'],
            resource_id: row['리소스 ID'],
            quantity: parseFloat(row['수량']) || 1,
            role: row['역할'] || '',
            relative_location: {
              x: parseFloat(row['상대위치 X']) || 0,
              y: parseFloat(row['상대위치 Y']) || 0,
              z: parseFloat(row['상대위치 Z']) || 0,
            },
            rotation_y: parseFloat(row['회전 Y']) || 0,
            scale: {
              x: parseFloat(row['스케일 X']) || 1,
              y: parseFloat(row['스케일 Y']) || 1,
              z: parseFloat(row['스케일 Z']) || 1,
            },
            ...(parallel_line_index !== undefined && { parallel_line_index }),
          });
        });

        // 5. 공정 조립 (공정 시트 + 병렬라인 상세 합체)
        // 새 JSON 구조: 연결 정보 + parallel_lines만 (대표값 없음)
        const processes = processData.map(row => {
          const process_id = row['공정 ID'];
          const parallel_count = parseInt(row['병렬 수']) || 1;
          const lines = parallelLinesMap[process_id] || [];

          // 병렬라인 상세가 없으면 기본값으로 1개 라인 생성
          const parallel_lines = lines.length > 0 ? lines : [{
            parallel_index: 1,
            name: process_id,
            description: '',
            cycle_time_sec: 60,
            location: { x: 0, y: 0, z: 0 },
            rotation_y: 0,
          }];

          return {
            process_id,
            parallel_count,
            predecessor_ids: row['선행 공정']
              ? String(row['선행 공정']).split(',').map(s => s.trim()).filter(Boolean)
              : [],
            successor_ids: row['후행 공정']
              ? String(row['후행 공정']).split(',').map(s => s.trim()).filter(Boolean)
              : [],
            parallel_lines,
            resources: resourcesMap[process_id] || [],
          };
        });

        // 6. 장비 시트
        const equipmentData = readSheet('장비');
        const equipments = equipmentData.map(row => ({
          equipment_id: row['장비 ID'],
          name: row['장비명'] || row['장비 ID'],
          type: row['유형'] || 'machine',
        })).filter(e => e.equipment_id);

        // 7. 작업자 시트
        const workerData = readSheet('작업자');
        const workers = workerData.map(row => ({
          worker_id: row['작업자 ID'],
          name: row['이름'] || row['작업자 ID'],
          skill_level: row['숙련도'] || 'Mid',
        })).filter(w => w.worker_id);

        // 8. 자재 시트
        const materialData = readSheet('자재');
        const materials = materialData.map(row => ({
          material_id: row['자재 ID'],
          name: row['자재명'] || row['자재 ID'],
          unit: row['단위'] || 'ea',
        })).filter(m => m.material_id);

        // 9. 장애물 시트
        const obstacleData = readSheet('장애물');
        const obstacles = obstacleData.map(row => ({
          obstacle_id: row['장애물 ID'],
          name: row['이름'] || '',
          type: row['유형'] || 'fence',
          position: {
            x: parseFloat(row['위치 X']) || 0,
            y: parseFloat(row['위치 Y']) || 0,
            z: parseFloat(row['위치 Z']) || 0,
          },
          size: {
            width: parseFloat(row['크기 X']) || 1,
            height: parseFloat(row['크기 Y']) || 1,
            depth: parseFloat(row['크기 Z']) || 1,
          },
          rotation_y: parseFloat(row['회전 Y']) || 0,
        })).filter(o => o.obstacle_id);

        // 최종 BOP 데이터 조립
        const data = {
          project_title,
          target_uph,
          processes,
          equipments,
          workers,
          materials,
          obstacles,
        };

        setBopData(data);
        setTimeout(() => normalizeAllProcesses(), 0);

        const summary = [
          `공정 ${processes.length}개`,
          `장비 ${equipments.length}개`,
          `작업자 ${workers.length}명`,
          `자재 ${materials.length}개`,
          `장애물 ${obstacles.length}개`,
        ].join(', ');
        addMessage('assistant', `"${file.name}" 파일에서 BOP 데이터를 불러왔습니다. (${summary})`);
        setError('');
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
