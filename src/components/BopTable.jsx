import { useState } from 'react';
import useBopStore from '../store/bopStore';
import { api } from '../services/api';

function BopTable() {
  const {
    bopData,
    selectedProcessKey,
    setSelectedProcess,
    clearSelection,
    getEquipmentById,
    getWorkerById,
    getMaterialById,
    addProcess,
    updateProcess,
    deleteProcess,
    addParallelLine,
    removeParallelLine,
    addResourceToProcess,
    removeResourceFromProcess,
    linkProcesses,
    unlinkProcesses
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

  if (!bopData) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <p>BOP 데이터가 없습니다.</p>
          <p style={styles.hint}>오른쪽 패널에서 BOP를 생성해보세요.</p>
        </div>
      </div>
    );
  }

  if (!bopData.processes || bopData.processes.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>{bopData.project_title}</h2>
          <div style={styles.uph}>Target: {bopData.target_uph} UPH</div>
        </div>
        <div style={styles.emptyState}>
          <p>공정이 없습니다.</p>
          <button
            style={styles.actionButton}
            onClick={() => addProcess()}
          >
            + 공정 추가
          </button>
        </div>
      </div>
    );
  }

  // Helper functions - 리소스 타입별 분류
  const getResourcesByType = (process) => {
    const equipments = [];
    const workers = [];
    const materials = [];

    if (!process.resources) return { equipments, workers, materials };

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

  const formatResources = (resources, formatter) => {
    if (!resources || resources.length === 0) return '-';
    return resources.map(formatter).join(', ');
  };

  const renderResourceCell = (process, isSelected, resourceType, assignedResources, allResources, idField) => {
    if (!isSelected) {
      return (
        <div style={styles.resourcesCell}>
          {formatResources(assignedResources, r =>
            resourceType === 'material'
              ? `${r.name} (${r.quantity}${r.unit})`
              : `${r.name} (x${r.quantity})`
          )}
        </div>
      );
    }

    const assignedIds = new Set(assignedResources.map(r => r[idField]));
    const available = (allResources || []).filter(r => !assignedIds.has(r[idField]));

    return (
      <div>
        {assignedResources.map(resource => (
          <div key={resource[idField]} style={styles.resourceTag}>
            <span>{resource.name}</span>
            <button
              style={styles.resourceTagRemove}
              onClick={(e) => {
                e.stopPropagation();
                removeResourceFromProcess(process.process_id, resourceType, resource[idField]);
              }}
            >
              ×
            </button>
          </div>
        ))}
        {available.length > 0 && (
          <select
            style={styles.resourceSelect}
            value=""
            onChange={(e) => {
              if (e.target.value) {
                addResourceToProcess(process.process_id, { resource_type: resourceType, resource_id: e.target.value });
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">+ 추가...</option>
            {available.map(r => (
              <option key={r[idField]} value={r[idField]}>{r.name}</option>
            ))}
          </select>
        )}
      </div>
    );
  };

  // Render predecessor/successor link cell
  const renderLinkCell = (process, isSelected, direction) => {
    const baseId = process.parent_id || process.process_id;
    const baseProc = process.parent_id
      ? bopData.processes.find(p => p.process_id === process.parent_id) || process
      : process;
    const linkIds = direction === 'predecessor'
      ? (baseProc.predecessor_ids || [])
      : (baseProc.successor_ids || []);

    // Resolve link IDs to process names
    const linkedProcesses = linkIds.map(id => {
      const p = bopData.processes.find(pr => pr.process_id === id);
      return p ? { id: p.process_id, name: p.name } : { id, name: id };
    });

    if (!isSelected) {
      return (
        <div style={styles.resourcesCell}>
          {linkedProcesses.length === 0 ? '-' : linkedProcesses.map(p => p.name).join(', ')}
        </div>
      );
    }

    // All base processes (independent + parents) excluding self group
    const baseProcesses = bopData.processes.filter(p => !p.parent_id);
    const available = baseProcesses.filter(p =>
      p.process_id !== baseId && !linkIds.includes(p.process_id)
    );

    return (
      <div>
        {linkedProcesses.map(lp => (
          <div key={lp.id} style={styles.resourceTag}>
            <span>{lp.name}</span>
            <button
              style={styles.resourceTagRemove}
              onClick={(e) => {
                e.stopPropagation();
                if (direction === 'predecessor') {
                  unlinkProcesses(lp.id, baseId);
                } else {
                  unlinkProcesses(baseId, lp.id);
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
        {available.length > 0 && (
          <select
            style={styles.resourceSelect}
            value=""
            onChange={(e) => {
              if (e.target.value) {
                if (direction === 'predecessor') {
                  linkProcesses(e.target.value, baseId);
                } else {
                  linkProcesses(baseId, e.target.value);
                }
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">+ 추가...</option>
            {available.map(p => (
              <option key={p.process_id} value={p.process_id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>
    );
  };

  // Calculate bottleneck - only consider child processes (actual production lines)
  const getBottleneck = () => {
    let maxTime = 0;
    let bottleneckProcess = null;

    bopData.processes.forEach(process => {
      // Skip parent processes
      if (process.is_parent) return;

      const cycleTime = process.cycle_time_sec;
      if (cycleTime > maxTime) {
        maxTime = cycleTime;
        bottleneckProcess = process;
      }
    });

    return { process: bottleneckProcess, time: maxTime };
  };

  const bottleneck = getBottleneck();

  // Group processes by parent (for hierarchical display)
  const processGroups = [];
  const processedIds = new Set();

  bopData.processes.forEach(process => {
    if (processedIds.has(process.process_id)) return;

    if (process.is_parent) {
      // Parent process - find all children
      const children = bopData.processes.filter(p => p.parent_id === process.process_id);
      if (children.length > 0) {
        processGroups.push({
          parent: process,
          children: children.sort((a, b) => (a.parallel_index || 0) - (b.parallel_index || 0))
        });
        processedIds.add(process.process_id);
        children.forEach(c => processedIds.add(c.process_id));
      }
    } else if (!process.parent_id) {
      // Independent process (no parent)
      processGroups.push({
        parent: null,
        children: [process]
      });
      processedIds.add(process.process_id);
    }
  });

  const selectedProcess = bopData?.processes?.find(p => p.process_id === selectedProcessKey);
  const isParallelChild = selectedProcess?.parent_id != null;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>{bopData.project_title}</h2>
        <div style={styles.uph}>Target: {bopData.target_uph} UPH</div>
      </div>

      {/* Action Bar */}
      <div style={styles.actionBar}>
        <button
          style={styles.actionButton}
          onClick={() => addProcess()}
        >
          + 공정 추가
        </button>
        <button
          style={{
            ...styles.actionButton,
            ...(selectedProcessKey ? {} : styles.actionButtonDisabled)
          }}
          disabled={!selectedProcessKey}
          onClick={() => addProcess({ afterProcessId: selectedProcessKey })}
        >
          + 뒤에 추가
        </button>
        <button
          style={{
            ...styles.actionButtonDanger,
            ...(selectedProcessKey ? {} : styles.actionButtonDisabled)
          }}
          disabled={!selectedProcessKey}
          onClick={() => {
            if (window.confirm('선택한 공정을 삭제하시겠습니까?')) {
              deleteProcess(selectedProcessKey);
            }
          }}
        >
          선택 공정 삭제
        </button>
        <button
          style={{
            ...styles.actionButton,
            ...(selectedProcessKey ? {} : styles.actionButtonDisabled)
          }}
          disabled={!selectedProcessKey}
          onClick={() => addParallelLine(selectedProcessKey)}
        >
          + 병렬 추가
        </button>
        <button
          style={{
            ...styles.actionButtonDanger,
            ...((selectedProcessKey && isParallelChild) ? {} : styles.actionButtonDisabled)
          }}
          disabled={!selectedProcessKey || !isParallelChild}
          onClick={() => {
            if (window.confirm('선택한 병렬 라인을 삭제하시겠습니까?')) {
              removeParallelLine(selectedProcessKey);
            }
          }}
        >
          병렬 삭제
        </button>
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
              <th style={{ ...styles.th, minWidth: '120px' }}>전공정 (Pred.)</th>
              <th style={{ ...styles.th, minWidth: '120px' }}>후공정 (Succ.)</th>
              <th style={{ ...styles.th, minWidth: '120px' }}>Location (x,z)</th>
              <th style={{ ...styles.th, width: '80px' }}>Rotation (Y)</th>
            </tr>
          </thead>
          <tbody>
            {processGroups.map((group, groupIdx) => {
              const rows = [];
              const isParallelGroup = group.parent && group.children.length > 1;

              group.children.forEach((process, childIdx) => {
                const isFirstChild = childIdx === 0;
                const isThisRowSelected = selectedProcessKey === process.process_id;
                const isBottleneck = bottleneck.process?.process_id === process.process_id;

                const { equipments, workers, materials } = getResourcesByType(process);

                rows.push(
                  <tr
                    key={process.process_id}
                    style={{
                      ...styles.processRow,
                      ...(isThisRowSelected ? styles.processRowSelected : {}),
                      ...(isBottleneck ? styles.bottleneckRow : {}),
                      ...(isFirstChild ? {} : styles.parallelRow)
                    }}
                    onClick={() => setSelectedProcess(process.process_id)}
                  >
                    {isFirstChild && isParallelGroup ? (
                      // Parent group header (first child of parallel group)
                      <>
                        <td style={styles.td}>
                          <strong>{group.parent.process_id}</strong>
                        </td>
                        <td style={styles.td}>
                          {isThisRowSelected ? (
                            <>
                              <div style={styles.processName}>
                                <input
                                  type="text"
                                  style={{ ...styles.editInput, ...styles.editInputName }}
                                  value={process.name}
                                  onChange={(e) => updateProcess(process.process_id, { name: e.target.value })}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <span style={styles.parallelBadge}>
                                  {group.children.length}x
                                </span>
                              </div>
                              <input
                                type="text"
                                style={styles.editInput}
                                value={process.description || ''}
                                onChange={(e) => updateProcess(process.process_id, { description: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="설명"
                              />
                            </>
                          ) : (
                            <>
                              <div style={styles.processName}>
                                <strong>{group.parent.name}</strong>
                                <span style={styles.parallelBadge}>
                                  {group.children.length}x
                                </span>
                                {isBottleneck && (
                                  <span style={styles.bottleneckBadge}>
                                    Bottleneck
                                  </span>
                                )}
                              </div>
                              <div style={styles.processDescription}>{group.parent.description}</div>
                            </>
                          )}
                        </td>
                        <td style={styles.td}>
                          {isThisRowSelected ? (
                            <input
                              type="text"
                              style={styles.editInput}
                              value={process.cycle_time_sec ?? ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) {
                                  updateProcess(process.process_id, { cycle_time_sec: val });
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div style={styles.cycleTimeInfo}>
                              <div><strong>{process.cycle_time_sec?.toFixed(1) || 0}s</strong></div>
                            </div>
                          )}
                        </td>
                        <td style={styles.td}>
                          <span style={styles.parallelCount}>#{process.parallel_index + 1}</span>
                        </td>
                        <td style={styles.td}>
                          {renderResourceCell(process, isThisRowSelected, 'equipment', equipments, bopData.equipments, 'equipment_id')}
                        </td>
                        <td style={styles.td}>
                          {renderResourceCell(process, isThisRowSelected, 'worker', workers, bopData.workers, 'worker_id')}
                        </td>
                        <td style={styles.td}>
                          {renderResourceCell(process, isThisRowSelected, 'material', materials, bopData.materials, 'material_id')}
                        </td>
                        <td style={styles.td}>
                          {renderLinkCell(process, isThisRowSelected, 'predecessor')}
                        </td>
                        <td style={styles.td}>
                          {renderLinkCell(process, isThisRowSelected, 'successor')}
                        </td>
                        <td style={styles.td}>
                          <div style={styles.locationCell}>
                            ({process.location.x.toFixed(1)}, {process.location.z.toFixed(1)})
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.locationCell}>
                            {((process.rotation_y || 0) * 180 / Math.PI).toFixed(0)}°
                          </div>
                        </td>
                      </>
                    ) : isParallelGroup ? (
                      // Child rows of parallel group (2nd and beyond)
                      <>
                        <td style={styles.td}>
                          <span style={styles.parallelLabel}>{process.process_id}</span>
                        </td>
                        <td style={styles.td}>
                          {isThisRowSelected ? (
                            <>
                              <input
                                type="text"
                                style={{ ...styles.editInput, ...styles.editInputName }}
                                value={process.name}
                                onChange={(e) => updateProcess(process.process_id, { name: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <input
                                type="text"
                                style={styles.editInput}
                                value={process.description || ''}
                                onChange={(e) => updateProcess(process.process_id, { description: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="설명"
                              />
                            </>
                          ) : (
                            <span style={styles.parallelLineText}>
                              └ #{process.parallel_index + 1}
                            </span>
                          )}
                        </td>
                        <td style={styles.td}>
                          {isThisRowSelected ? (
                            <input
                              type="text"
                              style={styles.editInput}
                              value={process.cycle_time_sec ?? ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) {
                                  updateProcess(process.process_id, { cycle_time_sec: val });
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div style={styles.cycleTimeInfo}>
                              <div>{process.cycle_time_sec?.toFixed(1) || 0}s</div>
                            </div>
                          )}
                        </td>
                        <td style={styles.td}>
                          <span style={styles.parallelCount}>#{process.parallel_index + 1}</span>
                        </td>
                        <td style={styles.td}>
                          {renderResourceCell(process, isThisRowSelected, 'equipment', equipments, bopData.equipments, 'equipment_id')}
                        </td>
                        <td style={styles.td}>
                          {renderResourceCell(process, isThisRowSelected, 'worker', workers, bopData.workers, 'worker_id')}
                        </td>
                        <td style={styles.td}>
                          {renderResourceCell(process, isThisRowSelected, 'material', materials, bopData.materials, 'material_id')}
                        </td>
                        <td style={styles.td}>
                          {renderLinkCell(process, isThisRowSelected, 'predecessor')}
                        </td>
                        <td style={styles.td}>
                          {renderLinkCell(process, isThisRowSelected, 'successor')}
                        </td>
                        <td style={styles.td}>
                          <div style={styles.locationCell}>
                            ({process.location.x.toFixed(1)}, {process.location.z.toFixed(1)})
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.locationCell}>
                            {((process.rotation_y || 0) * 180 / Math.PI).toFixed(0)}°
                          </div>
                        </td>
                      </>
                    ) : (
                      // Independent process (no parent)
                      <>
                        <td style={styles.td}>
                          <strong>{process.process_id}</strong>
                        </td>
                        <td style={styles.td}>
                          {isThisRowSelected ? (
                            <>
                              <input
                                type="text"
                                style={{ ...styles.editInput, ...styles.editInputName }}
                                value={process.name}
                                onChange={(e) => updateProcess(process.process_id, { name: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <input
                                type="text"
                                style={styles.editInput}
                                value={process.description || ''}
                                onChange={(e) => updateProcess(process.process_id, { description: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="설명"
                              />
                            </>
                          ) : (
                            <>
                              <div style={styles.processName}>
                                <strong>{process.name}</strong>
                                {isBottleneck && (
                                  <span style={styles.bottleneckBadge}>
                                    Bottleneck
                                  </span>
                                )}
                              </div>
                              <div style={styles.processDescription}>{process.description}</div>
                            </>
                          )}
                        </td>
                        <td style={styles.td}>
                          {isThisRowSelected ? (
                            <input
                              type="text"
                              style={styles.editInput}
                              value={process.cycle_time_sec ?? ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) {
                                  updateProcess(process.process_id, { cycle_time_sec: val });
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div style={styles.cycleTimeInfo}>
                              <div><strong>{process.cycle_time_sec.toFixed(1)}s</strong></div>
                            </div>
                          )}
                        </td>
                        <td style={styles.td}>
                          <span style={styles.parallelCount}>#1</span>
                        </td>
                        <td style={styles.td}>
                          {renderResourceCell(process, isThisRowSelected, 'equipment', equipments, bopData.equipments, 'equipment_id')}
                        </td>
                        <td style={styles.td}>
                          {renderResourceCell(process, isThisRowSelected, 'worker', workers, bopData.workers, 'worker_id')}
                        </td>
                        <td style={styles.td}>
                          {renderResourceCell(process, isThisRowSelected, 'material', materials, bopData.materials, 'material_id')}
                        </td>
                        <td style={styles.td}>
                          {renderLinkCell(process, isThisRowSelected, 'predecessor')}
                        </td>
                        <td style={styles.td}>
                          {renderLinkCell(process, isThisRowSelected, 'successor')}
                        </td>
                        <td style={styles.td}>
                          <div style={styles.locationCell}>
                            ({process.location.x.toFixed(1)}, {process.location.z.toFixed(1)})
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.locationCell}>
                            {((process.rotation_y || 0) * 180 / Math.PI).toFixed(0)}°
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              });

              return rows;
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div style={styles.summary}>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Total Processes:</span>
          <span style={styles.summaryValue}>
            {bopData.processes.filter(p => !p.is_parent).length}
          </span>
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
  editInput: {
    width: '100%',
    padding: '4px 6px',
    fontSize: '11px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
    marginBottom: '2px',
  },
  editInputName: {
    minWidth: '140px',
    fontFamily: 'inherit',
    fontWeight: 'bold',
    fontSize: '12px',
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
  resourceTag: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '4px',
    padding: '2px 6px',
    marginBottom: '2px',
    backgroundColor: '#e8f4f8',
    borderRadius: '3px',
    fontSize: '11px',
  },
  resourceTagRemove: {
    background: 'none',
    border: 'none',
    color: '#e74c3c',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '13px',
    padding: '0 2px',
    lineHeight: 1,
  },
  resourceSelect: {
    width: '100%',
    padding: '3px 4px',
    fontSize: '11px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    backgroundColor: 'white',
    cursor: 'pointer',
    marginTop: '2px',
  },
  locationCell: {
    fontSize: '11px',
    color: '#666',
    fontFamily: 'monospace',
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
