import { useState, useEffect, useRef } from 'react';
import useBopStore from '../store/bopStore';
import { api } from '../services/api';

function BopTable() {
  const {
    bopData,
    selectedProcessId,
    selectedOperationId,
    expandedProcessIds,
    setSelectedProcess,
    setSelectedOperation,
    toggleProcessExpand,
    expandAllProcesses,
    collapseAllProcesses,
    getEquipmentById,
    getWorkerById
  } = useBopStore();

  const selectedOperationRef = useRef(null);

  // 선택된 operation으로 스크롤
  useEffect(() => {
    if (selectedOperationId && selectedOperationRef.current) {
      selectedOperationRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [selectedOperationId]);

  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');

  const handleExportExcel = async () => {
    if (!bopData || !bopData.processes || bopData.processes.length === 0) {
      setExportError('먼저 BOP를 생성해주세요');
      return;
    }

    setExportLoading(true);
    setExportError('');

    try {
      await api.exportExcel(bopData);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExportLoading(false);
    }
  };

  const handleExport3D = async () => {
    if (!bopData || !bopData.processes || bopData.processes.length === 0) {
      setExportError('먼저 BOP를 생성해주세요');
      return;
    }

    setExportLoading(true);
    setExportError('');

    try {
      await api.export3D(bopData);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExportLoading(false);
    }
  };

  if (!bopData || !bopData.processes || bopData.processes.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <p>BOP 데이터가 없습니다.</p>
          <p style={styles.hint}>오른쪽 패널에서 BOP를 생성해보세요.</p>
        </div>
      </div>
    );
  }

  // Helper functions
  const isProcessExpanded = (processId) => expandedProcessIds.has(processId);

  const getEquipmentName = (equipmentId) => {
    if (!equipmentId) return '-';
    const equipment = getEquipmentById(equipmentId);
    return equipment ? equipment.name : equipmentId;
  };

  const getWorkerNames = (workerIds) => {
    if (!workerIds || workerIds.length === 0) return '-';
    return workerIds.map(id => {
      const worker = getWorkerById(id);
      return worker ? worker.name : id;
    }).join(', ');
  };

  const getEquipmentTypeColor = (equipmentId) => {
    if (!equipmentId) return '#888';
    const equipment = getEquipmentById(equipmentId);
    if (!equipment) return '#888';

    switch (equipment.type) {
      case 'robot': return '#4a90e2';
      case 'machine': return '#ff6b6b';
      case 'manual_station': return '#50c878';
      default: return '#888';
    }
  };

  const formatMaterials = (materials) => {
    if (!materials || materials.length === 0) return '-';
    return materials.map(m => `${m.name} (${m.quantity}${m.unit})`).join(', ');
  };

  // Calculate total cycle time for a process
  const getProcessTotalCycleTime = (process) => {
    return process.operations.reduce((sum, op) => sum + op.cycle_time_sec, 0);
  };

  const getProcessEffectiveCycleTime = (process) => {
    const total = getProcessTotalCycleTime(process);
    return process.parallel_count > 0 ? total / process.parallel_count : total;
  };

  // Calculate bottleneck
  const getBottleneck = () => {
    let maxTime = 0;
    let bottleneckProcess = null;

    bopData.processes.forEach(process => {
      const effectiveTime = getProcessEffectiveCycleTime(process);
      if (effectiveTime > maxTime) {
        maxTime = effectiveTime;
        bottleneckProcess = process;
      }
    });

    return { process: bottleneckProcess, time: maxTime };
  };

  const bottleneck = getBottleneck();
  const allExpanded = bopData.processes.every(p => isProcessExpanded(p.process_id));

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>{bopData.project_title}</h2>
        <div style={styles.uph}>Target: {bopData.target_uph} UPH</div>
      </div>

      {/* Expand/Collapse Controls */}
      <div style={styles.controls}>
        <button
          style={styles.controlButton}
          onClick={() => allExpanded ? collapseAllProcesses() : expandAllProcesses()}
        >
          {allExpanded ? '▼ Collapse All' : '▶ Expand All'}
        </button>
      </div>

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: '40px' }}></th>
              <th style={{ ...styles.th, width: '100px' }}>ID</th>
              <th style={{ ...styles.th, minWidth: '150px' }}>Name</th>
              <th style={{ ...styles.th, minWidth: '100px' }}>Cycle Time</th>
              <th style={{ ...styles.th, minWidth: '150px' }}>Equipment</th>
              <th style={{ ...styles.th, minWidth: '120px' }}>Workers</th>
              <th style={{ ...styles.th, minWidth: '200px' }}>Materials</th>
            </tr>
          </thead>
          <tbody>
            {bopData.processes.map((process) => {
              const isExpanded = isProcessExpanded(process.process_id);
              const isProcessSelected = selectedProcessId === process.process_id;
              const totalCycleTime = getProcessTotalCycleTime(process);
              const effectiveCycleTime = getProcessEffectiveCycleTime(process);
              const isBottleneck = bottleneck.process?.process_id === process.process_id;

              return (
                <>
                  {/* Process Row */}
                  <tr
                    key={process.process_id}
                    style={{
                      ...styles.processRow,
                      ...(isProcessSelected ? styles.processRowSelected : {}),
                      ...(isBottleneck ? styles.bottleneckRow : {})
                    }}
                    onClick={() => {
                      setSelectedProcess(process.process_id);
                      toggleProcessExpand(process.process_id);
                    }}
                  >
                    <td style={styles.td}>
                      <button style={styles.expandButton}>
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                    <td style={styles.td}>
                      <strong>{process.process_id}</strong>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.processName}>
                        <strong>{process.name}</strong>
                        {process.parallel_count > 1 && (
                          <span style={styles.parallelBadge}>
                            {process.parallel_count}x Parallel
                          </span>
                        )}
                        {isBottleneck && (
                          <span style={styles.bottleneckBadge}>
                            🔴 Bottleneck
                          </span>
                        )}
                      </div>
                      <div style={styles.processDescription}>{process.description}</div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.cycleTimeInfo}>
                        <div>Total: <strong>{totalCycleTime.toFixed(1)}s</strong></div>
                        <div style={styles.effectiveTime}>
                          Effective: <strong>{effectiveCycleTime.toFixed(1)}s</strong>
                        </div>
                      </div>
                    </td>
                    <td style={styles.td} colSpan="3">
                      <span style={styles.operationCount}>
                        {process.operations.length} operation{process.operations.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                  </tr>

                  {/* Operations Rows (if expanded) */}
                  {isExpanded && process.operations.map((operation) => {
                    const isOperationSelected = selectedOperationId === operation.operation_id;
                    const equipmentColor = getEquipmentTypeColor(operation.equipment_id);

                    return (
                      <tr
                        key={operation.operation_id}
                        ref={isOperationSelected ? selectedOperationRef : null}
                        style={{
                          ...styles.operationRow,
                          ...(isOperationSelected ? styles.operationRowSelected : {})
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOperation(operation.operation_id);
                        }}
                      >
                        <td style={styles.td}></td>
                        <td style={styles.td}>
                          <span style={styles.operationId}>↳ {operation.operation_id}</span>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.operationName}>{operation.name}</div>
                          <div style={styles.operationDescription}>{operation.description}</div>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.cycleTime}>{operation.cycle_time_sec}s</span>
                        </td>
                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.equipmentBadge,
                              borderColor: equipmentColor
                            }}
                          >
                            {getEquipmentName(operation.equipment_id)}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.workerText}>
                            {getWorkerNames(operation.worker_ids)}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.materialsCell}>
                            {operation.input_materials.length > 0 && (
                              <div style={styles.materialSection}>
                                <span style={styles.materialLabel}>In:</span>
                                <span style={styles.materialText}>
                                  {formatMaterials(operation.input_materials)}
                                </span>
                              </div>
                            )}
                            {operation.output_materials.length > 0 && (
                              <div style={styles.materialSection}>
                                <span style={styles.materialLabel}>Out:</span>
                                <span style={styles.materialText}>
                                  {formatMaterials(operation.output_materials)}
                                </span>
                              </div>
                            )}
                            {operation.input_materials.length === 0 && operation.output_materials.length === 0 && (
                              <span style={styles.materialText}>-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div style={styles.summary}>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Total Processes:</span>
          <span style={styles.summaryValue}>{bopData.processes.length}</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Total Operations:</span>
          <span style={styles.summaryValue}>
            {bopData.processes.reduce((sum, p) => sum + p.operations.length, 0)}
          </span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Equipments:</span>
          <span style={styles.summaryValue}>{bopData.equipments.length}</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Workers:</span>
          <span style={styles.summaryValue}>{bopData.workers.length}</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Bottleneck Time:</span>
          <span style={styles.summaryValue}>{bottleneck.time.toFixed(1)}s</span>
        </div>
      </div>

      {/* Export Section */}
      <div style={styles.exportSection}>
        <h3 style={styles.exportTitle}>내보내기</h3>
        {exportError && <div style={styles.exportError}>{exportError}</div>}
        <div style={styles.exportButtons}>
          <button
            style={styles.exportButton}
            onClick={handleExportExcel}
            disabled={exportLoading}
          >
            📊 Excel
          </button>
          <button
            style={{ ...styles.exportButton, ...styles.exportButtonSecondary }}
            onClick={handleExport3D}
            disabled={exportLoading}
          >
            🎨 3D JSON
          </button>
        </div>
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
  },
  hint: {
    fontSize: '12px',
    marginTop: '10px',
  },
  header: {
    padding: '20px',
    borderBottom: '2px solid #ddd',
    backgroundColor: '#f9f9f9',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
  },
  uph: {
    fontSize: '14px',
    color: '#4a90e2',
    fontWeight: 'bold',
  },
  controls: {
    padding: '10px 20px',
    borderBottom: '1px solid #eee',
    backgroundColor: '#f5f5f5',
  },
  controlButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
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
  processRow: {
    backgroundColor: '#f0f0f0',
    borderBottom: '1px solid #ddd',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  processRowSelected: {
    backgroundColor: '#e3f2fd',
    borderLeft: '4px solid #4a90e2',
  },
  bottleneckRow: {
    backgroundColor: '#fff3e0',
  },
  operationRow: {
    backgroundColor: '#fafafa',
    borderBottom: '1px solid #eee',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  operationRowSelected: {
    backgroundColor: '#fff9c4',
    borderLeft: '4px solid #ffc107',
  },
  td: {
    padding: '10px 8px',
    verticalAlign: 'top',
  },
  expandButton: {
    background: 'none',
    border: 'none',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '4px',
  },
  processName: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '4px',
  },
  processDescription: {
    fontSize: '11px',
    color: '#666',
    fontStyle: 'italic',
  },
  parallelBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: '#4a90e2',
    color: 'white',
    fontSize: '10px',
    borderRadius: '10px',
    fontWeight: 'bold',
  },
  bottleneckBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: '#ff9800',
    color: 'white',
    fontSize: '10px',
    borderRadius: '10px',
    fontWeight: 'bold',
  },
  cycleTimeInfo: {
    fontSize: '12px',
  },
  effectiveTime: {
    color: '#4a90e2',
    marginTop: '2px',
  },
  operationCount: {
    color: '#666',
    fontSize: '12px',
    fontStyle: 'italic',
  },
  operationId: {
    color: '#666',
    fontSize: '12px',
    fontFamily: 'monospace',
  },
  operationName: {
    fontWeight: '500',
    marginBottom: '2px',
  },
  operationDescription: {
    fontSize: '11px',
    color: '#777',
    fontStyle: 'italic',
  },
  cycleTime: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#e8f4f8',
    borderRadius: '4px',
    fontWeight: 'bold',
    color: '#4a90e2',
  },
  equipmentBadge: {
    display: 'inline-block',
    padding: '4px 8px',
    border: '2px solid',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
  },
  workerText: {
    fontSize: '12px',
    color: '#50c878',
    fontWeight: '500',
  },
  materialsCell: {
    fontSize: '11px',
  },
  materialSection: {
    marginBottom: '2px',
  },
  materialLabel: {
    fontWeight: 'bold',
    marginRight: '4px',
    color: '#666',
  },
  materialText: {
    color: '#555',
  },
  summary: {
    display: 'flex',
    gap: '20px',
    padding: '15px 20px',
    borderTop: '2px solid #ddd',
    backgroundColor: '#f9f9f9',
    flexWrap: 'wrap',
  },
  summaryItem: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#666',
  },
  summaryValue: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#333',
  },
  exportSection: {
    padding: '15px 20px',
    borderTop: '2px solid #ddd',
    backgroundColor: '#f5f5f5',
  },
  exportTitle: {
    margin: '0 0 10px 0',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#555',
  },
  exportButtons: {
    display: 'flex',
    gap: '10px',
  },
  exportButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#4a90e2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  exportButtonSecondary: {
    backgroundColor: '#888',
  },
  exportError: {
    color: '#ff6b6b',
    fontSize: '12px',
    marginBottom: '10px',
  },
};

export default BopTable;
