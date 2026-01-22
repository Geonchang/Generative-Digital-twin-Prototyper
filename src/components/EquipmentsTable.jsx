import { useEffect, useRef } from 'react';
import useBopStore from '../store/bopStore';

function EquipmentsTable() {
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
        <h2 style={styles.title}>장비 마스터</h2>
        <div style={styles.count}>총 {bopData.equipments.length}개</div>
      </div>

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: '120px' }}>장비 ID</th>
              <th style={{ ...styles.th, minWidth: '200px' }}>장비명</th>
              <th style={{ ...styles.th, width: '120px' }}>유형</th>
              <th style={{ ...styles.th, minWidth: '250px' }}>사용 공정 및 위치</th>
            </tr>
          </thead>
          <tbody>
            {bopData.equipments.map((equipment) => {
              const usedProcesses = getProcessesUsingEquipment(equipment.equipment_id);

              return (
                <tr key={equipment.equipment_id} style={styles.row}>
                  <td style={styles.td}>
                    <strong>{equipment.equipment_id}</strong>
                  </td>
                  <td style={styles.td}>
                    {equipment.name}
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.typeBadge,
                        backgroundColor: getEquipmentTypeColor(equipment.type),
                      }}
                    >
                      {getEquipmentTypeLabel(equipment.type)}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {usedProcesses.length > 0 ? (
                      <div style={styles.processList}>
                        {usedProcesses.map(({ process, actualLocation, parallelLineIndex }, idx) => {
                          const lineLabel = parallelLineIndex !== undefined && parallelLineIndex !== null
                            ? `${process.process_id}-#${parallelLineIndex + 1}`
                            : process.process_id;

                          const resourceKey = `equipment-${equipment.equipment_id}-${process.process_id}-${parallelLineIndex || 0}`;
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
                                setSelectedResource('equipment', equipment.equipment_id, process.process_id, parallelLineIndex || 0);
                              }}
                            >
                              <span style={styles.processChip}>
                                {lineLabel}
                              </span>
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
    verticalAlign: 'middle',
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
