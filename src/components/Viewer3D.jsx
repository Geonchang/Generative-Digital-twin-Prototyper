import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Line, TransformControls } from '@react-three/drei';
import useBopStore from '../store/bopStore';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// Helper function: Get resource size based on type
function getResourceSize(resourceType, equipmentType) {
  if (resourceType === 'equipment') {
    switch (equipmentType) {
      case 'robot':
        return { width: 0.6, depth: 0.6 };  // cylinder radius 0.3 → diameter 0.6
      case 'machine':
        return { width: 0.8, depth: 0.8 };  // box [0.8, 1.2, 0.8]
      case 'manual_station':
        return { width: 0.6, depth: 0.6 };  // box [0.6, 1.0, 0.6]
      default:
        return { width: 0.4, depth: 0.4 };
    }
  } else if (resourceType === 'worker') {
    return { width: 0.5, depth: 0.5 };  // cylinder radius 0.25 → diameter 0.5
  } else if (resourceType === 'material') {
    return { width: 0.4, depth: 0.4 };  // box [0.4, 0.25, 0.4]
  }
  return { width: 0.4, depth: 0.4 };  // default
}

// Process Box Component
function ProcessBox({ process, parallelIndex, isSelected, onSelect, onTransformMouseDown, onTransformMouseUp, isDraggingTransformRef }) {
  const [hovered, setHovered] = useState(false);
  const [transformMode, setTransformMode] = useState('translate'); // 'translate', 'rotate'
  const { bopData, updateProcessLocation, updateProcessRotation } = useBopStore();

  const groupRef = useRef();
  const transformControlsRef = useRef();

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

  const color = isSelected ? '#ffeb3b' : (hovered ? '#ffd54f' : '#e0e0e0');

  // 바운딩 박스 계산: 이 공정의 모든 리소스를 포함 (useMemo로 최적화)
  const boundingBox = useMemo(() => {
    const resources = process.resources || [];

    // 이 병렬 라인에 해당하는 리소스만 필터링
    const filteredResources = resources.filter(resource => {
      return resource.parallel_line_index === undefined ||
             resource.parallel_line_index === null ||
             resource.parallel_line_index === parallelIndex;
    });

    if (filteredResources.length === 0) {
      // 리소스가 없으면 아주 작은 크기
      return { width: 0.5, depth: 0.5, centerX: 0, centerZ: 0 };
    }

    // 모든 리소스의 relative_location을 확인하여 min/max 계산
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    filteredResources.forEach(resource => {
      const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };
      const x = relLoc.x;
      const z = relLoc.z;

      // 리소스 타입별 실제 크기 가져오기
      let equipmentType = null;
      if (resource.resource_type === 'equipment' && bopData?.equipments) {
        const equipmentData = bopData.equipments.find(e => e.equipment_id === resource.resource_id);
        equipmentType = equipmentData?.type;
        if (!equipmentData) {
          console.warn(`[ProcessBox] Equipment not found: ${resource.resource_id} for process ${process.process_id}`);
        }
      }
      const resourceSize = getResourceSize(resource.resource_type, equipmentType);

      // 실제 리소스 크기로 바운더리 계산
      minX = Math.min(minX, x - resourceSize.width / 2);
      maxX = Math.max(maxX, x + resourceSize.width / 2);
      minZ = Math.min(minZ, z - resourceSize.depth / 2);
      maxZ = Math.max(maxZ, z + resourceSize.depth / 2);
    });

    // 리소스 바운더리에 여유 공간 추가 (+0.4m 각 방향)
    const margin = 0.8; // 총 0.8m (각 방향 0.4m)
    const width = (maxX - minX) + margin;
    const depth = (maxZ - minZ) + margin;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    console.log(`[ProcessBox] ${process.process_id}-${parallelIndex}: minX=${minX.toFixed(2)}, maxX=${maxX.toFixed(2)}, minZ=${minZ.toFixed(2)}, maxZ=${maxZ.toFixed(2)}, width=${width.toFixed(2)}, depth=${depth.toFixed(2)}, centerX=${centerX.toFixed(2)}, centerZ=${centerZ.toFixed(2)}`);

    return { width, depth, centerX, centerZ };
  }, [process.resources, process.process_id, parallelIndex, bopData?.equipments]);

  // group을 바운딩 박스의 실제 중심에 위치시킴
  const position = [
    process.location.x + boundingBox.centerX,
    0,
    process.location.z + boundingBox.centerZ + zOffset
  ];

  // Get rotation from process data (with default)
  const rotationY = process.rotation_y || 0;

  // Transform change handler
  const handleObjectChange = () => {
    if (groupRef.current) {
      if (transformMode === 'translate') {
        // Y축 고정
        groupRef.current.position.y = 0;

        // 새 위치 계산 (centerOffset과 zOffset 제거)
        const newLocation = {
          x: groupRef.current.position.x - boundingBox.centerX,
          y: 0,
          z: groupRef.current.position.z - boundingBox.centerZ - zOffset
        };

        // Store 업데이트
        updateProcessLocation(process.process_id, newLocation);
      } else if (transformMode === 'rotate') {
        // X, Z축 회전 고정, Y축만 허용
        groupRef.current.rotation.x = 0;
        groupRef.current.rotation.z = 0;

        // Y축 회전 업데이트
        updateProcessRotation(process.process_id, groupRef.current.rotation.y);
      }
    }
  };

  // Change TransformControls plane color to sky blue (공정용)
  useEffect(() => {
    if (transformControlsRef.current && isSelected) {
      const controls = transformControlsRef.current;

      // Access the gizmo object
      if (controls.children && controls.children.length > 0) {
        controls.traverse((child) => {
          // Find plane meshes (they have specific names like 'XY', 'YZ', 'XZ')
          if (child.name && (child.name === 'XY' || child.name === 'YZ' || child.name === 'XZ')) {
            if (child.material) {
              child.material.color.set('#00BFFF'); // Deep Sky Blue (하늘색)
            }
          }
        });
      }
    }
  }, [isSelected]);

  // Keyboard shortcuts for switching transform mode (T, R)
  useEffect(() => {
    if (!isSelected) return;

    const handleKeyDown = (e) => {
      if (e.key === 't' || e.key === 'T') {
        setTransformMode('translate');
      } else if (e.key === 'r' || e.key === 'R') {
        setTransformMode('rotate');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelected]);

  return (
    <>
      <group ref={groupRef} position={position} rotation={[0, rotationY, 0]}>
      {/* Process plane - 얇은 바닥 표시 */}
      <mesh
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-1}
        onPointerOver={() => {
          if (!isDraggingTransformRef.current) {
            setHovered(true);
          }
        }}
        onPointerOut={() => {
          if (!isDraggingTransformRef.current) {
            setHovered(false);
          }
        }}
        onClick={(e) => {
          if (!isDraggingTransformRef.current) {
            e.stopPropagation();
            onSelect();
          }
        }}
      >
        <planeGeometry args={[boundingBox.width, boundingBox.depth]} />
        <meshStandardMaterial
          color={color}
          emissive={isSelected ? '#ffeb3b' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
          transparent={true}
          opacity={0.3}
          side={2}
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
          ref={transformControlsRef}
          object={groupRef}
          mode={transformMode}
          space="world"
          showX={transformMode === 'translate'}
          showY={transformMode === 'rotate'}
          showZ={transformMode === 'translate'}
          onObjectChange={handleObjectChange}
          onMouseDown={onTransformMouseDown}
          onMouseUp={onTransformMouseUp}
        />
      )}
    </>
  );
}

