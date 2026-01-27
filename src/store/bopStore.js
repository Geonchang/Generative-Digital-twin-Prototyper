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

// Get effective position for a resource (handles auto-layout fallback)
// Must match Viewer3D.jsx ResourceMarker.getPosition() and ProcessBox.calculateBoundingBox()
function getEffectivePosition(resource, resourceIndex, totalResources) {
  const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };

  if (relLoc.x !== 0 || relLoc.z !== 0) {
    return { x: relLoc.x, z: relLoc.z };
  }

  // Auto-layout: grid placement within a 2×1.5 box
  const boxWidth = 2;
  const boxDepth = 1.5;
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

  resources.forEach((resource, resourceIndex) => {
    const pos = getEffectivePosition(resource, resourceIndex, resources.length);
    const x = pos.x;
    const z = pos.z;
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
  // Use effective position (including auto-layout fallback) to preserve world positions
  const updatedResources = process.resources.map((resource, resourceIndex) => {
    const effectivePos = getEffectivePosition(resource, resourceIndex, process.resources.length);
    const newRel = {
      x: effectivePos.x - centerX,
      y: resource.relative_location?.y || 0,
      z: effectivePos.z - centerZ
    };
    console.log(`      ${resource.resource_id}: (${effectivePos.x.toFixed(2)}, ${effectivePos.z.toFixed(2)}) → (${newRel.x.toFixed(2)}, ${newRel.z.toFixed(2)})`);
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

// ===== ID Generation Helpers =====

function generateNextProcessId(processes) {
  let maxNum = 0;
  processes.forEach(p => {
    const match = p.process_id.match(/^P(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  });
  return `P${String(maxNum + 1).padStart(3, '0')}`;
}

function generateNextEquipmentId(equipments) {
  let maxNum = 0;
  (equipments || []).forEach(e => {
    const match = e.equipment_id.match(/(\d+)$/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  });
  return `EQ-NEW-${String(maxNum + 1).padStart(2, '0')}`;
}

function generateNextWorkerId(workers) {
  let maxNum = 0;
  (workers || []).forEach(w => {
    const match = w.worker_id.match(/^W(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  });
  return `W${String(maxNum + 1).padStart(3, '0')}`;
}

function generateNextMaterialId(materials) {
  let maxNum = 0;
  (materials || []).forEach(m => {
    const match = m.material_id.match(/(\d+)$/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  });
  return `M-NEW-${String(maxNum + 1).padStart(3, '0')}`;
}

// Helper: get base ID and all member IDs for a process (handles parallel groups)
function getGroupIds(processes, processId) {
  const proc = processes.find(p => p.process_id === processId);
  if (!proc) return { baseId: processId, memberIds: [] };
  const baseId = proc.parent_id || proc.process_id;
  const memberIds = [baseId];
  processes.filter(p => p.parent_id === baseId).forEach(p => memberIds.push(p.process_id));
  // If baseId is an independent process (no children), memberIds = [baseId] only
  if (!processes.some(p => p.parent_id === baseId)) {
    return { baseId, memberIds: [baseId] };
  }
  return { baseId, memberIds };
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

        const updatedProcess = {
          ...process,
          resources: updatedResources
        };
        return normalizeProcessCenter(updatedProcess, state.bopData.equipments);
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

        const updatedProcess = {
          ...process,
          resources: updatedResources
        };
        return normalizeProcessCenter(updatedProcess, state.bopData.equipments);
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

        const updatedProcess = {
          ...process,
          resources: updatedResources
        };
        return normalizeProcessCenter(updatedProcess, state.bopData.equipments);
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
  }),

  // ===================================================================
  // Process CRUD
  // ===================================================================

  // Add a new process. If afterProcessId is given, insert into the chain.
  addProcess: (options = {}) => set((state) => {
    if (!state.bopData) return state;

    const {
      name = '새 공정',
      description = '',
      cycle_time_sec = 60.0,
      afterProcessId = null
    } = options;

    const processes = state.bopData.processes;
    const newId = generateNextProcessId(processes);

    // Default position: rightmost process x + 5
    let newX = 0;
    processes.forEach(p => {
      if (p.location && !p.is_parent) {
        newX = Math.max(newX, p.location.x);
      }
    });
    newX += 5;

    const newProcess = {
      process_id: newId,
      name,
      description,
      cycle_time_sec,
      location: { x: newX, y: 0, z: 0 },
      rotation_y: 0,
      predecessor_ids: [],
      successor_ids: [],
      resources: []
    };

    let updatedProcesses = [...processes];

    if (afterProcessId) {
      const afterProc = processes.find(p => p.process_id === afterProcessId);
      if (afterProc) {
        // Resolve to parent for parallel children
        const baseId = afterProc.parent_id || afterProc.process_id;
        const baseProc = afterProc.parent_id
          ? processes.find(p => p.process_id === afterProc.parent_id) || afterProc
          : afterProc;
        const oldSuccIds = [...(baseProc.successor_ids || [])];

        newProcess.predecessor_ids = [baseId];
        newProcess.successor_ids = oldSuccIds;

        // Position after the reference process
        const refProc = afterProc.is_parent
          ? processes.find(p => p.parent_id === baseId)
          : afterProc;
        if (refProc?.location) {
          newProcess.location.x = refProc.location.x + 5;
        }

        // Reconnect links
        updatedProcesses = updatedProcesses.map(p => {
          const pBaseId = p.parent_id || p.process_id;

          // After-group: successor → newId
          if (pBaseId === baseId) {
            return { ...p, successor_ids: [newId] };
          }

          // Old successor groups: predecessor baseId → newId
          for (const succId of oldSuccIds) {
            const succProc = processes.find(sp => sp.process_id === succId);
            const succBaseId = succProc?.parent_id || succId;
            if (pBaseId === succBaseId) {
              return {
                ...p,
                predecessor_ids: (p.predecessor_ids || []).map(pid =>
                  pid === baseId ? newId : pid
                )
              };
            }
          }

          return p;
        });
      }
    }

    updatedProcesses.push(newProcess);

    return {
      bopData: { ...state.bopData, processes: updatedProcesses },
      selectedProcessKey: newId,
      activeTab: 'bop'
    };
  }),

  // Update process properties (name, description, cycle_time_sec).
  // For parallel groups, updates all siblings and parent together.
  updateProcess: (processId, fields) => set((state) => {
    if (!state.bopData) return state;

    const allowedFields = ['name', 'description', 'cycle_time_sec'];
    const updates = {};
    for (const key of allowedFields) {
      if (fields[key] !== undefined) updates[key] = fields[key];
    }
    if (Object.keys(updates).length === 0) return state;

    const target = state.bopData.processes.find(p => p.process_id === processId);
    if (!target) return state;

    // For parallel groups, collect all member IDs
    const groupIds = new Set([processId]);
    if (target.parent_id) {
      groupIds.add(target.parent_id);
      state.bopData.processes
        .filter(p => p.parent_id === target.parent_id)
        .forEach(p => groupIds.add(p.process_id));
    } else if (target.is_parent && target.children) {
      target.children.forEach(cid => groupIds.add(cid));
    }

    const updatedProcesses = state.bopData.processes.map(process =>
      groupIds.has(process.process_id) ? { ...process, ...updates } : process
    );

    return {
      bopData: { ...state.bopData, processes: updatedProcesses }
    };
  }),

  // Delete a process. For parallel groups, deletes the entire group.
  // Reconnects predecessor → successor links automatically.
  deleteProcess: (processId) => set((state) => {
    if (!state.bopData) return state;

    const processes = state.bopData.processes;
    const target = processes.find(p => p.process_id === processId);
    if (!target) return state;

    // Collect all IDs to remove (entire parallel group)
    const idsToRemove = new Set();
    const baseId = target.parent_id || target.process_id;

    if (target.is_parent || target.parent_id) {
      // Parallel group: remove parent + all children
      const parentId = target.parent_id || target.process_id;
      idsToRemove.add(parentId);
      processes.filter(p => p.parent_id === parentId).forEach(p => idsToRemove.add(p.process_id));
    } else {
      idsToRemove.add(processId);
    }

    // Get links from representative
    const representative = processes.find(p => p.process_id === baseId) || target;
    const predIds = representative.predecessor_ids || [];
    const succIds = representative.successor_ids || [];

    // Remove processes and reconnect links
    const updatedProcesses = processes
      .filter(p => !idsToRemove.has(p.process_id))
      .map(p => {
        let newSucc = p.successor_ids;
        let newPred = p.predecessor_ids;
        let changed = false;

        // Predecessors: replace baseId in successor_ids with deleted process's successors
        if (newSucc?.includes(baseId)) {
          newSucc = newSucc.flatMap(s => s === baseId ? succIds : [s]);
          changed = true;
        }

        // Successors: replace baseId in predecessor_ids with deleted process's predecessors
        if (newPred?.includes(baseId)) {
          newPred = newPred.flatMap(pid => pid === baseId ? predIds : [pid]);
          changed = true;
        }

        return changed ? { ...p, successor_ids: newSucc, predecessor_ids: newPred } : p;
      });

    return {
      bopData: { ...state.bopData, processes: updatedProcesses },
      selectedProcessKey: idsToRemove.has(state.selectedProcessKey) ? null : state.selectedProcessKey,
      selectedResourceKey: null
    };
  }),

  // Add a parallel line to a process or parallel group.
  addParallelLine: (processId) => set((state) => {
    if (!state.bopData) return state;

    const processes = state.bopData.processes;
    const target = processes.find(p => p.process_id === processId);
    if (!target) return state;

    // --- Scenario C: parent process → delegate using its own ID as parentId ---
    if (target.is_parent) {
      const parentId = target.process_id;
      const siblings = processes
        .filter(p => p.parent_id === parentId)
        .sort((a, b) => (a.parallel_index || 0) - (b.parallel_index || 0));
      if (siblings.length === 0) return state;

      const nextIndex = Math.max(...siblings.map(s => s.parallel_index ?? 0)) + 1;
      const newChildId = `${parentId}-${nextIndex}`;
      const firstSibling = siblings[0];

      const newChild = {
        process_id: newChildId,
        name: firstSibling.name,
        description: firstSibling.description,
        cycle_time_sec: firstSibling.cycle_time_sec,
        parent_id: parentId,
        parallel_index: nextIndex,
        location: {
          x: firstSibling.location.x,
          y: firstSibling.location.y || 0,
          z: firstSibling.location.z + nextIndex * 5
        },
        rotation_y: firstSibling.rotation_y || 0,
        predecessor_ids: firstSibling.predecessor_ids || [],
        successor_ids: firstSibling.successor_ids || [],
        resources: []
      };

      const updatedProcesses = processes.map(p => {
        if (p.process_id === parentId && p.is_parent) {
          return { ...p, children: [...(p.children || []), newChildId] };
        }
        return p;
      });
      updatedProcesses.push(newChild);

      return {
        bopData: { ...state.bopData, processes: updatedProcesses },
        selectedProcessKey: newChildId,
        activeTab: 'bop'
      };
    }

    // --- Scenario B: child of parallel group ---
    if (target.parent_id) {
      const parentId = target.parent_id;
      const siblings = processes
        .filter(p => p.parent_id === parentId)
        .sort((a, b) => (a.parallel_index || 0) - (b.parallel_index || 0));

      const nextIndex = Math.max(...siblings.map(s => s.parallel_index ?? 0)) + 1;
      const newChildId = `${parentId}-${nextIndex}`;
      const firstSibling = siblings[0];

      const newChild = {
        process_id: newChildId,
        name: firstSibling.name,
        description: firstSibling.description,
        cycle_time_sec: firstSibling.cycle_time_sec,
        parent_id: parentId,
        parallel_index: nextIndex,
        location: {
          x: firstSibling.location.x,
          y: firstSibling.location.y || 0,
          z: firstSibling.location.z + nextIndex * 5
        },
        rotation_y: firstSibling.rotation_y || 0,
        predecessor_ids: firstSibling.predecessor_ids || [],
        successor_ids: firstSibling.successor_ids || [],
        resources: []
      };

      const updatedProcesses = processes.map(p => {
        if (p.process_id === parentId && p.is_parent) {
          return { ...p, children: [...(p.children || []), newChildId] };
        }
        return p;
      });
      updatedProcesses.push(newChild);

      return {
        bopData: { ...state.bopData, processes: updatedProcesses },
        selectedProcessKey: newChildId,
        activeTab: 'bop'
      };
    }

    // --- Scenario A: independent process → convert to parallel group ---
    const child0Id = `${processId}-0`;
    const child1Id = `${processId}-1`;

    const child0 = {
      process_id: child0Id,
      name: target.name,
      description: target.description,
      cycle_time_sec: target.cycle_time_sec,
      parent_id: processId,
      parallel_index: 0,
      location: { ...(target.location || { x: 0, y: 0, z: 0 }) },
      rotation_y: target.rotation_y || 0,
      predecessor_ids: target.predecessor_ids || [],
      successor_ids: target.successor_ids || [],
      resources: [...(target.resources || []).map(r => ({ ...r }))]
    };

    const child1 = {
      process_id: child1Id,
      name: target.name,
      description: target.description,
      cycle_time_sec: target.cycle_time_sec,
      parent_id: processId,
      parallel_index: 1,
      location: {
        x: (target.location || { x: 0 }).x,
        y: (target.location || { y: 0 }).y || 0,
        z: ((target.location || { z: 0 }).z) + 5
      },
      rotation_y: target.rotation_y || 0,
      predecessor_ids: target.predecessor_ids || [],
      successor_ids: target.successor_ids || [],
      resources: []
    };

    // Convert the original process into a parent
    const parentProcess = {
      process_id: processId,
      name: target.name,
      description: target.description,
      cycle_time_sec: target.cycle_time_sec,
      is_parent: true,
      children: [child0Id, child1Id],
      predecessor_ids: target.predecessor_ids || [],
      successor_ids: target.successor_ids || []
    };

    const updatedProcesses = processes.map(p =>
      p.process_id === processId ? parentProcess : p
    );
    updatedProcesses.push(child0, child1);

    return {
      bopData: { ...state.bopData, processes: updatedProcesses },
      selectedProcessKey: child1Id,
      activeTab: 'bop'
    };
  }),

  // Remove a parallel line from a parallel group.
  removeParallelLine: (processId) => set((state) => {
    if (!state.bopData) return state;

    const processes = state.bopData.processes;
    const target = processes.find(p => p.process_id === processId);
    if (!target) return state;

    // Scenario A & D: independent or parent → no-op
    if (!target.parent_id) return state;

    const parentId = target.parent_id;
    const siblings = processes.filter(p => p.parent_id === parentId);

    // --- Scenario B: 3+ lines → remove one child ---
    if (siblings.length > 2) {
      let updatedProcesses = processes.filter(p => p.process_id !== processId);

      // Re-index remaining siblings (keep IDs, just update parallel_index)
      const remainingSiblings = updatedProcesses
        .filter(p => p.parent_id === parentId)
        .sort((a, b) => (a.parallel_index || 0) - (b.parallel_index || 0));

      const reindexedIds = new Set(remainingSiblings.map(s => s.process_id));

      updatedProcesses = updatedProcesses.map(p => {
        // Update parent's children array
        if (p.process_id === parentId && p.is_parent) {
          return {
            ...p,
            children: remainingSiblings.map(s => s.process_id)
          };
        }
        // Re-assign parallel_index
        if (reindexedIds.has(p.process_id)) {
          const newIdx = remainingSiblings.findIndex(s => s.process_id === p.process_id);
          return { ...p, parallel_index: newIdx };
        }
        return p;
      });

      // Clear selection if deleted process was selected
      const newSelectedProcess = state.selectedProcessKey === processId
        ? null
        : state.selectedProcessKey;

      // Clear resource selection if it belonged to the deleted process
      let newSelectedResource = state.selectedResourceKey;
      if (newSelectedResource && newSelectedResource.endsWith(`:${processId}`)) {
        newSelectedResource = null;
      }

      return {
        bopData: { ...state.bopData, processes: updatedProcesses },
        selectedProcessKey: newSelectedProcess,
        selectedResourceKey: newSelectedResource
      };
    }

    // --- Scenario C: exactly 2 lines → dissolve group ---
    const remaining = siblings.find(s => s.process_id !== processId);
    if (!remaining) return state;

    const parent = processes.find(p => p.process_id === parentId);
    if (!parent) return state;

    // Convert remaining child to independent process using parent's ID
    const oldChildId = remaining.process_id;
    const independentProcess = {
      ...remaining,
      process_id: parentId,  // restore parent's original ID
      parent_id: undefined,
      parallel_index: undefined,
      predecessor_ids: parent.predecessor_ids || [],
      successor_ids: parent.successor_ids || []
    };
    // Clean up undefined keys
    delete independentProcess.parent_id;
    delete independentProcess.parallel_index;

    // Remove parent + both children, then add independent
    let updatedProcesses = processes.filter(
      p => p.process_id !== parentId && p.process_id !== processId && p.process_id !== oldChildId
    );

    // Replace references to old child ID in predecessor/successor links
    updatedProcesses = updatedProcesses.map(p => {
      let changed = false;
      let newPred = p.predecessor_ids;
      let newSucc = p.successor_ids;

      if (newPred && newPred.includes(oldChildId)) {
        newPred = newPred.map(id => id === oldChildId ? parentId : id);
        changed = true;
      }
      if (newSucc && newSucc.includes(oldChildId)) {
        newSucc = newSucc.map(id => id === oldChildId ? parentId : id);
        changed = true;
      }

      return changed ? { ...p, predecessor_ids: newPred, successor_ids: newSucc } : p;
    });

    updatedProcesses.push(independentProcess);

    // Update selection
    let newSelectedProcess = state.selectedProcessKey;
    if (newSelectedProcess === processId || newSelectedProcess === oldChildId) {
      newSelectedProcess = parentId;
    }

    // Clear resource selection if it belonged to deleted/renamed processes
    let newSelectedResource = state.selectedResourceKey;
    if (newSelectedResource) {
      if (newSelectedResource.endsWith(`:${processId}`) ||
          newSelectedResource.endsWith(`:${oldChildId}`)) {
        newSelectedResource = null;
      }
    }

    return {
      bopData: { ...state.bopData, processes: updatedProcesses },
      selectedProcessKey: newSelectedProcess,
      selectedResourceKey: newSelectedResource
    };
  }),

  // ===================================================================
  // Process Link (predecessor / successor) editing
  // ===================================================================

  linkProcesses: (fromId, toId) => set((state) => {
    if (!state.bopData) return state;
    const processes = state.bopData.processes;

    const fromGroup = getGroupIds(processes, fromId);
    const toGroup = getGroupIds(processes, toId);

    // Self-link → no-op
    if (fromGroup.baseId === toGroup.baseId) return state;

    // Already linked → no-op
    const fromBase = processes.find(p => p.process_id === fromGroup.baseId);
    if (fromBase && (fromBase.successor_ids || []).includes(toGroup.baseId)) return state;

    const updatedProcesses = processes.map(p => {
      const pId = p.process_id;
      let changed = false;
      let newSucc = p.successor_ids || [];
      let newPred = p.predecessor_ids || [];

      // From group members: add toBaseId to successor_ids
      if (fromGroup.memberIds.includes(pId)) {
        if (!newSucc.includes(toGroup.baseId)) {
          newSucc = [...newSucc, toGroup.baseId];
          changed = true;
        }
      }

      // To group members: add fromBaseId to predecessor_ids
      if (toGroup.memberIds.includes(pId)) {
        if (!newPred.includes(fromGroup.baseId)) {
          newPred = [...newPred, fromGroup.baseId];
          changed = true;
        }
      }

      return changed ? { ...p, successor_ids: newSucc, predecessor_ids: newPred } : p;
    });

    return { bopData: { ...state.bopData, processes: updatedProcesses } };
  }),

  unlinkProcesses: (fromId, toId) => set((state) => {
    if (!state.bopData) return state;
    const processes = state.bopData.processes;

    const fromGroup = getGroupIds(processes, fromId);
    const toGroup = getGroupIds(processes, toId);

    const updatedProcesses = processes.map(p => {
      const pId = p.process_id;
      let changed = false;
      let newSucc = p.successor_ids || [];
      let newPred = p.predecessor_ids || [];

      // From group members: remove toBaseId from successor_ids
      if (fromGroup.memberIds.includes(pId) && newSucc.includes(toGroup.baseId)) {
        newSucc = newSucc.filter(id => id !== toGroup.baseId);
        changed = true;
      }

      // To group members: remove fromBaseId from predecessor_ids
      if (toGroup.memberIds.includes(pId) && newPred.includes(fromGroup.baseId)) {
        newPred = newPred.filter(id => id !== fromGroup.baseId);
        changed = true;
      }

      return changed ? { ...p, successor_ids: newSucc, predecessor_ids: newPred } : p;
    });

    return { bopData: { ...state.bopData, processes: updatedProcesses } };
  }),

  // ===================================================================
  // Resource CRUD (resource ↔ process assignment)
  // ===================================================================

  // Add a resource to a process
  addResourceToProcess: (processId, resourceData) => set((state) => {
    if (!state.bopData) return state;

    const { resource_type, resource_id, quantity = 1, role = '' } = resourceData;
    if (!resource_type || !resource_id) return state;

    const newResource = {
      resource_type,
      resource_id,
      quantity,
      role,
      relative_location: { x: 0, y: 0, z: 0 },
      rotation_y: 0,
      scale: { x: 1, y: 1, z: 1 }
    };

    const updatedProcesses = state.bopData.processes.map(process => {
      if (process.process_id === processId) {
        // Prevent duplicates
        const exists = (process.resources || []).some(
          r => r.resource_type === resource_type && r.resource_id === resource_id
        );
        if (exists) return process;

        return {
          ...process,
          resources: [...(process.resources || []), newResource]
        };
      }
      return process;
    });

    return {
      bopData: { ...state.bopData, processes: updatedProcesses }
    };
  }),

  // Update resource properties within a process (role, quantity)
  updateResourceInProcess: (processId, resourceType, resourceId, fields) => set((state) => {
    if (!state.bopData) return state;

    const allowedFields = ['role', 'quantity'];

    const updatedProcesses = state.bopData.processes.map(process => {
      if (process.process_id === processId) {
        const updatedResources = (process.resources || []).map(resource => {
          if (resource.resource_type === resourceType && resource.resource_id === resourceId) {
            const updates = {};
            for (const key of allowedFields) {
              if (fields[key] !== undefined) updates[key] = fields[key];
            }
            return { ...resource, ...updates };
          }
          return resource;
        });
        return { ...process, resources: updatedResources };
      }
      return process;
    });

    return {
      bopData: { ...state.bopData, processes: updatedProcesses }
    };
  }),

  // Remove a resource from a process
  removeResourceFromProcess: (processId, resourceType, resourceId) => set((state) => {
    if (!state.bopData) return state;

    const updatedProcesses = state.bopData.processes.map(process => {
      if (process.process_id === processId) {
        const filtered = (process.resources || []).filter(
          r => !(r.resource_type === resourceType && r.resource_id === resourceId)
        );
        if (filtered.length === (process.resources || []).length) return process;

        const updatedProcess = { ...process, resources: filtered };
        return normalizeProcessCenter(updatedProcess, state.bopData.equipments);
      }
      return process;
    });

    const resourceKey = `${resourceType}:${resourceId}:${processId}`;

    return {
      bopData: { ...state.bopData, processes: updatedProcesses },
      selectedResourceKey: state.selectedResourceKey === resourceKey ? null : state.selectedResourceKey
    };
  }),

  // ===================================================================
  // Equipment Master CRUD
  // ===================================================================

  addEquipment: (data = {}) => set((state) => {
    if (!state.bopData) return state;

    const equipments = state.bopData.equipments || [];
    const newId = data.equipment_id || generateNextEquipmentId(equipments);

    // Prevent duplicate ID
    if (equipments.some(e => e.equipment_id === newId)) return state;

    const newEquipment = {
      equipment_id: newId,
      name: data.name || '새 장비',
      type: data.type || 'machine'
    };

    return {
      bopData: { ...state.bopData, equipments: [...equipments, newEquipment] }
    };
  }),

  updateEquipment: (equipmentId, fields) => set((state) => {
    if (!state.bopData) return state;

    const allowedFields = ['name', 'type'];
    const updatedEquipments = (state.bopData.equipments || []).map(eq => {
      if (eq.equipment_id === equipmentId) {
        const updates = {};
        for (const key of allowedFields) {
          if (fields[key] !== undefined) updates[key] = fields[key];
        }
        return { ...eq, ...updates };
      }
      return eq;
    });

    return {
      bopData: { ...state.bopData, equipments: updatedEquipments }
    };
  }),

  // Delete equipment from master list AND remove from all processes
  deleteEquipment: (equipmentId) => set((state) => {
    if (!state.bopData) return state;

    const updatedEquipments = (state.bopData.equipments || []).filter(
      eq => eq.equipment_id !== equipmentId
    );

    const updatedProcesses = state.bopData.processes.map(process => {
      if (!process.resources) return process;
      const filtered = process.resources.filter(
        r => !(r.resource_type === 'equipment' && r.resource_id === equipmentId)
      );
      if (filtered.length !== process.resources.length) {
        const updatedProcess = { ...process, resources: filtered };
        return normalizeProcessCenter(updatedProcess, updatedEquipments);
      }
      return process;
    });

    return {
      bopData: { ...state.bopData, equipments: updatedEquipments, processes: updatedProcesses },
      selectedResourceKey: null
    };
  }),

  // ===================================================================
  // Worker Master CRUD
  // ===================================================================

  addWorker: (data = {}) => set((state) => {
    if (!state.bopData) return state;

    const workers = state.bopData.workers || [];
    const newId = data.worker_id || generateNextWorkerId(workers);

    if (workers.some(w => w.worker_id === newId)) return state;

    const newWorker = {
      worker_id: newId,
      name: data.name || '새 작업자',
      skill_level: data.skill_level || 'Mid'
    };

    return {
      bopData: { ...state.bopData, workers: [...workers, newWorker] }
    };
  }),

  updateWorker: (workerId, fields) => set((state) => {
    if (!state.bopData) return state;

    const allowedFields = ['name', 'skill_level'];
    const updatedWorkers = (state.bopData.workers || []).map(w => {
      if (w.worker_id === workerId) {
        const updates = {};
        for (const key of allowedFields) {
          if (fields[key] !== undefined) updates[key] = fields[key];
        }
        return { ...w, ...updates };
      }
      return w;
    });

    return {
      bopData: { ...state.bopData, workers: updatedWorkers }
    };
  }),

  // Delete worker from master list AND remove from all processes
  deleteWorker: (workerId) => set((state) => {
    if (!state.bopData) return state;

    const updatedWorkers = (state.bopData.workers || []).filter(
      w => w.worker_id !== workerId
    );

    const updatedProcesses = state.bopData.processes.map(process => {
      if (!process.resources) return process;
      const filtered = process.resources.filter(
        r => !(r.resource_type === 'worker' && r.resource_id === workerId)
      );
      if (filtered.length !== process.resources.length) {
        const updatedProcess = { ...process, resources: filtered };
        return normalizeProcessCenter(updatedProcess, state.bopData.equipments);
      }
      return process;
    });

    return {
      bopData: { ...state.bopData, workers: updatedWorkers, processes: updatedProcesses },
      selectedResourceKey: null
    };
  }),

  // ===================================================================
  // Material Master CRUD
  // ===================================================================

  addMaterial: (data = {}) => set((state) => {
    if (!state.bopData) return state;

    const materials = state.bopData.materials || [];
    const newId = data.material_id || generateNextMaterialId(materials);

    if (materials.some(m => m.material_id === newId)) return state;

    const newMaterial = {
      material_id: newId,
      name: data.name || '새 자재',
      unit: data.unit || 'ea'
    };

    return {
      bopData: { ...state.bopData, materials: [...materials, newMaterial] }
    };
  }),

  updateMaterial: (materialId, fields) => set((state) => {
    if (!state.bopData) return state;

    const allowedFields = ['name', 'unit'];
    const updatedMaterials = (state.bopData.materials || []).map(m => {
      if (m.material_id === materialId) {
        const updates = {};
        for (const key of allowedFields) {
          if (fields[key] !== undefined) updates[key] = fields[key];
        }
        return { ...m, ...updates };
      }
      return m;
    });

    return {
      bopData: { ...state.bopData, materials: updatedMaterials }
    };
  }),

  // Delete material from master list AND remove from all processes
  deleteMaterial: (materialId) => set((state) => {
    if (!state.bopData) return state;

    const updatedMaterials = (state.bopData.materials || []).filter(
      m => m.material_id !== materialId
    );

    const updatedProcesses = state.bopData.processes.map(process => {
      if (!process.resources) return process;
      const filtered = process.resources.filter(
        r => !(r.resource_type === 'material' && r.resource_id === materialId)
      );
      if (filtered.length !== process.resources.length) {
        const updatedProcess = { ...process, resources: filtered };
        return normalizeProcessCenter(updatedProcess, state.bopData.equipments);
      }
      return process;
    });

    return {
      bopData: { ...state.bopData, materials: updatedMaterials, processes: updatedProcesses },
      selectedResourceKey: null
    };
  })
}));

export default useBopStore;
