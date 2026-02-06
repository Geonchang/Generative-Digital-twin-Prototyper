import { useEffect, useRef, useState } from 'react';
import useBopStore from '../store/bopStore';
import { getResourceSize } from './Viewer3D';

function WorkersTable() {
  const { bopData, selectedResourceKey, setSelectedResource,
    updateResourceLocation, updateResourceScale, updateResourceRotation,
    addWorker, updateWorker, deleteWorker } = useBopStore();
  const selectedRowRef = useRef(null);
  const [editingCell, setEditingCell] = useState(null);
  const [selectedMasterId, setSelectedMasterId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // Auto-scroll to selected row
  useEffect(() => {
    if (selectedRowRef.current && selectedResourceKey) {
      selectedRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [selectedResourceKey]);

  const handleAddWorker = () => {
    addWorker();
    const workers = useBopStore.getState().bopData?.workers;
    if (workers && workers.length > 0) {
      setSelectedMasterId(workers[workers.length - 1].worker_id);
    }
  };

  const handleDeleteWorker = () => {
    if (!selectedMasterId) return;
    if (window.confirm('선택한 작업자를 삭제하시겠습니까? 할당된 공정에서도 제거됩니다.')) {
      deleteWorker(selectedMasterId);
      setSelectedMasterId(null);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`선택한 ${selectedIds.length}명의 작업자를 삭제하시겠습니까? 할당된 공정에서도 제거됩니다.`)) {
      selectedIds.forEach(id => deleteWorker(id));
      setSelectedIds([]);
      setSelectedMasterId(null);
    }
  };

  const handleToggleSelect = (workerId) => {
    setSelectedIds(prev =>
      prev.includes(workerId)
        ? prev.filter(id => id !== workerId)
        : [...prev, workerId]
    );
  };

  const handleToggleSelectAll = () => {
    const workers = bopData?.workers || [];
    if (selectedIds.length === workers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(workers.map(w => w.worker_id));
    }
  };

  if (!bopData || !bopData.workers || bopData.workers.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>작업자 마스터</h2>
          <div style={styles.count}>총 0명</div>
        </div>
        <div style={styles.actionBar}>
          <button style={styles.actionButton} onClick={handleAddWorker}>
            + 작업자 추가
          </button>
        </div>
        <div style={styles.emptyState}>
          <p>작업자 데이터가 없습니다.</p>
          <button style={styles.actionButton} onClick={handleAddWorker}>
            + 작업자 추가
          </button>
        </div>
      </div>
    );
  }

  const getSkillLevelColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'senior': return '#ff9800';
      case 'mid': return '#4caf50';
      case 'junior': return '#2196f3';
      default: return '#888';
    }
  };

  // 각 작업자가 사용되는 공정 찾기
  const getProcessesUsingWorker = (workerId) => {
    if (!bopData.processes) return [];
    const result = [];

    bopData.processes.forEach(process => {
      const resource = process.resources?.find(
        r => r.resource_type === 'worker' && r.resource_id === workerId
      );

      if (resource) {
        result.push({
          process,
          resource,
        });
      }
    });

    return result;
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>작업자 마스터</h2>
        <div style={styles.count}>총 {bopData.workers.length}명</div>
      </div>

      {/* Action Bar */}
      <div style={styles.actionBar}>
        <button style={styles.actionButton} onClick={handleAddWorker}>
          + 작업자 추가
        </button>
        <button
          style={{
            ...styles.actionButtonDanger,
            ...(selectedIds.length === 0 ? styles.actionButtonDisabled : {})
          }}
          disabled={selectedIds.length === 0}
          onClick={handleDeleteSelected}
        >
          선택 항목 삭제 ({selectedIds.length})
        </button>
      </div>

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: '40px' }}>
                <input
                  type="checkbox"
                  checked={bopData.workers.length > 0 && selectedIds.length === bopData.workers.length}
                  onChange={handleToggleSelectAll}
                  style={styles.checkbox}
                />
              </th>
              <th style={{ ...styles.th, width: '100px' }}>작업자 ID</th>
              <th style={{ ...styles.th, minWidth: '120px' }}>이름</th>
              <th style={{ ...styles.th, width: '80px' }}>숙련도</th>
              <th style={{ ...styles.th, width: '100px' }}>담당 공정</th>
              <th style={{ ...styles.th, width: '120px' }}>Location (x,z)</th>
              <th style={{ ...styles.th, width: '150px' }}>Size (x,y,z)</th>
              <th style={{ ...styles.th, width: '80px' }}>Rotation (Y)</th>
            </tr>
          </thead>
          <tbody>
            {bopData.workers.flatMap((worker) => {
              const usedProcesses = getProcessesUsingWorker(worker.worker_id);
              const isMasterSelected = selectedMasterId === worker.worker_id;

              if (usedProcesses.length === 0) {
                return (
                  <tr
                    key={worker.worker_id}
                    style={{
                      ...styles.row,
                      ...(isMasterSelected ? styles.rowMasterSelected : {}),
                    }}
                    onClick={() => setSelectedMasterId(worker.worker_id)}
                  >
                    <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(worker.worker_id)}
                        onChange={() => handleToggleSelect(worker.worker_id)}
                        style={styles.checkbox}
                      />
                    </td>
                    <td style={styles.td}><strong>{worker.worker_id}</strong></td>
                    <td style={styles.td}>
                      {isMasterSelected ? (
                        <input
                          type="text"
                          style={styles.editInput}
                          value={worker.name}
                          onChange={(e) => updateWorker(worker.worker_id, { name: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : worker.name}
                    </td>
                    <td style={styles.td}>
                      {isMasterSelected ? (
                        <select
                          style={styles.editSelect}
                          value={worker.skill_level || ''}
                          onChange={(e) => updateWorker(worker.worker_id, { skill_level: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="Senior">Senior</option>
                          <option value="Mid">Mid</option>
                          <option value="Junior">Junior</option>
                        </select>
                      ) : worker.skill_level ? (
                        <span style={{ ...styles.skillBadge, backgroundColor: getSkillLevelColor(worker.skill_level) }}>
                          {worker.skill_level}
                        </span>
                      ) : (
                        <span style={styles.notSpecified}>-</span>
                      )}
                    </td>
                    <td style={styles.td} colSpan={4}><span style={styles.notUsed}>미배정</span></td>
                  </tr>
                );
              }

              return usedProcesses.map(({ process, resource }, idx) => {
                const lineLabel = process.process_id;
                const resourceKey = `worker:${worker.worker_id}:${process.process_id}`;
                const isSelected = selectedResourceKey === resourceKey;

                const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };
                const scale = resource.scale || { x: 1, y: 1, z: 1 };
                const rotationY = resource.rotation_y || 0;

                // Effective position 계산 (auto-layout 적용)
                const resourceIndex = process.resources.findIndex(r =>
                  r.resource_type === resource.resource_type && r.resource_id === resource.resource_id
                );
                const totalResources = process.resources.length;
                const effectivePos = (relLoc.x !== 0 || relLoc.z !== 0)
                  ? { x: relLoc.x, z: relLoc.z }
                  : { x: 0, z: resourceIndex * 0.9 - (totalResources - 1) * 0.9 / 2 };

                const baseSize = getResourceSize('worker', null);
                const actualSize = {
                  x: baseSize.width * scale.x,
                  y: baseSize.height * scale.y,
                  z: baseSize.depth * scale.z
                };

                return (
                  <tr
                    key={`${worker.worker_id}-${process.process_id}`}
                    ref={isSelected ? selectedRowRef : null}
                    style={{
                      ...styles.row,
                      ...(isSelected ? styles.rowSelected : {}),
                      ...(isMasterSelected && !isSelected ? styles.rowMasterSelected : {}),
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedResource('worker', worker.worker_id, process.process_id);
                      setSelectedMasterId(worker.worker_id);
                    }}
                  >
                    {idx === 0 && (
                      <>
                        <td style={styles.td} rowSpan={usedProcesses.length} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(worker.worker_id)}
                            onChange={() => handleToggleSelect(worker.worker_id)}
                            style={styles.checkbox}
                          />
                        </td>
                        <td style={styles.td} rowSpan={usedProcesses.length}>
                          <strong>{worker.worker_id}</strong>
                        </td>
                        <td style={styles.td} rowSpan={usedProcesses.length}>
                          {isMasterSelected ? (
                            <input
                              type="text"
                              style={styles.editInput}
                              value={worker.name}
                              onChange={(e) => updateWorker(worker.worker_id, { name: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : worker.name}
                        </td>
                        <td style={styles.td} rowSpan={usedProcesses.length}>
                          {isMasterSelected ? (
                            <select
                              style={styles.editSelect}
                              value={worker.skill_level || ''}
                              onChange={(e) => updateWorker(worker.worker_id, { skill_level: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="Senior">Senior</option>
                              <option value="Mid">Mid</option>
                              <option value="Junior">Junior</option>
                            </select>
                          ) : worker.skill_level ? (
                            <span style={{ ...styles.skillBadge, backgroundColor: getSkillLevelColor(worker.skill_level) }}>
                              {worker.skill_level}
                            </span>
                          ) : (
                            <span style={styles.notSpecified}>-</span>
                          )}
                        </td>
                      </>
                    )}
                    <td style={styles.td}>
                      <span style={styles.processChip}>{lineLabel}</span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.locationCell}>
                        ({effectivePos.x.toFixed(1)}, {effectivePos.z.toFixed(1)})
                      </div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.locationCell}>
                        {actualSize.x.toFixed(2)}, {actualSize.y.toFixed(2)}, {actualSize.z.toFixed(2)}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.locationCell}>
                        {(rotationY * 180 / Math.PI).toFixed(1)}°
                      </div>
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
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
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#999',
    fontSize: '14px',
    gap: '12px',
  },
  header: {
    padding: '20px',
    borderBottom: '2px solid #ddd',
    backgroundColor: '#f9f9f9',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
  },
  count: {
    fontSize: '14px',
    color: '#4a90e2',
    fontWeight: 'bold',
  },
  actionBar: {
    display: 'flex',
    gap: '8px',
    padding: '10px 20px',
    borderBottom: '1px solid #ddd',
    backgroundColor: '#fafafa',
  },
  actionButton: {
    padding: '6px 14px',
    backgroundColor: '#4a90e2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  actionButtonDanger: {
    padding: '6px 14px',
    backgroundColor: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  actionButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  tableWrapper: {
    flex: 1,
    overflow: 'auto',
    padding: '0',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    position: 'sticky',
    top: 0,
    backgroundColor: '#f5f5f5',
    padding: '12px 8px',
    textAlign: 'left',
    fontWeight: 'bold',
    borderBottom: '2px solid #ddd',
    fontSize: '12px',
    color: '#555',
    zIndex: 1,
  },
  row: {
    backgroundColor: 'white',
    borderBottom: '1px solid #ddd',
    transition: 'background-color 0.2s',
    cursor: 'pointer',
  },
  rowSelected: {
    backgroundColor: '#e8f5e9',
    borderLeft: '3px solid #2e7d32',
  },
  rowMasterSelected: {
    backgroundColor: '#f3e5f5',
    borderLeft: '3px solid #9c27b0',
  },
  td: {
    padding: '8px 6px',
    verticalAlign: 'middle',
  },
  input: {
    width: '100%',
    padding: '4px 6px',
    fontSize: '11px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    fontFamily: 'monospace',
  },
  locationCell: {
    fontSize: '11px',
    color: '#666',
    fontFamily: 'monospace',
  },
  editInput: {
    width: '100%',
    padding: '4px 6px',
    fontSize: '12px',
    border: '1px solid #9c27b0',
    borderRadius: '3px',
    boxSizing: 'border-box',
    backgroundColor: '#fce4ec',
  },
  editSelect: {
    width: '100%',
    padding: '4px 6px',
    fontSize: '11px',
    border: '1px solid #9c27b0',
    borderRadius: '3px',
    backgroundColor: '#fce4ec',
    cursor: 'pointer',
  },
  skillBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    color: 'white',
    fontSize: '11px',
    borderRadius: '12px',
    fontWeight: 'bold',
  },
  processChip: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
    fontSize: '11px',
    borderRadius: '8px',
    fontWeight: '500',
  },
  notUsed: {
    color: '#999',
    fontSize: '12px',
    fontStyle: 'italic',
  },
  notSpecified: {
    color: '#999',
    fontSize: '12px',
  },
  checkbox: {
    cursor: 'pointer',
    width: '16px',
    height: '16px',
  },
};

export default WorkersTable;