// Resource Marker Component with auto-layout
function ResourceMarker({ resource, processLocation, processBoundingCenter, processRotation, parallelIndex, equipmentData, workerData, materialData, resourceIndex, totalResources, processId, onTransformMouseDown, onTransformMouseUp }) {
  const [hovered, setHovered] = useState(false);
  const [transformMode, setTransformMode] = useState('translate'); // 'translate', 'rotate', 'scale'
  const { selectedResourceKey, setSelectedResource, updateResourceLocation, updateResourceRotation, updateResourceScale } = useBopStore();

  const groupRef = useRef();
  const transformControlsRef = useRef();

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

    // Auto-layout: 공정 박스 내에서 겹치지 않게 배치 (컴팩트하게)
    const boxWidth = 2;  // X축 방향
    const boxDepth = 1.5;  // Z축 방향

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

  // 공정 회전을 고려한 좌표 변환
  // 1. relative_location은 process.location 기준
  // 2. 회전 중심 기준으로 변환 (boundingBox.center만큼 빼기)
  const centerRelativeX = autoPos.x - processBoundingCenter.x;
  const centerRelativeZ = autoPos.z - processBoundingCenter.z;

  // 3. 회전 변환 적용
  const rotatedX = centerRelativeX * Math.cos(processRotation) - centerRelativeZ * Math.sin(processRotation);
  const rotatedZ = centerRelativeX * Math.sin(processRotation) + centerRelativeZ * Math.cos(processRotation);

  // 4. 월드 좌표로 변환: process.location + boundingCenter + 회전된 좌표
  const actualX = processLocation.x + processBoundingCenter.x + rotatedX;
  const actualZ = processLocation.z + processBoundingCenter.z + rotatedZ + zOffset;

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

  // 디버깅 로그 (선택된 리소스만)
  if (isSelected) {
    console.log(`[ResourceMarker ${resource.resource_id}] processId=${processId}, parallelIndex=${parallelIndex}`);
    console.log(`  processLocation: (${processLocation.x.toFixed(2)}, ${processLocation.z.toFixed(2)})`);
    console.log(`  processBoundingCenter: (${processBoundingCenter.x.toFixed(2)}, ${processBoundingCenter.z.toFixed(2)})`);
    console.log(`  relative_location (autoPos): (${autoPos.x.toFixed(2)}, ${autoPos.z.toFixed(2)})`);
    console.log(`  zOffset: ${zOffset}`);
    console.log(`  processRotation: ${(processRotation * 180 / Math.PI).toFixed(1)}°`);
    console.log(`  centerRelative: (${centerRelativeX.toFixed(2)}, ${centerRelativeZ.toFixed(2)})`);
    console.log(`  after rotation: (${rotatedX.toFixed(2)}, ${rotatedZ.toFixed(2)})`);
    console.log(`  final actualPosition: (${actualX.toFixed(2)}, ${actualZ.toFixed(2)})`);
    console.log(`  expected (no rotation): (${(processLocation.x + autoPos.x).toFixed(2)}, ${(processLocation.z + autoPos.z + zOffset).toFixed(2)})`);
  }

  // Click handler
  const handleClick = (e) => {
    e.stopPropagation();
    setSelectedResource(resource.resource_type, resource.resource_id, processId, parallelIndex);
  };

  const color = isSelected ? '#ffeb3b' : (hovered ? '#ffeb3b' : getColor());
  const geometry = getGeometry();

  // Get rotation and scale from resource data (with defaults)
  // 객체의 최종 회전 = 공정 회전 + 객체 자체 회전
  const resourceRotationY = resource.rotation_y || 0;
  const rotationY = processRotation + resourceRotationY;
  const scale = resource.scale || { x: 1, y: 1, z: 1 };

  // Transform change handler
  const handleObjectChange = () => {
    if (groupRef.current) {
      if (transformMode === 'translate') {
        // Y축 고정
        groupRef.current.position.y = 0;

        // 1. 월드 좌표 → 공정 중심 기준 좌표
        const worldOffsetX = groupRef.current.position.x - processLocation.x - processBoundingCenter.x;
        const worldOffsetZ = groupRef.current.position.z - processLocation.z - processBoundingCenter.z - zOffset;

        // 2. 역회전 변환 (회전 중심 기준)
        const centerRelX = worldOffsetX * Math.cos(-processRotation) - worldOffsetZ * Math.sin(-processRotation);
        const centerRelZ = worldOffsetX * Math.sin(-processRotation) + worldOffsetZ * Math.cos(-processRotation);

        // 3. process.location 기준 상대 좌표로 변환 (boundingCenter 더하기)
        const newRelativeLocation = {
          x: centerRelX + processBoundingCenter.x,
          y: 0,
          z: centerRelZ + processBoundingCenter.z
        };

        // Store 업데이트
        updateResourceLocation(
          processId,
          resource.resource_type,
          resource.resource_id,
          newRelativeLocation
        );
      } else if (transformMode === 'rotate') {
        // X, Z축 회전 고정, Y축만 허용
        groupRef.current.rotation.x = 0;
        groupRef.current.rotation.z = 0;

        // 객체 자체 회전만 저장 (전체 회전에서 공정 회전을 뺌)
        const resourceOwnRotation = groupRef.current.rotation.y - processRotation;

        updateResourceRotation(
          processId,
          resource.resource_type,
          resource.resource_id,
          resourceOwnRotation
        );
      } else if (transformMode === 'scale') {
        // Scale 업데이트
        updateResourceScale(
          processId,
          resource.resource_type,
          resource.resource_id,
          {
            x: groupRef.current.scale.x,
            y: groupRef.current.scale.y,
            z: groupRef.current.scale.z
          }
        );
      }
    }
  };

  // Change TransformControls plane color to light green
  useEffect(() => {
    if (transformControlsRef.current && isSelected) {
      const controls = transformControlsRef.current;

      // Access the gizmo object
      if (controls.children && controls.children.length > 0) {
        controls.traverse((child) => {
          // Find plane meshes (they have specific names like 'XY', 'YZ', 'XZ')
          if (child.name && (child.name === 'XY' || child.name === 'YZ' || child.name === 'XZ')) {
            if (child.material) {
              child.material.color.set('#7FFF00'); // Chartreuse (연두색)
            }
          }
        });
      }
    }
  }, [isSelected]);

  // Keyboard shortcuts for switching transform mode (T, R, S)
  useEffect(() => {
    if (!isSelected) return;

    const handleKeyDown = (e) => {
      if (e.key === 't' || e.key === 'T') {
        setTransformMode('translate');
      } else if (e.key === 'r' || e.key === 'R') {
        setTransformMode('rotate');
      } else if (e.key === 's' || e.key === 'S') {
        setTransformMode('scale');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelected]);

  return (
    <>
      <group
        ref={groupRef}
        position={[actualX, 0, actualZ]}
        rotation={[0, rotationY, 0]}
        scale={[scale.x, scale.y, scale.z]}
      >
      {/* Resource mesh */}
      <mesh
        position={[0, geometry.yOffset, 0]}
        renderOrder={1}
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
          ref={transformControlsRef}
          object={groupRef}
          mode={transformMode}
          space="world"
          showX={transformMode === 'translate' || transformMode === 'scale'}
          showY={transformMode === 'rotate' || transformMode === 'scale'}
          showZ={transformMode === 'translate' || transformMode === 'scale'}
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
  const { bopData } = useBopStore();
  const zOffset = parallelIndex * 5;

  // 각 공정의 바운딩 박스 계산 (ProcessBox와 동일한 로직)
  const calculateBoundingBox = (process, pIndex) => {
    const resources = process.resources || [];
    const filteredResources = resources.filter(resource => {
      return resource.parallel_line_index === undefined ||
             resource.parallel_line_index === null ||
             resource.parallel_line_index === pIndex;
    });

    if (filteredResources.length === 0) {
      return { width: 0.5, depth: 0.5, centerX: 0, centerZ: 0 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    filteredResources.forEach(resource => {
      const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };
      const x = relLoc.x;
      const z = relLoc.z;

      // 리소스 타입별 실제 크기 가져오기
      let equipmentType = null;
      if (resource.resource_type === 'equipment' && bopData?.equipments) {
        const equipmentData = bopData.equipments.find(e => e.equipment_id === resource.resource_id);
        equipmentType = equipmentData?.type;
      }
      const resourceSize = getResourceSize(resource.resource_type, equipmentType);

      // 실제 리소스 크기로 바운더리 계산
      minX = Math.min(minX, x - resourceSize.width / 2);
      maxX = Math.max(maxX, x + resourceSize.width / 2);
      minZ = Math.min(minZ, z - resourceSize.depth / 2);
      maxZ = Math.max(maxZ, z + resourceSize.depth / 2);
    });

    const width = (maxX - minX) + 0.2;
    const depth = (maxZ - minZ) + 0.2;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    return { width, depth, centerX, centerZ };
  };

  const fromBBox = calculateBoundingBox(fromProcess, parallelIndex);
  const toBBox = calculateBoundingBox(toProcess, parallelIndex);

  // X축 방향으로 흐름 (왼쪽에서 오른쪽)
  // 공정 바운딩 박스의 실제 끝점 사용 (center offset 반영)
  const startX = fromProcess.location.x + fromBBox.centerX + (fromBBox.width / 2);
  const startZ = fromProcess.location.z + fromBBox.centerZ + zOffset;

  const endX = toProcess.location.x + toBBox.centerX - (toBBox.width / 2);
  const endZ = toProcess.location.z + toBBox.centerZ + zOffset;

  const points = [
    [startX, 1, startZ],
    [endX, 1, endZ]
  ];

  // Calculate arrow direction for the arrowhead
  const dx = endX - startX;
  const dz = endZ - startZ;
  const angle = Math.atan2(dz, dx); // XZ 평면에서의 각도 (X축 기준)

  return (
    <group>
      {/* Arrow line */}
      <Line
        points={points}
        color="#888888"
        lineWidth={2}
        dashed={false}
      />

      {/* Arrowhead (cone) pointing in arrow direction */}
      <mesh
        position={[endX, 1, endZ]}
        rotation={[0, -angle, -Math.PI / 2]}  // Z축으로 -90도(+X 방향으로 눕힘), Y축으로 -angle(방향 조정)
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
  const initialGridConfig = useRef(null);
  const isDraggingTransform = useRef(false);

  // BOP 프로젝트가 변경되면 그리드 설정 리셋
  useEffect(() => {
    const projectTitle = bopData?.project_title;
    const processCount = bopData?.processes?.length || 0;

    // 프로젝트나 공정 개수가 변경되면 그리드 재계산
    if (projectTitle !== initialGridConfig.current?.projectTitle ||
        processCount !== initialGridConfig.current?.processCount) {
      initialGridConfig.current = null;
    }
  }, [bopData?.project_title, bopData?.processes?.length]);

  // 빈 공간 클릭 시 선택 해제
  const handleBackgroundClick = useCallback((e) => {
    e.stopPropagation();
    clearSelection();
  }, [clearSelection]);

  // TransformControls 드래그 시작/종료 시 OrbitControls 제어
  const handleTransformMouseDown = useCallback(() => {
    isDraggingTransform.current = true;
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
      }, 200);
    }
    // 드래그 종료 후 짧은 시간 동안 hover 이벤트 무시
    setTimeout(() => {
      isDraggingTransform.current = false;
    }, 300);
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

  // 동적 그리드 크기 및 중심 계산 (초기 렌더링 시에만 계산)
  const { size: gridSize, centerX: gridCenterX, centerZ: gridCenterZ } = useMemo(() => {
    // 이미 초기 설정이 저장되어 있으면 그것을 사용
    if (initialGridConfig.current) {
      return initialGridConfig.current;
    }

    if (!bopData.processes || bopData.processes.length === 0) {
      return { size: 30, centerX: 0, centerZ: 0 };
    }

    let maxX = -Infinity;
    let minX = Infinity;
    let maxZ = -Infinity;
    let minZ = Infinity;

    bopData.processes.forEach(process => {
      // X축: 공정 흐름 방향 (동적 크기이므로 여유 공간 확보)
      const processMaxX = process.location.x + 3;
      const processMinX = process.location.x - 3;

      // Z축: 병렬 라인 방향 (동적 크기이므로 여유 공간 확보)
      const processMaxZ = process.location.z + (process.parallel_count - 1) * 5 + 2;
      const processMinZ = process.location.z - 2;

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

    const config = {
      size,
      centerX,
      centerZ,
      projectTitle: bopData.project_title,
      processCount: bopData.processes.length
    };

    // 초기 설정 저장
    initialGridConfig.current = config;

    return config;
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
            isDraggingTransformRef={isDraggingTransform}
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

        // 공정의 실제 중심 좌표 계산 (ProcessBox와 동일한 로직)
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        filteredResources.forEach(resource => {
          const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };
          const x = relLoc.x;
          const z = relLoc.z;

          let equipmentType = null;
          if (resource.resource_type === 'equipment' && bopData?.equipments) {
            const equipmentData = bopData.equipments.find(e => e.equipment_id === resource.resource_id);
            equipmentType = equipmentData?.type;
          }
          const resourceSize = getResourceSize(resource.resource_type, equipmentType);

          minX = Math.min(minX, x - resourceSize.width / 2);
          maxX = Math.max(maxX, x + resourceSize.width / 2);
          minZ = Math.min(minZ, z - resourceSize.depth / 2);
          maxZ = Math.max(maxZ, z + resourceSize.depth / 2);
        });

        const centerX = filteredResources.length > 0 ? (minX + maxX) / 2 : 0;
        const centerZ = filteredResources.length > 0 ? (minZ + maxZ) / 2 : 0;

        // Bounding center (회전 중심 오프셋)
        const boundingCenter = { x: centerX, z: centerZ };

        // 디버깅: ProcessBox와 Scene의 boundingBox 계산이 일치하는지 확인
        console.log(`[Scene boundingBox] ${process.process_id}-${parallelIdx}: centerX=${centerX.toFixed(2)}, centerZ=${centerZ.toFixed(2)}`);

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
              processBoundingCenter={boundingCenter}
              processRotation={process.rotation_y || 0}
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
        enableDamping={false}
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
