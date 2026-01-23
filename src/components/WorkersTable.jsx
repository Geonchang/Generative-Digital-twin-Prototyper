import { useEffect, useRef, useState } from 'react';
import useBopStore from '../store/bopStore';

function WorkersTable() {
  const { bopData, selectedResourceKey, setSelectedResource, updateResourceLocation, updateResourceScale, updateResourceRotation } = useBopStore();
  const selectedRowRef = useRef(null);
  const [editingCell, setEditingCell] = useState(null);

  // Auto-scroll to selected row
  useEffect(() => {
    if (selectedRowRef.current && selectedResourceKey) {
      selectedRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [selectedResourceKey]);

  if (!bopData || !bopData.workers || bopData.workers.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <p>작업자 데이터가 없습니다.</p>
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
          parallelLineIndex: resource.parallel_line_index,
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

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
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

              if (usedProcesses.length === 0) {
                return (
                  <tr key={worker.worker_id} style={styles.row}>
                    <td style={styles.td}><strong>{worker.worker_id}</strong></td>
                    <td style={styles.td}>{worker.name}</td>
                    <td style={styles.td}>
                      {worker.skill_level ? (
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

              return usedProcesses.map(({ process, resource, parallelLineIndex }, idx) => {
                const lineLabel = parallelLineIndex !== undefined && parallelLineIndex !== null
                  ? `${process.process_id}-#${parallelLineIndex + 1}`
                  : process.process_id;

                const resourceKey = `worker-${worker.worker_id}-${process.process_id}-${parallelLineIndex || 0}`;
                const isSelected = selectedResourceKey === resourceKey;

                const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };
                const scale = resource.scale || { x: 1, y: 1, z: 1 };
                const rotationY = resource.rotation_y || 0;

                return (
                  <tr
                    key={`${worker.worker_id}-${process.process_id}-${parallelLineIndex}`}
                    ref={isSelected ? selectedRowRef : null}
                    style={{
                      ...styles.row,
                      ...(isSelected ? styles.rowSelected : {}),
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedResource('worker', worker.worker_id, process.process_id, parallelLineIndex || 0);
                    }}
                  >
                    {idx === 0 && (
                      <>
                        <td style={styles.td} rowSpan={usedProcesses.length}>
                          <strong>{worker.worker_id}</strong>
                        </td>
                        <td style={styles.td} rowSpan={usedProcesses.length}>
                          {worker.name}
                        </td>
                        <td style={styles.td} rowSpan={usedProcesses.length}>
                          {worker.skill_level ? (
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
                      <input
                        type="text"
                        style={styles.input}
                        value={`${relLoc.x.toFixed(1)}, ${relLoc.z.toFixed(1)}`}
                        onChange={(e) => {
                          const values = e.target.value.split(',').map(v => parseFloat(v.trim()));
                          if (values.length === 2 && !values.some(isNaN)) {
                            updateResourceLocation(process.process_id, 'worker', worker.worker_id, { x: values[0], y: 0, z: values[1] });
                          }
                        }}
                      />
                    </td>
                    <td style={styles.td}>
                      <input
                        type="text"
                        style={styles.input}
                        value={`${scale.x.toFixed(2)}, ${scale.y.toFixed(2)}, ${scale.z.toFixed(2)}`}
                        onChange={(e) => {
                          const values = e.target.value.split(',').map(v => parseFloat(v.trim()));
                          if (values.length === 3 && !values.some(isNaN)) {
                            updateResourceScale(process.process_id, 'worker', worker.worker_id, { x: values[0], y: values[1], z: values[2] });
                          }
                        }}
                      />
                    </td>
                    <td style={styles.td}>
                      <input
                        type="text"
                        style={styles.input}
                        value={(rotationY * 180 / Math.PI).toFixed(1)}
                        onChange={(e) => {
                          const deg = parseFloat(e.target.value);
                          if (!isNaN(deg)) {
                            updateResourceRotation(process.process_id, 'worker', worker.worker_id, deg * Math.PI / 180);
                          }
                        }}
                      />
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
};

export default WorkersTable;
