import { useState } from 'react';
import useBopStore from '../store/bopStore';
import { api } from '../services/api';

function BopTable() {
  const {
    bopData,
    selectedProcessId,
    setSelectedProcess,
    getEquipmentById,
    getWorkerById,
    getMaterialById
  } = useBopStore();

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
  const getResourcesByType = (process) => {
    const equipments = [];
    const workers = [];
    const materials = [];

    process.resources.forEach(resource => {
      if (resource.resource_type === 'equipment') {
        const eq = getEquipmentById(resource.resource_id);
        if (eq) {
          equipments.push({ ...eq, quantity: resource.quantity, role: resource.role });
        }
      } else if (resource.resource_type === 'worker') {
        const worker = getWorkerById(resource.resource_id);
        if (worker) {
          workers.push({ ...worker, quantity: resource.quantity, role: resource.role });
        }
      } else if (resource.resource_type === 'material') {
        const material = getMaterialById(resource.resource_id);
        if (material) {
          materials.push({ ...material, quantity: resource.quantity, role: resource.role });
        }
      }
    });

    return { equipments, workers, materials };
  };

  const getEquipmentTypeColor = (equipmentType) => {
    switch (equipmentType) {
      case 'robot': return '#4a90e2';
      case 'machine': return '#ff6b6b';
      case 'manual_station': return '#50c878';
      default: return '#888';
    }
  };

  const formatResources = (resources, formatter) => {
    if (!resources || resources.length === 0) return '-';
    return resources.map(formatter).join(', ');
  };

  // Calculate bottleneck
  const getBottleneck = () => {
    let maxTime = 0;
    let bottleneckProcess = null;

    bopData.processes.forEach(process => {
      const effectiveTime = process.cycle_time_sec / process.parallel_count;
      if (effectiveTime > maxTime) {
        maxTime = effectiveTime;
        bottleneckProcess = process;
      }
    });

    return { process: bottleneckProcess, time: maxTime };
  };

  const bottleneck = getBottleneck();

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>{bopData.project_title}</h2>
        <div style={styles.uph}>Target: {bopData.target_uph} UPH</div>
      </div>

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: '80px' }}>ID</th>
              <th style={{ ...styles.th, minWidth: '150px' }}>Name</th>
              <th style={{ ...styles.th, minWidth: '100px' }}>Cycle Time</th>
              <th style={{ ...styles.th, minWidth: '80px' }}>Parallel</th>
              <th style={{ ...styles.th, minWidth: '150px' }}>Equipments</th>
              <th style={{ ...styles.th, minWidth: '120px' }}>Workers</th>
              <th style={{ ...styles.th, minWidth: '200px' }}>Materials</th>
            </tr>
          </thead>
          <tbody>
            {bopData.processes.map((process) => {
              const isProcessSelected = selectedProcessId === process.process_id;
              const effectiveCycleTime = process.cycle_time_sec / process.parallel_count;
              const isBottleneck = bottleneck.process?.process_id === process.process_id;
              const { equipments, workers, materials } = getResourcesByType(process);

              // 병렬 라인 수만큼 row 생성
              const rows = [];
              for (let i = 0; i < process.parallel_count; i++) {
                const isFirstRow = i === 0;
                rows.push(
                  <tr
                    key={`${process.process_id}-${i}`}
                    style={{
                      ...styles.processRow,
                      ...(isProcessSelected ? styles.processRowSelected : {}),
                      ...(isBottleneck && isFirstRow ? styles.bottleneckRow : {}),
                      ...(isFirstRow ? {} : styles.parallelRow)
                    }}
                    onClick={() => setSelectedProcess(process.process_id)}
                  >
                    {isFirstRow ? (
                      <>
                        <td style={styles.td}>
                          <strong>{process.process_id}</strong>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.processName}>
                            <strong>{process.name}</strong>
                            {process.parallel_count > 1 && (
                              <span style={styles.parallelBadge}>
                                {process.parallel_count}x
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
                            <div><strong>{process.cycle_time_sec.toFixed(1)}s</strong></div>
                            <div style={styles.effectiveTime}>
                              Eff: <strong>{effectiveCycleTime.toFixed(1)}s</strong>
                            </div>
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.parallelCount}>{process.parallel_count}</span>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.resourcesCell}>
                            {formatResources(equipments, eq =>
                              `${eq.name} (x${eq.quantity})`
                            )}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.resourcesCell}>
                            {formatResources(workers, w =>
                              `${w.name} (x${w.quantity})`
                            )}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.resourcesCell}>
                            {formatResources(materials, m =>
                              `${m.name} (${m.quantity}${m.unit})`
                            )}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={styles.td}>
                          <span style={styles.parallelLabel}>└ #{i + 1}</span>
                        </td>
                        <td style={styles.td} colSpan="6">
                          <span style={styles.parallelLineText}>(병렬 라인 #{i + 1})</span>
                        </td>
                      </>
                    )}
                  </tr>
                );
              }
              return rows;
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
          <span style={styles.summaryLabel}>Equipments:</span>
          <span style={styles.summaryValue}>{bopData.equipments?.length || 0}</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Workers:</span>
          <span style={styles.summaryValue}>{bopData.workers?.length || 0}</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Materials:</span>
          <span style={styles.summaryValue}>{bopData.materials?.length || 0}</span>
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
    backgroundColor: '#f8f8f8',
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
  parallelRow: {
    backgroundColor: '#fafafa',
  },
  td: {
    padding: '10px 8px',
    verticalAlign: 'top',
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
    fontSize: '11px',
  },
  parallelCount: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#e8f4f8',
    borderRadius: '4px',
    fontWeight: 'bold',
    color: '#4a90e2',
  },
  parallelLabel: {
    color: '#999',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  parallelLineText: {
    color: '#999',
    fontSize: '11px',
    fontStyle: 'italic',
  },
  resourcesCell: {
    fontSize: '12px',
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
