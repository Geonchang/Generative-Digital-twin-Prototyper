import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Line, TransformControls } from '@react-three/drei';
import useBopStore from '../store/bopStore';
import { useState, useMemo, useCallback, useRef } from 'react';

// Process Box Component
function ProcessBox({ process, parallelIndex, isSelected, onSelect, onTransformMouseDown, onTransformMouseUp }) {
  const [hovered, setHovered] = useState(false);
  const { updateProcessLocation } = useBopStore();

  const groupRef = useRef();

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

  // 바운딩 박스 계산: 이 공정의 모든 리소스를 포함
  const calculateBoundingBox = () => {
    const resources = process.resources || [];

    // 이 병렬 라인에 해당하는 리소스만 필터링
    const filteredResources = resources.filter(resource => {
      return resource.parallel_line_index === undefined ||
             resource.parallel_line_index === null ||
             resource.parallel_line_index === parallelIndex;
    });

    if (filteredResources.length === 0) {
      // 리소스가 없으면 기본 크기
      return { width: 4, depth: 3, centerX: 0, centerZ: 0 };
    }

    // 모든 리소스의 relative_location을 확인하여 min/max 계산
    let minX = -2;  // 기본 최소값
    let maxX = 2;   // 기본 최대값
    let minZ = -1.5;
    let maxZ = 1.5;

    filteredResources.forEach(resource => {
      const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };
      const x = relLoc.x;
      const z = relLoc.z;

      minX = Math.min(minX, x - 0.5);  // 리소스 크기 고려 (±0.5m)
      maxX = Math.max(maxX, x + 0.5);
      minZ = Math.min(minZ, z - 0.5);
      maxZ = Math.max(maxZ, z + 0.5);
    });

    // 최소 크기 보장
    const width = Math.max(4, maxX - minX);
    const depth = Math.max(3, maxZ - minZ);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    return { width, depth, centerX, centerZ };
  };

  const boundingBox = calculateBoundingBox();

  // Transform change handler
  const handleObjectChange = () => {
    if (groupRef.current) {
      // Y축 고정
      groupRef.current.position.y = 0;

      // 새 위치 계산 (zOffset 제거)
      const newLocation = {
        x: groupRef.current.position.x,
        y: 0,
        z: groupRef.current.position.z - zOffset
      };

      // Store 업데이트
      updateProcessLocation(process.process_id, newLocation);
    }
  };

  return (
    <>
      <group ref={groupRef} position={position}>
      {/* Process box - 동적 크기 및 중심점 */}
      <mesh
        position={[boundingBox.centerX, 1, boundingBox.centerZ]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <boxGeometry args={[boundingBox.width, 2, boundingBox.depth]} />
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

      {/* TransformControls - 선택된 경우에만 표시 */}
      {isSelected && (
        <TransformControls
          object={groupRef}
          mode="translate"
          space="world"
          showX={true}
          showY={false}
          showZ={true}
          onObjectChange={handleObjectChange}
          onMouseDown={onTransformMouseDown}
          onMouseUp={onTransformMouseUp}
        />
      )}
    </>
  );
}

