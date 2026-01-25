import { useEffect, useRef, useState } from 'react';
import useBopStore from '../store/bopStore';
import { getResourceSize } from './Viewer3D';

function MaterialsTable() {
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

  if (!bopData || !bopData.materials || bopData.materials.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <p>자재 데이터가 없습니다.</p>
        </div>
      </div>
    );
  }

  // 각 자재가 사용되는 공정 찾기
  const getMaterialUsage = (materialId) => {
    if (!bopData.processes) return [];

    const usage = [];

    bopData.processes.forEach(process => {
      const materialResource = process.resources?.find(
        r => r.resource_type === 'material' && r.resource_id === materialId
      );

      if (materialResource) {
        usage.push({
          process,
          resource: materialResource,
          parallelLineIndex: materialResource.parallel_line_index,
        });
      }
    });

    return usage;
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
              <th style={{ ...styles.th, width: '100px' }}>자재 ID</th>
              <th style={{ ...styles.th, minWidth: '150px' }}>자재명</th>
              <th style={{ ...styles.th, width: '60px' }}>단위</th>
              <th style={{ ...styles.th, width: '100px' }}>사용 공정</th>
              <th style={{ ...styles.th, width: '80px' }}>수량</th>
              <th style={{ ...styles.th, width: '120px' }}>Location (x,z)</th>
              <th style={{ ...styles.th, width: '150px' }}>Size (x,y,z)</th>
              <th style={{ ...styles.th, width: '80px' }}>Rotation (Y)</th>
            </tr>
          </thead>
          <tbody>
            {bopData.materials.flatMap((material) => {
              const usage = getMaterialUsage(material.material_id);

              if (usage.length === 0) {
                return (
                  <tr key={material.material_id} style={styles.row}>
                    <td style={styles.td}><strong>{material.material_id}</strong></td>
                    <td style={styles.td}>{material.name}</td>
                    <td style={styles.td}><span style={styles.unit}>{material.unit}</span></td>
                    <td style={styles.td} colSpan={5}><span style={styles.notUsed}>미사용</span></td>
                  </tr>
                );
              }

              return usage.map(({ process, resource, parallelLineIndex }, idx) => {
                const lineLabel = parallelLineIndex !== undefined && parallelLineIndex !== null
                  ? `${process.process_id}-#${parallelLineIndex + 1}`
                  : process.process_id;

                const resourceKey = `material-${material.material_id}-${process.process_id}-${parallelLineIndex || 0}`;
                const isSelected = selectedResourceKey === resourceKey;

                const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };
                const scale = resource.scale || { x: 1, y: 1, z: 1 };
                const rotationY = resource.rotation_y || 0;

                // 실제 geometry 크기 계산 (기본 크기 × scale)
                const baseSize = getResourceSize('material', null);
                const actualSize = {
                  x: baseSize.width * scale.x,
                  y: baseSize.height * scale.y,
                  z: baseSize.depth * scale.z
                };

                return (
                  <tr
                    key={`${material.material_id}-${process.process_id}-${parallelLineIndex}`}
                    ref={isSelected ? selectedRowRef : null}
                    style={{
                      ...styles.row,
                      ...(isSelected ? styles.rowSelected : {}),
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedResource('material', material.material_id, process.process_id, parallelLineIndex || 0);
                    }}
                  >
                    {idx === 0 && (
                      <>
                        <td style={styles.td} rowSpan={usage.length}>
                          <strong>{material.material_id}</strong>
                        </td>
                        <td style={styles.td} rowSpan={usage.length}>
                          {material.name}
                        </td>
                        <td style={styles.td} rowSpan={usage.length}>
                          <span style={styles.unit}>{material.unit}</span>
                        </td>
                      </>
                    )}
                    <td style={styles.td}>
                      <span style={styles.processChip}>{lineLabel}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.quantity}>{resource.quantity} {material.unit}</span>
                    </td>
                    <td style={styles.td}>
                      <input
                        type="text"
                        style={styles.input}
                        value={`${relLoc.x.toFixed(1)}, ${relLoc.z.toFixed(1)}`}
                        onChange={(e) => {
                          const values = e.target.value.split(',').map(v => parseFloat(v.trim()));
                          if (values.length === 2 && !values.some(isNaN)) {
                            updateResourceLocation(process.process_id, 'material', material.material_id, { x: values[0], y: 0, z: values[1] });
                          }
                        }}
                      />
                    </td>
                    <td style={styles.td}>
                      <input
                        type="text"
                        style={styles.input}
                        value={`${actualSize.x.toFixed(2)}, ${actualSize.y.toFixed(2)}, ${actualSize.z.toFixed(2)}`}
                        onChange={(e) => {
                          const values = e.target.value.split(',').map(v => parseFloat(v.trim()));
                          if (values.length === 3 && !values.some(isNaN)) {
                            // 입력된 실제 크기를 scale로 변환
                            const newScale = {
                              x: values[0] / baseSize.width,
                              y: values[1] / baseSize.height,
                              z: values[2] / baseSize.depth
                            };
                            updateResourceScale(process.process_id, 'material', material.material_id, newScale);
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
                            updateResourceRotation(process.process_id, 'material', material.material_id, deg * Math.PI / 180);
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
    backgroundColor: '#fff3e0',
    borderLeft: '3px solid #ff9800',
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
  unit: {
    color: '#666',
    fontSize: '12px',
    fontWeight: '500',
  },
  quantity: {
    fontSize: '12px',
    color: '#666',
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
  notUsed: {
    color: '#999',
    fontSize: '12px',
    fontStyle: 'italic',
  },
};

export default MaterialsTable;
