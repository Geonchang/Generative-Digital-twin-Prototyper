import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text } from '@react-three/drei';
import useBopStore from '../store/bopStore';
import { useState } from 'react';

// Equipment Marker Component
function EquipmentMarker({ equipment, isActive }) {
  const [hovered, setHovered] = useState(false);

  const getEquipmentColor = (type) => {
    switch (type) {
      case 'robot': return '#4a90e2';
      case 'machine': return '#ff6b6b';
      case 'manual_station': return '#50c878';
      default: return '#888888';
    }
  };

  const getEquipmentShape = (type) => {
    switch (type) {
      case 'robot':
        return <cylinderGeometry args={[0.4, 0.4, 1.2, 8]} />;
      case 'machine':
        return <boxGeometry args={[0.8, 1, 0.8]} />;
      case 'manual_station':
        return <boxGeometry args={[0.6, 0.8, 0.6]} />;
      default:
        return <boxGeometry args={[0.5, 0.5, 0.5]} />;
    }
  };

  const color = hovered || isActive ? '#ffeb3b' : getEquipmentColor(equipment.type);

  return (
    <group position={[equipment.location.x, equipment.location.y, equipment.location.z]}>
      {/* Equipment base */}
      <mesh
        position={[0, 0.5, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {getEquipmentShape(equipment.type)}
        <meshStandardMaterial
          color={color}
          emissive={isActive ? '#ffeb3b' : '#000000'}
          emissiveIntensity={isActive ? 0.5 : 0}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>

      {/* Equipment label */}
      <Text
        position={[0, 1.5, 0]}
        fontSize={0.2}
        color="#333"
        anchorX="center"
        anchorY="middle"
      >
        {equipment.name}
      </Text>

      {/* Equipment ID */}
      <Text
        position={[0, 1.2, 0]}
        fontSize={0.15}
        color="#666"
        anchorX="center"
        anchorY="middle"
      >
        {equipment.equipment_id}
      </Text>
    </group>
  );
}

// Worker Marker Component
function WorkerMarker({ worker }) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={[worker.location.x, worker.location.y, worker.location.z]}>
      {/* Worker body (simple humanoid shape) */}
      {/* Head */}
      <mesh
        position={[0, 1.5, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial
          color={hovered ? '#7be87b' : '#50c878'}
          emissive={hovered ? '#50c878' : '#000000'}
          emissiveIntensity={hovered ? 0.3 : 0}
        />
      </mesh>

      {/* Body */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 0.8, 8]} />
        <meshStandardMaterial color="#50c878" />
      </mesh>

      {/* Worker label */}
      <Text
        position={[0, 1.9, 0]}
        fontSize={0.15}
        color="#333"
        anchorX="center"
        anchorY="middle"
      >
        {worker.name}
      </Text>
    </group>
  );
}

// Operation Box Component
function OperationBox({ operation, process, position, parallelIndex, isSelected, onSelect, equipment }) {
  const [hovered, setHovered] = useState(false);

  const getEquipmentColor = (type) => {
    switch (type) {
      case 'robot': return '#4a90e2';
      case 'machine': return '#ff6b6b';
      case 'manual_station': return '#50c878';
      default: return '#888888';
    }
  };

  const baseColor = equipment ? getEquipmentColor(equipment.type) : '#888888';
  const color = isSelected ? '#ffeb3b' : (hovered ? '#ffd54f' : baseColor);

  // Calculate opacity based on cycle time (longer operations are more opaque)
  const maxCycleTime = 100; // Assume max 100 seconds
  const opacity = 0.3 + (Math.min(operation.cycle_time_sec, maxCycleTime) / maxCycleTime) * 0.7;

  return (
    <group position={position}>
      <mesh
        position={[0, 0.25, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <boxGeometry args={[0.8, 0.5, 0.8]} />
        <meshStandardMaterial
          color={color}
          emissive={isSelected ? '#ffeb3b' : '#000000'}
          emissiveIntensity={isSelected ? 0.5 : 0}
          transparent={true}
          opacity={opacity}
        />
      </mesh>

      {/* Operation label (only show when hovered or selected) */}
      {(hovered || isSelected) && (
        <>
          <Text
            position={[0, 0.7, 0]}
            fontSize={0.12}
            color="#333"
            anchorX="center"
            anchorY="middle"
            maxWidth={2}
          >
            {operation.name}
          </Text>
          <Text
            position={[0, 0.5, 0]}
            fontSize={0.1}
            color="#666"
            anchorX="center"
            anchorY="middle"
          >
            {operation.cycle_time_sec}s
          </Text>
        </>
      )}

      {/* Parallel index indicator */}
      {parallelIndex > 0 && (
        <Text
          position={[0, -0.1, 0]}
          fontSize={0.08}
          color="#999"
          anchorX="center"
          anchorY="middle"
        >
          #{parallelIndex + 1}
        </Text>
      )}
    </group>
  );
}

function Scene() {
  const {
    bopData,
    selectedProcessId,
    selectedOperationId,
    setSelectedProcess,
    setSelectedOperation,
    getEquipmentById
  } = useBopStore();

  // 빈 공간 클릭 시 선택 해제
  const handleBackgroundClick = () => {
    setSelectedOperation(null);
    setSelectedProcess(null);
  };

  if (!bopData || !bopData.processes || bopData.processes.length === 0) {
    return (
      <>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Grid
          position={[0, 0, 0]}
          args={[20, 20]}
          cellSize={1}
          cellColor="#dddddd"
          sectionColor="#aaaaaa"
        />
        <Text position={[0, 1, 0]} fontSize={0.5} color="#999">
          No BOP Data
        </Text>
        <OrbitControls />
      </>
    );
  }

  // Render operations based on equipment locations
  const renderOperations = () => {
    const meshes = [];

    bopData.processes.forEach((process) => {
      process.operations.forEach((operation) => {
        const equipment = getEquipmentById(operation.equipment_id);

        if (equipment) {
          const loc = equipment.location;

          // Create parallel instances based on process.parallel_count
          for (let i = 0; i < process.parallel_count; i++) {
            const operationKey = `${operation.operation_id}-parallel-${i}`;
            const isSelected = selectedOperationId === operation.operation_id;

            // Offset parallel operations along X-axis
            const parallelOffset = i * 2;

            meshes.push(
              <OperationBox
                key={operationKey}
                operation={operation}
                process={process}
                position={[loc.x + parallelOffset + 0.5, loc.y + 1.2, loc.z]}
                parallelIndex={i}
                isSelected={isSelected}
                onSelect={() => {
                  setSelectedOperation(operation.operation_id);
                  setSelectedProcess(process.process_id);
                }}
                equipment={equipment}
              />
            );
          }
        }
      });
    });

    return meshes;
  };

  // Get active equipment (equipment used by selected operation)
  const getActiveEquipmentId = () => {
    if (!selectedOperationId) return null;

    for (const process of bopData.processes) {
      const operation = process.operations.find(op => op.operation_id === selectedOperationId);
      if (operation) {
        return operation.equipment_id;
      }
    }

    return null;
  };

  const activeEquipmentId = getActiveEquipmentId();

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <directionalLight position={[-10, 10, -5]} intensity={0.4} />

      {/* Grid with click handler for deselection */}
      <Grid
        position={[0, 0, 0]}
        args={[30, 30]}
        cellSize={1}
        cellColor="#dddddd"
        sectionColor="#aaaaaa"
        sectionThickness={1}
        fadeDistance={50}
        fadeStrength={1}
        onClick={handleBackgroundClick}
      />

      {/* Equipment markers */}
      {bopData.equipments.map((equipment) => (
        <EquipmentMarker
          key={equipment.equipment_id}
          equipment={equipment}
          isActive={activeEquipmentId === equipment.equipment_id}
        />
      ))}

      {/* Worker markers */}
      {bopData.workers.map((worker) => (
        <WorkerMarker key={worker.worker_id} worker={worker} />
      ))}

      {/* Operation boxes */}
      {renderOperations()}

      {/* Legend */}
      <group position={[-8, 2, 0]}>
        <Text position={[0, 1.5, 0]} fontSize={0.2} color="#333" anchorX="left">
          Legend:
        </Text>

        {/* Robot */}
        <mesh position={[0, 1, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.4, 8]} />
          <meshStandardMaterial color="#4a90e2" />
        </mesh>
        <Text position={[0.5, 1, 0]} fontSize={0.15} color="#333" anchorX="left">
          Robot
        </Text>

        {/* Machine */}
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color="#ff6b6b" />
        </mesh>
        <Text position={[0.5, 0.5, 0]} fontSize={0.15} color="#333" anchorX="left">
          Machine
        </Text>

        {/* Manual Station */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.25, 0.3, 0.25]} />
          <meshStandardMaterial color="#50c878" />
        </mesh>
        <Text position={[0.5, 0, 0]} fontSize={0.15} color="#333" anchorX="left">
          Manual
        </Text>

        {/* Worker */}
        <mesh position={[0, -0.5, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial color="#50c878" />
        </mesh>
        <Text position={[0.5, -0.5, 0]} fontSize={0.15} color="#333" anchorX="left">
          Worker
        </Text>
      </group>

      {/* Camera controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={50}
      />
    </>
  );
}

function Viewer3D() {
  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#f5f5f5' }}>
      <Canvas camera={{ position: [12, 8, 12], fov: 50 }}>
        <Scene />
      </Canvas>
    </div>
  );
}

export default Viewer3D;
