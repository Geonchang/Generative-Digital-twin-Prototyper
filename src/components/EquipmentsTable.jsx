import { useEffect, useRef, useState } from 'react';
import useBopStore from '../store/bopStore';
import { getResourceSize } from './Viewer3D';

function EquipmentsTable() {
  const { bopData, selectedResourceKey, setSelectedResource, updateResourceLocation, updateResourceScale, updateResourceRotation } = useBopStore();
  const selectedRowRef = useRef(null);
  const [editingCell, setEditingCell] = useState(null); // {equipmentId, processId, parallelIndex, field}

  // Auto-scroll to selected row
  useEffect(() => {
    if (selectedRowRef.current && selectedResourceKey) {
      selectedRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [selectedResourceKey]);

  if (!bopData || !bopData.equipments || bopData.equipments.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <p>장비 데이터가 없습니다.</p>
        </div>
      </div>
    );
  }

  const getEquipmentTypeLabel = (type) => {
    switch (type) {
      case 'robot': return '로봇';
      case 'machine': return '기계';
      case 'manual_station': return '수작업대';
      default: return type;
    }
  };

  const getEquipmentTypeColor = (type) => {
    switch (type) {
      case 'robot': return '#4a90e2';
      case 'machine': return '#ff6b6b';
      case 'manual_station': return '#50c878';
      default: return '#888';
    }
  };

  // 각 장비가 사용되는 공정 찾기 및 위치 정보
  const getProcessesUsingEquipment = (equipmentId) => {
    if (!bopData.processes) return [];
    const result = [];

    bopData.processes.forEach(process => {
      const resource = process.resources?.find(
        r => r.resource_type === 'equipment' && r.resource_id === equipmentId
      );

      if (resource) {
        // 실제 위치 = 공정 위치 + 상대 위치
        const actualLocation = {
          x: process.location.x + resource.relative_location.x,
          y: process.location.y + resource.relative_location.y,
          z: process.location.z + resource.relative_location.z,
        };

        result.push({
          process,
          resource,
          actualLocation,
        });
      }
    });

    return result;
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>장비 마스터</h2>
        <div style={styles.count}>총 {bopData.equipments.length}개</div>
      </div>

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: '100px' }}>장비 ID</th>
              <th style={{ ...styles.th, minWidth: '150px' }}>장비명</th>
              <th style={{ ...styles.th, width: '80px' }}>유형</th>
              <th style={{ ...styles.th, width: '100px' }}>사용 공정</th>
              <th style={{ ...styles.th, width: '120px' }}>Location (x,z)</th>
              <th style={{ ...styles.th, width: '150px' }}>Size (x,y,z)</th>
              <th style={{ ...styles.th, width: '80px' }}>Rotation (Y)</th>
            </tr>
          </thead>
          <tbody>
            {bopData.equipments.flatMap((equipment) => {
              const usedProcesses = getProcessesUsingEquipment(equipment.equipment_id);

              if (usedProcesses.length === 0) {
                return (
                  <tr key={equipment.equipment_id} style={styles.row}>
                    <td style={styles.td}><strong>{equipment.equipment_id}</strong></td>
                    <td style={styles.td}>{equipment.name}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.typeBadge, backgroundColor: getEquipmentTypeColor(equipment.type) }}>
                        {getEquipmentTypeLabel(equipment.type)}
                      </span>
                    </td>
                    <td style={styles.td} colSpan={4}><span style={styles.notUsed}>미사용</span></td>
                  </tr>
                );
              }

              return usedProcesses.map(({ process, resource }, idx) => {
                // process_id is now unique (e.g., "P001-0", "P001-1")
                const lineLabel = process.process_id;

                const resourceKey = `equipment:${equipment.equipment_id}:${process.process_id}`;
                const isSelected = selectedResourceKey === resourceKey;

                const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };
                const scale = resource.scale || { x: 1, y: 1, z: 1 };
                const rotationY = resource.rotation_y || 0;

                // 실제 geometry 크기 계산 (기본 크기 × scale)
                const baseSize = getResourceSize('equipment', equipment.type);
                const actualSize = {
                  x: baseSize.width * scale.x,
                  y: baseSize.height * scale.y,
                  z: baseSize.depth * scale.z
                };

                return (
                  <tr
                    key={`${equipment.equipment_id}-${process.process_id}`}
                    ref={isSelected ? selectedRowRef : null}
                    style={{
                      ...styles.row,
                      ...(isSelected ? styles.rowSelected : {}),
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedResource('equipment', equipment.equipment_id, process.process_id);
                    }}
                  >
                    {idx === 0 && (
                      <>
                        <td style={styles.td} rowSpan={usedProcesses.length}>
                          <strong>{equipment.equipment_id}</strong>
                        </td>
                        <td style={styles.td} rowSpan={usedProcesses.length}>
                          {equipment.name}
                        </td>
                        <td style={styles.td} rowSpan={usedProcesses.length}>
                          <span style={{ ...styles.typeBadge, backgroundColor: getEquipmentTypeColor(equipment.type) }}>
                            {getEquipmentTypeLabel(equipment.type)}
                          </span>
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
                            updateResourceLocation(process.process_id, 'equipment', equipment.equipment_id, { x: values[0], y: 0, z: values[1] });
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
                            updateResourceScale(process.process_id, 'equipment', equipment.equipment_id, newScale);
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
                            updateResourceRotation(process.process_id, 'equipment', equipment.equipment_id, deg * Math.PI / 180);
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
    backgroundColor: '#e3f2fd',
    borderLeft: '3px solid #4a90e2',
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
  typeBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    color: 'white',
    fontSize: '11px',
    borderRadius: '12px',
    fontWeight: 'bold',
  },
  processList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  processItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  processItemSelected: {
    backgroundColor: '#e3f2fd',
    borderLeft: '3px solid #4a90e2',
  },
  processChip: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    fontSize: '11px',
    borderRadius: '8px',
    fontWeight: '500',
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

export default EquipmentsTable;
