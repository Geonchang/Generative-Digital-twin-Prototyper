import { create } from 'zustand';

// Helper function: Get resource size based on type (copied from Viewer3D.jsx)
function getResourceSize(resourceType, equipmentType) {
  if (resourceType === 'equipment') {
    switch (equipmentType) {
      case 'robot':
        return { width: 0.6, height: 1.8, depth: 0.6 };
      case 'machine':
        return { width: 0.8, height: 1.2, depth: 0.8 };
      case 'manual_station':
        return { width: 0.6, height: 1.0, depth: 0.6 };
      default:
        return { width: 0.4, height: 0.4, depth: 0.4 };
    }
  } else if (resourceType === 'worker') {
    return { width: 0.5, height: 1.6, depth: 0.5 };
  } else if (resourceType === 'material') {
    return { width: 0.4, height: 0.25, depth: 0.4 };
  }
  return { width: 0.4, height: 0.4, depth: 0.4 };
}

// Calculate bounding box center for a process
function calculateBoundingBoxCenter(process, equipments) {
  const resources = process.resources || [];

  console.log(`    [calculateBoundingBoxCenter] 공정: ${process.name}, 리소스 ${resources.length}개`);

  if (resources.length === 0) {
    return { centerX: 0, centerZ: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  resources.forEach((resource) => {
    const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };
    const x = relLoc.x;
    const z = relLoc.z;
    const resourceRotation = resource.rotation_y || 0;
    const scale = resource.scale || { x: 1, y: 1, z: 1 };

    console.log(`      - ${resource.resource_id}: relative (${x.toFixed(2)}, ${z.toFixed(2)})`);

    // Get equipment type if applicable
    let equipmentType = null;
    if (resource.resource_type === 'equipment' && equipments) {
      const equipmentData = equipments.find(e => e.equipment_id === resource.resource_id);
      equipmentType = equipmentData?.type;
    }

    const baseSize = getResourceSize(resource.resource_type, equipmentType);
    const actualWidth = baseSize.width * scale.x;
    const actualDepth = baseSize.depth * scale.z;

    // Calculate 4 corners considering rotation
    const halfWidth = actualWidth / 2;
    const halfDepth = actualDepth / 2;
    const corners = [
      { x: -halfWidth, z: -halfDepth },
      { x: halfWidth, z: -halfDepth },
      { x: halfWidth, z: halfDepth },
      { x: -halfWidth, z: halfDepth }
    ];

    // Rotate each corner
    corners.forEach(corner => {
      const rotatedX = corner.x * Math.cos(resourceRotation) + corner.z * Math.sin(resourceRotation);
      const rotatedZ = -corner.x * Math.sin(resourceRotation) + corner.z * Math.cos(resourceRotation);

      const finalX = x + rotatedX;
      const finalZ = z + rotatedZ;

      minX = Math.min(minX, finalX);
      maxX = Math.max(maxX, finalX);
      minZ = Math.min(minZ, finalZ);
      maxZ = Math.max(maxZ, finalZ);
    });
  });

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  console.log(`    바운딩 박스 센터: (${centerX.toFixed(2)}, ${centerZ.toFixed(2)})`);

  return { centerX, centerZ };
}

// Normalize process center: adjust process.location and resource positions
// so that boundingBox.center is always (0, 0)
function normalizeProcessCenter(process, equipments) {
  console.log(`  [normalizeProcessCenter] 시작`);
  console.log(`    현재 공정 위치: (${process.location.x.toFixed(2)}, ${process.location.z.toFixed(2)})`);

  const { centerX, centerZ } = calculateBoundingBoxCenter(process, equipments);

  // If already centered, no change needed
  if (Math.abs(centerX) < 0.001 && Math.abs(centerZ) < 0.001) {
    console.log(`    이미 중앙 정렬됨 (center: ${centerX.toFixed(3)}, ${centerZ.toFixed(3)})`);
    return process;
  }

  console.log(`    센터 오프셋: (${centerX.toFixed(2)}, ${centerZ.toFixed(2)}) - 조정 필요!`);

  const processRotation = process.rotation_y || 0;

  // Adjust process.location by rotating the offset
  const rotatedOffsetX = centerX * Math.cos(processRotation) + centerZ * Math.sin(processRotation);
  const rotatedOffsetZ = -centerX * Math.sin(processRotation) + centerZ * Math.cos(processRotation);

  console.log(`    회전된 오프셋: (${rotatedOffsetX.toFixed(2)}, ${rotatedOffsetZ.toFixed(2)})`);

  const newLocation = {
    x: process.location.x + rotatedOffsetX,
    y: process.location.y || 0,
    z: process.location.z + rotatedOffsetZ
  };

  console.log(`    새 공정 위치: (${newLocation.x.toFixed(2)}, ${newLocation.z.toFixed(2)})`);
  console.log(`    모든 리소스의 relative_location 조정 (center offset 빼기)`);

  // Adjust all resources' relative_location by subtracting the center offset
  const updatedResources = process.resources.map(resource => {
    const oldRel = resource.relative_location || { x: 0, y: 0, z: 0 };
    const newRel = {
      x: (resource.relative_location?.x || 0) - centerX,
      y: resource.relative_location?.y || 0,
      z: (resource.relative_location?.z || 0) - centerZ
    };
    console.log(`      ${resource.resource_id}: (${oldRel.x.toFixed(2)}, ${oldRel.z.toFixed(2)}) → (${newRel.x.toFixed(2)}, ${newRel.z.toFixed(2)})`);
    return {
      ...resource,
      relative_location: newRel
    };
  });

  return {
    ...process,
    location: newLocation,
    resources: updatedResources
  };
}

// Expand parallel processes: convert parallel_count format to separate processes
function expandParallelProcesses(bopData) {
  if (!bopData || !bopData.processes) return bopData;

  const expandedProcesses = [];

  bopData.processes.forEach(process => {
    const parallelCount = process.parallel_count || 1;

    if (parallelCount > 1) {
      // Create parent process (logical grouping)
      const parentProcess = {
        process_id: process.process_id,
        name: process.name,
        description: process.description,
        cycle_time_sec: process.cycle_time_sec,
        is_parent: true,
        children: Array.from({ length: parallelCount }, (_, i) => `${process.process_id}-${i}`),
        predecessor_ids: process.predecessor_ids || [],
        successor_ids: process.successor_ids || []
      };
      expandedProcesses.push(parentProcess);

      // Create child processes (actual parallel processes)
      for (let i = 0; i < parallelCount; i++) {
        const childProcess = {
          process_id: `${process.process_id}-${i}`,
          name: process.name,
          description: process.description,
          cycle_time_sec: process.cycle_time_sec,
          parent_id: process.process_id,
          parallel_index: i,
          location: {
            x: process.location.x,
            y: process.location.y || 0,
            z: process.location.z + i * 5  // Z-offset: 5m per parallel process
          },
          rotation_y: process.rotation_y || 0,
          predecessor_ids: process.predecessor_ids || [],
          successor_ids: process.successor_ids || [],
          resources: (process.resources || [])
            .filter(r =>
              r.parallel_line_index === undefined ||
              r.parallel_line_index === null ||
              r.parallel_line_index === i
            )
            .map(r => {
              // Remove parallel_line_index from resources
              const { parallel_line_index, ...rest } = r;
              return rest;
            })
        };
        expandedProcesses.push(childProcess);
      }
    } else {
      // Single process (no parallel lines)
      expandedProcesses.push({
        ...process,
        parallel_count: undefined // Remove parallel_count
      });
    }
  });

  return {
    ...bopData,
    processes: expandedProcesses
  };
}

// Collapse parallel processes: convert separate processes back to parallel_count format
function collapseParallelProcesses(bopData) {
  if (!bopData || !bopData.processes) return bopData;

  const collapsedProcesses = [];
  const processedParents = new Set();

  bopData.processes.forEach(process => {
    if (process.is_parent) {
      // Skip parent processes (they're just logical grouping)
      processedParents.add(process.process_id);
    } else if (process.parent_id) {
      // Child process - group with siblings
      if (!processedParents.has(process.parent_id)) {
        // Find all siblings
        const siblings = bopData.processes
          .filter(p => p.parent_id === process.parent_id)
          .sort((a, b) => (a.parallel_index || 0) - (b.parallel_index || 0));

        // Merge into single process with parallel_count
        const collapsedProcess = {
          process_id: process.parent_id,
          name: siblings[0].name, // Name is already correct (no suffix)
          description: siblings[0].description,
          cycle_time_sec: siblings[0].cycle_time_sec,
          parallel_count: siblings.length,
          location: {
            x: siblings[0].location.x,
            y: siblings[0].location.y || 0,
            z: siblings[0].location.z // First line's Z position
          },
          rotation_y: siblings[0].rotation_y || 0,
          predecessor_ids: siblings[0].predecessor_ids || [],
          successor_ids: siblings[0].successor_ids || [],
          resources: siblings.flatMap((sibling, index) =>
            sibling.resources.map(r => ({
              ...r,
              parallel_line_index: index // Re-add parallel_line_index
            }))
          )
        };

        collapsedProcesses.push(collapsedProcess);
        processedParents.add(process.parent_id);
      }
    } else {
      // Independent process (no parent)
      collapsedProcesses.push(process);
    }
  });

  return {
    ...bopData,
    processes: collapsedProcesses
  };
}

const useBopStore = create((set) => ({
  // Hierarchical BOP data - initially empty
  bopData: null,

  // Selection state (processId-parallelIndex format, e.g., "P001-0", "P001-1")
  selectedProcessKey: null,

  // Resource selection state (type-id-processId-parallelIndex format, e.g., "equipment-EQ-ROBOT-01-P001-0")
  selectedResourceKey: null,

  // Active tab state
  activeTab: 'bop', // 'bop' | 'equipments' | 'workers' | 'materials'

  // Chat messages
  messages: [], // { role: 'user' | 'assistant', content: string, timestamp: Date }

  // Actions
  setBopData: (data) => {
    console.log('[STORE] setBopData called with:', data);
    // Automatically expand parallel processes
    const expandedData = expandParallelProcesses(data);
    console.log('[STORE] Parallel processes expanded');
    set({ bopData: expandedData });
    console.log('[STORE] bopData updated');
  },

  // Export BOP data (collapse parallel processes back to parallel_count format)
  exportBopData: () => {
    const state = useBopStore.getState();
    if (!state.bopData) return null;
    console.log('[STORE] Exporting BOP data (collapsing parallel processes)');
    return collapseParallelProcesses(state.bopData);
  },

  setSelectedProcess: (processId) => {
    // Process ID is already unique (e.g., "P001-0", "P001-1")
    // Switch to BOP tab when process is selected
    set({ selectedProcessKey: processId, selectedResourceKey: null, activeTab: 'bop' });
  },

  clearSelection: () => set({ selectedProcessKey: null, selectedResourceKey: null }),

  // Set active tab
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Select a resource (with auto tab switching)
  setSelectedResource: (resourceType, resourceId, processId) => {
    // Use ':' as separator to avoid conflicts with hyphens in IDs
    // Format: type:resourceId:processId (e.g., "equipment:EQ-ROBOT-01:P001-0")
    const key = `${resourceType}:${resourceId}:${processId}`;
    const tabMap = {
      'equipment': 'equipments',
      'worker': 'workers',
      'material': 'materials'
    };
    set({
      selectedResourceKey: key,
      selectedProcessKey: null,
      activeTab: tabMap[resourceType] || 'bop'
    });
  },

  clearResourceSelection: () => set({ selectedResourceKey: null }),

  // Helper to get selected process info
  getSelectedProcessInfo: () => {
    const state = useBopStore.getState();
    if (!state.selectedProcessKey) return null;

    // selectedProcessKey is now the process_id itself (e.g., "P001-0")
    return { processId: state.selectedProcessKey };
  },

  // Helper to parse selectedResourceKey
  getSelectedResourceInfo: () => {
    const state = useBopStore.getState();
    if (!state.selectedResourceKey) return null;

    // Format: type:resourceId:processId (e.g., "equipment:EQ-ROBOT-01:P001-0")
    const parts = state.selectedResourceKey.split(':');
    if (parts.length !== 3) return null;

    const [resourceType, resourceId, processId] = parts;

    return { resourceType, resourceId, processId };
  },

  addMessage: (role, content) => set((state) => ({
    messages: [...state.messages, { role, content, timestamp: new Date() }]
  })),

  clearMessages: () => set({ messages: [] }),

  // Helper functions
  getEquipmentById: (equipmentId) => {
    const state = useBopStore.getState();
    if (!state.bopData || !state.bopData.equipments) return null;
    return state.bopData.equipments.find(e => e.equipment_id === equipmentId);
  },

  getWorkerById: (workerId) => {
    const state = useBopStore.getState();
    if (!state.bopData || !state.bopData.workers) return null;
    return state.bopData.workers.find(w => w.worker_id === workerId);
  },

  getMaterialById: (materialId) => {
    const state = useBopStore.getState();
    if (!state.bopData || !state.bopData.materials) return null;
    return state.bopData.materials.find(m => m.material_id === materialId);
  },

  getProcessById: (processId) => {
    const state = useBopStore.getState();
    if (!state.bopData || !state.bopData.processes) return null;
    return state.bopData.processes.find(p => p.process_id === processId);
  },

  // Update process location
  updateProcessLocation: (processId, newLocation) => set((state) => {
    if (!state.bopData) return state;

    const updatedProcesses = state.bopData.processes.map(process => {
      if (process.process_id === processId) {
        return {
          ...process,
          location: { ...newLocation }
        };
      }
      return process;
    });

    return {
      bopData: {
        ...state.bopData,
        processes: updatedProcesses
      }
    };
  }),

  // Update process rotation (Y-axis only)
  updateProcessRotation: (processId, rotationY) => set((state) => {
    if (!state.bopData) return state;

    const updatedProcesses = state.bopData.processes.map(process => {
      if (process.process_id === processId) {
        return {
          ...process,
          rotation_y: rotationY
        };
      }
      return process;
    });

    return {
      bopData: {
        ...state.bopData,
        processes: updatedProcesses
      }
    };
  }),

  // Update resource relative location
  updateResourceLocation: (processId, resourceType, resourceId, newRelativeLocation) => set((state) => {
    if (!state.bopData) return state;

    console.log(`\n[Store] updateResourceLocation`);
    console.log(`  processId: ${processId}`);
    console.log(`  resourceType: ${resourceType}, resourceId: ${resourceId}`);
    console.log(`  newRelativeLocation: (${newRelativeLocation.x.toFixed(2)}, ${newRelativeLocation.z.toFixed(2)})`);

    const updatedProcesses = state.bopData.processes.map(process => {
      if (process.process_id === processId) {
        console.log(`  ✓ 공정 찾음: ${process.name}`);
        console.log(`  리소스 개수: ${process.resources.length}`);

        const updatedResources = process.resources.map(resource => {
          if (resource.resource_type === resourceType && resource.resource_id === resourceId) {
            console.log(`    → ${resourceId} 업데이트: (${resource.relative_location.x.toFixed(2)}, ${resource.relative_location.z.toFixed(2)}) → (${newRelativeLocation.x.toFixed(2)}, ${newRelativeLocation.z.toFixed(2)})`);
            return {
              ...resource,
              relative_location: { ...newRelativeLocation }
            };
          }
          return resource;
        });

        // 수동 편집 시에는 normalizeProcessCenter를 호출하지 않음
        // (다른 리소스까지 움직이는 부작용 방지)
        console.log(`  ⚠️ normalizeProcessCenter 건너뜀 (수동 편집)`);
        return {
          ...process,
          resources: updatedResources
        };
      }
      return process;
    });

    return {
      bopData: {
        ...state.bopData,
        processes: updatedProcesses
      }
    };
  }),

  // Update resource rotation (Y-axis only)
  updateResourceRotation: (processId, resourceType, resourceId, rotationY) => set((state) => {
    if (!state.bopData) return state;

    const updatedProcesses = state.bopData.processes.map(process => {
      if (process.process_id === processId) {
        const updatedResources = process.resources.map(resource => {
          if (resource.resource_type === resourceType && resource.resource_id === resourceId) {
            return {
              ...resource,
              rotation_y: rotationY
            };
          }
          return resource;
        });

        // 수동 편집 시에는 normalizeProcessCenter를 호출하지 않음
        return {
          ...process,
          resources: updatedResources
        };
      }
      return process;
    });

    return {
      bopData: {
        ...state.bopData,
        processes: updatedProcesses
      }
    };
  }),

  // Update resource scale (XYZ)
  updateResourceScale: (processId, resourceType, resourceId, scale) => set((state) => {
    if (!state.bopData) return state;

    const updatedProcesses = state.bopData.processes.map(process => {
      if (process.process_id === processId) {
        const updatedResources = process.resources.map(resource => {
          if (resource.resource_type === resourceType && resource.resource_id === resourceId) {
            return {
              ...resource,
              scale: { ...scale }
            };
          }
          return resource;
        });

        // 수동 편집 시에는 normalizeProcessCenter를 호출하지 않음
        return {
          ...process,
          resources: updatedResources
        };
      }
      return process;
    });

    return {
      bopData: {
        ...state.bopData,
        processes: updatedProcesses
      }
    };
  }),

  // Normalize all processes (useful for initial data load)
  normalizeAllProcesses: () => set((state) => {
    if (!state.bopData) return state;

    const updatedProcesses = state.bopData.processes.map(process =>
      normalizeProcessCenter(process, state.bopData.equipments)
    );

    return {
      bopData: {
        ...state.bopData,
        processes: updatedProcesses
      }
    };
  })
}));

export default useBopStore;
