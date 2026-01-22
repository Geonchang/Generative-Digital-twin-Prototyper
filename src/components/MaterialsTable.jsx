import { useEffect, useRef } from 'react';
import useBopStore from '../store/bopStore';

function MaterialsTable() {
  const { bopData, selectedResourceKey, setSelectedResource } = useBopStore();
  const selectedRowRef = useRef(null);

  // Auto-scroll to selected row
  useEffect(() => {
    if (selectedRowRef.current && selectedResourceKey) {
      selectedRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [selectedResourceKey]);

  if (!bopData || !bopData.materials || bopData.materials.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <p>자재 데이터가 없습니다.</p>
        </div>
      </div>
    );
  }

  // 각 자재가 사용되는 공정 찾기 및 총 사용량 계산
  const getMaterialUsage = (materialId) => {
    if (!bopData.processes) return { processes: [], totalQuantity: 0 };

    const usage = [];
    let totalQuantity = 0;

    bopData.processes.forEach(process => {
      const materialResource = process.resources?.find(
        r => r.resource_type === 'material' && r.resource_id === materialId
      );

      if (materialResource) {
        // 실제 위치 = 공정 위치 + 상대 위치
        const actualLocation = {
          x: process.location.x + materialResource.relative_location.x,
          y: process.location.y + materialResource.relative_location.y,
          z: process.location.z + materialResource.relative_location.z,
        };

        usage.push({
          process,
          quantity: materialResource.quantity,
          actualLocation,
          parallelLineIndex: materialResource.parallel_line_index,
        });
        totalQuantity += materialResource.quantity * process.parallel_count;
      }
    });

    return { processes: usage, totalQuantity };
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>자재 마스터</h2>
        <div style={styles.count}>총 {bopData.materials.length}종</div>
      </div>

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: '120px' }}>자재 ID</th>
              <th style={{ ...styles.th, minWidth: '200px' }}>자재명</th>
              <th style={{ ...styles.th, width: '80px' }}>단위</th>
              <th style={{ ...styles.th, width: '120px' }}>총 사용량</th>
              <th style={{ ...styles.th, minWidth: '300px' }}>사용 공정 및 위치</th>
            </tr>
          </thead>
          <tbody>
            {bopData.materials.map((material) => {
              const { processes, totalQuantity } = getMaterialUsage(material.material_id);

              return (
                <tr key={material.material_id} style={styles.row}>
                  <td style={styles.td}>
                    <strong>{material.material_id}</strong>
                  </td>
                  <td style={styles.td}>
                    {material.name}
                  </td>
                  <td style={styles.td}>
                    <span style={styles.unit}>{material.unit}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.totalQuantity}>
                      {totalQuantity > 0 ? `${totalQuantity.toFixed(1)} ${material.unit}` : '-'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {processes.length > 0 ? (
                      <div style={styles.processList}>
                        {processes.map(({ process, quantity, actualLocation, parallelLineIndex }, idx) => {
                          const lineLabel = parallelLineIndex !== undefined && parallelLineIndex !== null
                            ? `${process.process_id}-#${parallelLineIndex + 1}`
                            : process.process_id;

                          const resourceKey = `material-${material.material_id}-${process.process_id}-${parallelLineIndex || 0}`;
                          const isSelected = selectedResourceKey === resourceKey;

                          return (
                            <div
                              key={`${process.process_id}-${idx}`}
                              ref={isSelected ? selectedRowRef : null}
                              style={{
                                ...styles.processItem,
                                ...(isSelected ? styles.processItemSelected : {}),
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedResource('material', material.material_id, process.process_id, parallelLineIndex || 0);
                              }}
                            >
                              <div style={styles.processRow}>
                                <span style={styles.processChip}>
                                  {lineLabel}
                                </span>
                                <span style={styles.quantity}>
                                  {quantity} {material.unit}
                                </span>
                              </div>
                              <span style={styles.locationText}>
                                ({actualLocation.x.toFixed(1)}, {actualLocation.y.toFixed(1)}, {actualLocation.z.toFixed(1)})
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span style={styles.notUsed}>미사용</span>
                    )}
                  </td>
                </tr>
              );
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
  },
  td: {
    padding: '12px 8px',
    verticalAlign: 'top',
  },
  unit: {
    color: '#666',
    fontSize: '12px',
    fontWeight: '500',
  },
  totalQuantity: {
    color: '#ff9800',
    fontSize: '13px',
    fontWeight: 'bold',
  },
  processList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  processItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  processItemSelected: {
    backgroundColor: '#fff3e0',
    borderLeft: '3px solid #ff9800',
  },
  processRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  processChip: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: '#fff3e0',
    color: '#e65100',
    fontSize: '11px',
    borderRadius: '8px',
    fontWeight: '500',
  },
  quantity: {
    fontSize: '12px',
    color: '#666',
  },
  locationText: {
    fontSize: '10px',
    color: '#666',
    fontFamily: 'monospace',
  },
  notUsed: {
    color: '#999',
    fontSize: '12px',
    fontStyle: 'italic',
  },
};

export default MaterialsTable;
