import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Line } from '@react-three/drei';
import useBopStore from '../store/bopStore';
import { useState } from 'react';

// Process Box Component
function ProcessBox({ process, parallelIndex, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false);

  // Three.js 좌표계:
  // X축: 좌우 (right = +) - 공정 흐름 방향 (왼쪽에서 오른쪽)
  // Y축: 상하 (up = +) - 높이
  // Z축: 앞뒤 (toward camera = +, away = -)
  //
  // 공장 레이아웃:
  // X축: 공정 흐름 방향 (0, 5, 10, 15...)
  // Y축: 높이 (height) - 바닥은 0
  // Z축: 병렬 라인 방향 (parallel lines)

  // 병렬 라인은 Z축으로 5m씩 이동
  const zOffset = parallelIndex * 5;
  const position = [process.location.x, 0, process.location.z + zOffset];

  const color = isSelected ? '#ffeb3b' : (hovered ? '#ffd54f' : '#e0e0e0');

  return (
    <group position={position}>
      {/* Process box - y축을 0 기준으로 고정 */}
      <mesh
        position={[0, 1, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <boxGeometry args={[4, 2, 3]} />
        <meshStandardMaterial
          color={color}
          emissive={isSelected ? '#ffeb3b' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
          transparent={true}
          opacity={0.3}
        />
      </mesh>

      {/* Process label */}
      <Text
        position={[0, 2.5, 0]}
        fontSize={0.25}
        color="#333"
        anchorX="center"
        anchorY="middle"
      >
        {process.name}
      </Text>

      {/* Process ID and cycle time */}
      <Text
        position={[0, 2.2, 0]}
        fontSize={0.15}
        color="#666"
        anchorX="center"
        anchorY="middle"
      >
        {process.process_id} | {process.cycle_time_sec.toFixed(1)}s
      </Text>

      {/* Parallel indicator */}
      {parallelIndex > 0 && (
        <Text
          position={[0, 1.9, 0]}
          fontSize={0.12}
          color="#999"
          anchorX="center"
          anchorY="middle"
        >
          (병렬 #{parallelIndex + 1})
        </Text>
      )}
    </group>
  );
}

// Resource Marker Component with auto-layout
function ResourceMarker({ resource, processLocation, parallelIndex, equipmentData, workerData, materialData, resourceIndex, totalResources }) {
  const [hovered, setHovered] = useState(false);

  // 병렬 라인 Z축 오프셋
  const zOffset = parallelIndex * 5;

  // 리소스 자동 배치: 공정 박스 내에서 겹치지 않게 배치
  // 공정 박스: 4m × 3m (width × depth)
  // 리소스들을 공정 박스 내부에 균등 배치
  const getAutoLayoutPosition = () => {
    const boxWidth = 4;  // X축 방향
    const boxDepth = 3;  // Z축 방향

    // 리소스를 그리드로 배치
    const cols = Math.ceil(Math.sqrt(totalResources));
    const rows = Math.ceil(totalResources / cols);

    const col = resourceIndex % cols;
    const row = Math.floor(resourceIndex / cols);

    // 공정 박스 중심을 기준으로 분산
    const xSpacing = boxWidth / (cols + 1);
    const zSpacing = boxDepth / (rows + 1);

    const localX = (col + 1) * xSpacing - boxWidth / 2;
    const localZ = (row + 1) * zSpacing - boxDepth / 2;

    return { x: localX, z: localZ };
  };

  const autoPos = getAutoLayoutPosition();

  // 실제 위치 = Process 위치 + 자동 배치 위치
  const actualX = processLocation.x + autoPos.x;
  const actualZ = processLocation.z + zOffset + autoPos.z;

  const getColor = () => {
    if (resource.resource_type === 'equipment' && equipmentData) {
      switch (equipmentData.type) {
        case 'robot': return '#4a90e2';
        case 'machine': return '#ff6b6b';
        case 'manual_station': return '#50c878';
        default: return '#888888';
      }
    } else if (resource.resource_type === 'worker') {
      return '#50c878';
    } else if (resource.resource_type === 'material') {
      return '#ffa500';
    }
    return '#888888';
  };

  const getGeometry = () => {
    if (resource.resource_type === 'equipment' && equipmentData) {
      switch (equipmentData.type) {
        case 'robot':
          return { type: 'cylinder', args: [0.3, 0.3, 1.8, 8], yOffset: 0.9 };
        case 'machine':
          return { type: 'box', args: [0.8, 1.2, 0.8], yOffset: 0.6 };
        case 'manual_station':
          return { type: 'box', args: [0.6, 1.0, 0.6], yOffset: 0.5 };
        default:
          return { type: 'box', args: [0.4, 0.4, 0.4], yOffset: 0.2 };
      }
    } else if (resource.resource_type === 'worker') {
      return { type: 'cylinder', args: [0.25, 0.25, 1.6, 8], yOffset: 0.8 };
    } else if (resource.resource_type === 'material') {
      return { type: 'box', args: [0.4, 0.25, 0.4], yOffset: 0.125 };
    }
    return { type: 'box', args: [0.4, 0.4, 0.4], yOffset: 0.2 };
  };

  const getName = () => {
    if (resource.resource_type === 'equipment' && equipmentData) {
      return equipmentData.name;
    } else if (resource.resource_type === 'worker' && workerData) {
      return workerData.name;
    } else if (resource.resource_type === 'material' && materialData) {
      return `${materialData.name} (${resource.quantity}${materialData.unit})`;
    }
    return resource.resource_id;
  };

  const color = hovered ? '#ffeb3b' : getColor();
  const geometry = getGeometry();

  return (
    <group position={[actualX, 0, actualZ]}>
      {/* Resource mesh */}
      <mesh
        position={[0, geometry.yOffset, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {geometry.type === 'cylinder' ? (
          <cylinderGeometry args={geometry.args} />
        ) : (
          <boxGeometry args={geometry.args} />
        )}
        <meshStandardMaterial
          color={color}
          emissive={hovered ? '#ffeb3b' : '#000000'}
          emissiveIntensity={hovered ? 0.5 : 0}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>

      {/* Resource label */}
      {hovered && (
        <>
          <Text
            position={[0, geometry.yOffset * 2 + 0.3, 0]}
            fontSize={0.15}
            color="#333"
            anchorX="center"
            anchorY="middle"
            maxWidth={2}
          >
            {getName()}
          </Text>
          {resource.role && (
            <Text
              position={[0, geometry.yOffset * 2, 0]}
              fontSize={0.12}
              color="#666"
              anchorX="center"
              anchorY="middle"
            >
              ({resource.role})
            </Text>
          )}
        </>
      )}
    </group>
  );
}

// Process Flow Arrow Component with arrowhead
function ProcessFlowArrow({ fromProcess, toProcess, parallelIndex }) {
  const zOffset = parallelIndex * 5;

  // X축 방향으로 흐름 (왼쪽에서 오른쪽)
  const startX = fromProcess.location.x + 2;  // 공정 박스 오른쪽 끝
  const startZ = fromProcess.location.z + zOffset;

  const endX = toProcess.location.x - 2;  // 다음 공정 박스 왼쪽 끝
  const endZ = toProcess.location.z + zOffset;

  const points = [
    [startX, 1, startZ],
    [endX, 1, endZ]
  ];

  // Calculate arrow direction for the arrowhead
  // X축 방향 화살표이므로 Z축 중심 회전
  const dx = endX - startX;
  const dz = endZ - startZ;
  const angle = Math.atan2(dz, dx); // X축 기준 각도

  return (
    <group>
      {/* Arrow line */}
      <Line
        points={points}
        color="#888888"
        lineWidth={2}
        dashed={false}
      />

      {/* Arrowhead (cone) pointing in +X direction */}
      <mesh
        position={[endX, 1, endZ]}
        rotation={[0, 0, -Math.PI / 2 - angle]}  // Z축 회전으로 X축 방향 지향
      >
        <coneGeometry args={[0.15, 0.4, 8]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
    </group>
  );
}

// Background plane for click detection
function BackgroundPlane({ onBackgroundClick, gridSize, centerX, centerZ }) {
  return (
    <mesh
      position={[centerX, -0.01, centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={onBackgroundClick}
    >
      <planeGeometry args={[gridSize * 2, gridSize * 2]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

function Scene() {
  const {
    bopData,
    selectedProcessId,
    setSelectedProcess,
    getEquipmentById,
    getWorkerById,
    getMaterialById,
    getProcessById
  } = useBopStore();

  // 빈 공간 클릭 시 선택 해제
  const handleBackgroundClick = (e) => {
    e.stopPropagation();
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

  // 동적 그리드 크기 및 중심 계산
  const calculateGridParams = () => {
    if (!bopData.processes || bopData.processes.length === 0) {
      return { size: 30, centerX: 0, centerZ: 0 };
    }

    let maxX = -Infinity;
    let minX = Infinity;
    let maxZ = -Infinity;
    let minZ = Infinity;

    bopData.processes.forEach(process => {
      // X축: 공정 흐름 방향 (공정 박스 크기: 4m width)
      const processMaxX = process.location.x + 2;
      const processMinX = process.location.x - 2;

      // Z축: 병렬 라인 방향 (공정 박스 크기: 3m depth)
      const processMaxZ = process.location.z + (process.parallel_count - 1) * 5 + 1.5;
      const processMinZ = process.location.z - 1.5;

      maxX = Math.max(maxX, processMaxX);
      minX = Math.min(minX, processMinX);
      maxZ = Math.max(maxZ, processMaxZ);
      minZ = Math.min(minZ, processMinZ);
    });

    // Legend 위치도 고려 (x=-3, z=-5 근처)
    minX = Math.min(minX, -5);
    minZ = Math.min(minZ, -7);

    // 중심 계산
    const centerX = (maxX + minX) / 2;
    const centerZ = (maxZ + minZ) / 2;

    // 크기 계산 (여유 공간 +10m)
    const width = Math.abs(maxX - minX) + 10;
    const depth = Math.abs(maxZ - minZ) + 10;
    const size = Math.max(30, Math.ceil(Math.max(width, depth)));

    return { size, centerX, centerZ };
  };

  const { size: gridSize, centerX: gridCenterX, centerZ: gridCenterZ } = calculateGridParams();

  // Render processes and their resources
  const renderProcesses = () => {
    const elements = [];
    const arrows = [];

    bopData.processes.forEach((process) => {
      const isSelected = selectedProcessId === process.process_id;

      // 병렬 라인 수만큼 복제
      for (let parallelIdx = 0; parallelIdx < process.parallel_count; parallelIdx++) {
        const key = `${process.process_id}-parallel-${parallelIdx}`;

        // Process box
        elements.push(
          <ProcessBox
            key={key}
            process={process}
            parallelIndex={parallelIdx}
            isSelected={isSelected}
            onSelect={() => setSelectedProcess(process.process_id)}
          />
        );

        // Process flow arrows (successor 기반) - 첫 번째 병렬 라인만
        if (parallelIdx === 0 && Array.isArray(process.successor_ids) && process.successor_ids.length > 0) {
          process.successor_ids.forEach(successorId => {
            if (successorId) {
              const successorProcess = getProcessById(successorId);
              if (successorProcess) {
                arrows.push(
                  <ProcessFlowArrow
                    key={`${key}-arrow-${successorId}`}
                    fromProcess={process}
                    toProcess={successorProcess}
                    parallelIndex={0}
                  />
                );
              }
            }
          });
        }

        // Resources for this process instance
        const resources = process.resources || [];
        resources.forEach((resource, resIdx) => {
          const resKey = `${key}-resource-${resIdx}`;

          let equipmentData = null;
          let workerData = null;
          let materialData = null;

          if (resource.resource_type === 'equipment') {
            equipmentData = getEquipmentById(resource.resource_id);
          } else if (resource.resource_type === 'worker') {
            workerData = getWorkerById(resource.resource_id);
          } else if (resource.resource_type === 'material') {
            materialData = getMaterialById(resource.resource_id);
          }

          elements.push(
            <ResourceMarker
              key={resKey}
              resource={resource}
              processLocation={process.location}
              parallelIndex={parallelIdx}
              equipmentData={equipmentData}
              workerData={workerData}
              materialData={materialData}
              resourceIndex={resIdx}
              totalResources={resources.length}
            />
          );
        });
      }
    });

    return [...elements, ...arrows];
  };

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <directionalLight position={[-10, 10, -5]} intensity={0.4} />

      {/* Background plane for click detection */}
      <BackgroundPlane
        onBackgroundClick={handleBackgroundClick}
        gridSize={gridSize}
        centerX={gridCenterX}
        centerZ={gridCenterZ}
      />

      {/* Grid - 객체들의 중심에 배치 */}
      <Grid
        position={[gridCenterX, 0, gridCenterZ]}
        args={[gridSize, gridSize]}
        cellSize={1}
        cellColor="#dddddd"
        sectionColor="#aaaaaa"
        sectionThickness={1}
        fadeDistance={gridSize * 0.8}
        fadeStrength={1}
      />

      {/* Processes and Resources */}
      {renderProcesses()}

      {/* Axis Helper for debugging
      <axesHelper args={[10]} />
      <Text position={[5, 0, 0]} fontSize={0.5} color="red">+X</Text>
      <Text position={[0, 5, 0]} fontSize={0.5} color="green">+Y</Text>
      <Text position={[0, 0, 5]} fontSize={0.5} color="blue">+Z</Text>
      */}

      {/* Legend - positioned near the first process */}
      <group position={[-3, 0, -5]}>
        <Text position={[0, 3.2, 0]} fontSize={0.25} color="#333" anchorX="left">
          구성요소:
        </Text>

        {/* Robot */}
        <mesh position={[0, 2.5, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.6, 8]} />
          <meshStandardMaterial color="#4a90e2" />
        </mesh>
        <Text position={[0.5, 2.5, 0]} fontSize={0.15} color="#333" anchorX="left">
          Robot
        </Text>

        {/* Machine */}
        <mesh position={[0, 2.0, 0]}>
          <boxGeometry args={[0.3, 0.4, 0.3]} />
          <meshStandardMaterial color="#ff6b6b" />
        </mesh>
        <Text position={[0.5, 2.0, 0]} fontSize={0.15} color="#333" anchorX="left">
          Machine
        </Text>

        {/* Manual Station */}
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[0.25, 0.3, 0.25]} />
          <meshStandardMaterial color="#50c878" />
        </mesh>
        <Text position={[0.5, 1.5, 0]} fontSize={0.15} color="#333" anchorX="left">
          Manual
        </Text>

        {/* Worker */}
        <mesh position={[0, 1.0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.5, 8]} />
          <meshStandardMaterial color="#50c878" />
        </mesh>
        <Text position={[0.5, 1.0, 0]} fontSize={0.15} color="#333" anchorX="left">
          Worker
        </Text>

        {/* Material */}
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.15, 0.1, 0.15]} />
          <meshStandardMaterial color="#ffa500" />
        </mesh>
        <Text position={[0.5, 0.5, 0]} fontSize={0.15} color="#333" anchorX="left">
          Material
        </Text>
      </group>

      {/* Camera controls */}
      <OrbitControls
        target={[gridCenterX, 0, gridCenterZ]}
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={gridSize * 1.5}
      />
    </>
  );
}

function Viewer3D() {
  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#f5f5f5' }}>
      <Canvas camera={{ position: [15, 10, 15], fov: 50 }}>
        <Scene />
      </Canvas>
    </div>
  );
}

export default Viewer3D;