// Resource Marker Component with auto-layout
function ResourceMarker({ resource, processLocation, parallelIndex, equipmentData, workerData, materialData, resourceIndex, totalResources, processId, onTransformMouseDown, onTransformMouseUp }) {
  const [hovered, setHovered] = useState(false);
  const { selectedResourceKey, setSelectedResource, updateResourceLocation } = useBopStore();

  const groupRef = useRef();

  // 병렬 라인 Z축 오프셋
  const zOffset = parallelIndex * 5;

  // 리소스 위치 계산: relative_location이 명시적으로 설정되었으면 사용, 아니면 auto-layout
  const getPosition = () => {
    const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };

    // 명시적 위치가 있으면 사용
    if (relLoc.x !== 0 || relLoc.z !== 0) {
      return {
        x: relLoc.x,
        z: relLoc.z
      };
    }

    // Auto-layout: 공정 박스 내에서 겹치지 않게 배치
    const boxWidth = 4;  // X축 방향
    const boxDepth = 3;  // Z축 방향

    const cols = Math.ceil(Math.sqrt(totalResources));
    const rows = Math.ceil(totalResources / cols);
    const col = resourceIndex % cols;
    const row = Math.floor(resourceIndex / cols);

    const xSpacing = boxWidth / (cols + 1);
    const zSpacing = boxDepth / (rows + 1);

    return {
      x: (col + 1) * xSpacing - boxWidth / 2,
      z: (row + 1) * zSpacing - boxDepth / 2
    };
  };

  const autoPos = getPosition();

  // 실제 위치 = Process 위치 + relative_location
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

  // Calculate resource key and check if selected
  const resourceKey = `${resource.resource_type}-${resource.resource_id}-${processId}-${parallelIndex}`;
  const isSelected = selectedResourceKey === resourceKey;

  // Click handler
  const handleClick = (e) => {
    e.stopPropagation();
    setSelectedResource(resource.resource_type, resource.resource_id, processId, parallelIndex);
  };

  const color = isSelected ? '#ffeb3b' : (hovered ? '#ffeb3b' : getColor());
  const geometry = getGeometry();

  // Transform change handler
  const handleObjectChange = () => {
    if (groupRef.current) {
      // Y축 고정
      groupRef.current.position.y = 0;

      // 새 relative_location 계산
      const newRelativeLocation = {
        x: groupRef.current.position.x - processLocation.x,
        y: 0,
        z: (groupRef.current.position.z - zOffset) - processLocation.z
      };

      // Store 업데이트
      updateResourceLocation(
        processId,
        resource.resource_type,
        resource.resource_id,
        newRelativeLocation
      );
    }
  };

  return (
    <>
      <group ref={groupRef} position={[actualX, 0, actualZ]}>
      {/* Resource mesh */}
      <mesh
        position={[0, geometry.yOffset, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
      >
        {geometry.type === 'cylinder' ? (
          <cylinderGeometry args={geometry.args} />
        ) : (
          <boxGeometry args={geometry.args} />
        )}
        <meshStandardMaterial
          color={color}
          emissive={isSelected || hovered ? '#ffeb3b' : '#000000'}
          emissiveIntensity={isSelected ? 0.8 : (hovered ? 0.5 : 0)}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>

      {/* Resource label */}
      {(isSelected || hovered) && (
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

      {/* TransformControls - 선택된 경우에만 표시 */}
      {isSelected && (
        <TransformControls
          object={groupRef}
          mode="translate"
          space="world"
          showX={true}
          showY={false}
          showZ={true}
          onObjectChange={handleObjectChange}
          onMouseDown={onTransformMouseDown}
          onMouseUp={onTransformMouseUp}
        />
      )}
    </>
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
    selectedProcessKey,
    selectedResourceKey,
    setSelectedProcess,
    clearSelection,
    getEquipmentById,
    getWorkerById,
    getMaterialById,
    getProcessById
  } = useBopStore();

  const orbitControlsRef = useRef();

  // 빈 공간 클릭 시 선택 해제
  const handleBackgroundClick = useCallback((e) => {
    e.stopPropagation();
    clearSelection();
  }, [clearSelection]);

  // TransformControls 드래그 시작/종료 시 OrbitControls 제어
  const handleTransformMouseDown = useCallback(() => {
    if (orbitControlsRef.current) {
      orbitControlsRef.current.enabled = false;
    }
  }, []);

  const handleTransformMouseUp = useCallback(() => {
    if (orbitControlsRef.current) {
      // 즉시 활성화하지 않고 약간의 지연 후 활성화
      setTimeout(() => {
        if (orbitControlsRef.current) {
          orbitControlsRef.current.enabled = true;
        }
      }, 100);
    }
  }, []);

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
  const { size: gridSize, centerX: gridCenterX, centerZ: gridCenterZ } = useMemo(() => {
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
  }, [bopData.processes]);

  // Render processes and their resources
  const renderedElements = useMemo(() => {
    const elements = [];
    const arrows = [];

    bopData.processes.forEach((process) => {
      // 병렬 라인 수만큼 복제
      for (let parallelIdx = 0; parallelIdx < process.parallel_count; parallelIdx++) {
        const key = `${process.process_id}-parallel-${parallelIdx}`;
        const processKey = `${process.process_id}-${parallelIdx}`;
        const isSelected = selectedProcessKey === processKey;

        // Process box
        elements.push(
          <ProcessBox
            key={key}
            process={process}
            parallelIndex={parallelIdx}
            isSelected={isSelected}
            onSelect={() => setSelectedProcess(process.process_id, parallelIdx)}
            onTransformMouseDown={handleTransformMouseDown}
            onTransformMouseUp={handleTransformMouseUp}
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

        // Resources for this process instance - 병렬 라인별 필터링
        const resources = process.resources || [];
        const filteredResources = resources.filter(resource => {
          // parallel_line_index가 없으면 모든 라인에서 사용, 있으면 해당 라인만
          return resource.parallel_line_index === undefined ||
                 resource.parallel_line_index === null ||
                 resource.parallel_line_index === parallelIdx;
        });

        filteredResources.forEach((resource, resIdx) => {
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
              processId={process.process_id}
              equipmentData={equipmentData}
              workerData={workerData}
              materialData={materialData}
              resourceIndex={resIdx}
              totalResources={filteredResources.length}
              onTransformMouseDown={handleTransformMouseDown}
              onTransformMouseUp={handleTransformMouseUp}
            />
          );
        });
      }
    });

    return [...elements, ...arrows];
  }, [bopData.processes, selectedProcessKey, selectedResourceKey, setSelectedProcess, getEquipmentById, getWorkerById, getMaterialById, getProcessById, handleTransformMouseDown, handleTransformMouseUp]);

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
      {renderedElements}

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
        ref={orbitControlsRef}
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
