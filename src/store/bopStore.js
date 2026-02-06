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

  // Auto-layout: Z축 수직 배치 (고정 간격)
  const step = 0.9; // depth(0.6) + spacing(0.3)
  const z = resourceIndex * step - (totalResources - 1) * step / 2;

  return { x: 0, z: z };
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

    const relLoc = resource.relative_location || { x: 0, y: 0, z: 0 };
    console.log(`      - ${resource.resource_id}: relLoc(${relLoc.x.toFixed(2)}, ${relLoc.z.toFixed(2)}) → effective(${x.toFixed(2)}, ${z.toFixed(2)})`);

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
// New JSON structure: all details in parallel_lines, no representative values at process level
function expandParallelProcesses(bopData) {
  if (!bopData || !bopData.processes) return bopData;

  const expandedProcesses = [];
  let additionalEquipments = [];
  let additionalWorkers = [];
  // Build a mutable bopData reference for cumulative ID generation
  const mutableBopData = {
    equipments: [...(bopData.equipments || [])],
    workers: [...(bopData.workers || [])]
  };

  bopData.processes.forEach(process => {
    const parallelCount = process.parallel_count || 1;
    const parallelLines = process.parallel_lines || [];

    // Get first line info for parent process display (fallback to old structure for compatibility)
    const firstLine = parallelLines[0] || {};
    const parentName = firstLine.name || process.name || process.process_id;
    const parentDescription = firstLine.description ?? process.description ?? '';
    const parentCycleTime = firstLine.cycle_time_sec ?? process.cycle_time_sec ?? 60;

    // ALL processes become parent + child(ren) structure
    const parentProcess = {
      process_id: process.process_id,
      name: parentName,
      description: parentDescription,
      cycle_time_sec: parentCycleTime,
      is_parent: true,
      children: Array.from({ length: parallelCount }, (_, i) =>
        `${process.process_id}-${String(i + 1).padStart(2, '0')}`
      ),
      predecessor_ids: process.predecessor_ids || [],
      successor_ids: process.successor_ids || []
    };
    expandedProcesses.push(parentProcess);

    // Compute line 0 resources once for fallback cloning
    const line0Resources = (process.resources || [])
      .filter(r =>
        r.parallel_line_index === undefined ||
        r.parallel_line_index === null ||
        r.parallel_line_index === 0
      )
      .map(r => {
        const { parallel_line_index, ...rest } = r;
        return rest;
      });

    // Create child processes (actual parallel lines)
    for (let i = 0; i < parallelCount; i++) {
      // Filter resources assigned to this parallel line
      // - Material (1:N shared): unindexed materials go to ALL lines
      // - Equipment/Worker (1:1): unindexed ones go to line 0 only; line i>0 only gets explicit assignments
      const stripPLI = r => { const { parallel_line_index, ...rest } = r; return rest; };
      let res = (process.resources || [])
        .filter(r => {
          const isUnindexed = r.parallel_line_index === undefined || r.parallel_line_index === null;
          // Materials without index are shared across all lines
          if (r.resource_type === 'material' && isUnindexed) return true;
          // Line 0: include unindexed equipment/workers + explicitly assigned
          if (i === 0) return isUnindexed || r.parallel_line_index === 0;
          // Line i>0: only explicitly assigned
          return r.parallel_line_index === i;
        })
        .map(stripPLI);

      // If no equipment/workers for this line (i>0), clone them from line #0
      // Also copy materials from line 0 if this line has none (1:N sharing)
      if (i > 0) {
        const hasEqOrWorker = res.some(r => r.resource_type === 'equipment' || r.resource_type === 'worker');
        if (!hasEqOrWorker) {
          const line0EqWorkers = line0Resources.filter(r => r.resource_type !== 'material');
          const { clonedResources, newEquipments, newWorkers } =
            cloneResourcesForNewLine(line0EqWorkers, mutableBopData);
          const hasMaterials = res.some(r => r.resource_type === 'material');
          const materialCopies = hasMaterials ? [] :
            line0Resources.filter(r => r.resource_type === 'material').map(r => ({ ...r }));
          res = [...clonedResources, ...materialCopies, ...res];
          additionalEquipments.push(...newEquipments);
          additionalWorkers.push(...newWorkers);
          mutableBopData.equipments.push(...newEquipments);
          mutableBopData.workers.push(...newWorkers);
        }
      }

      // Get line info from parallel_lines (new structure) or fallback to process level (old structure)
      const lineInfo = parallelLines[i] || {};

      // For new lines without location, use first line as base and offset by Z axis
      const baseLocation = firstLine.location || process.location || { x: 0, y: 0, z: 0 };
      const childLocation = lineInfo.location || {
        x: baseLocation.x,
        y: baseLocation.y || 0,
        z: baseLocation.z + i * 5  // Z축으로 5m 간격
      };
      const childRotation = lineInfo.rotation_y ?? firstLine.rotation_y ?? process.rotation_y ?? 0;
      const childName = lineInfo.name || firstLine.name || process.name || process.process_id;
      const childDescription = lineInfo.description ?? firstLine.description ?? process.description ?? '';
      const childCycleTime = lineInfo.cycle_time_sec ?? firstLine.cycle_time_sec ?? process.cycle_time_sec ?? 60;

      const childProcess = {
        process_id: `${process.process_id}-${String(i + 1).padStart(2, '0')}`,
        name: childName,
        description: childDescription,
        cycle_time_sec: childCycleTime,
        parent_id: process.process_id,
        parallel_index: i + 1,  // 1-based
        location: childLocation,
        rotation_y: childRotation,
        predecessor_ids: process.predecessor_ids || [],
        successor_ids: process.successor_ids || [],
        resources: res
      };
      expandedProcesses.push(childProcess);
    }
  });

  return {
    ...bopData,
    processes: expandedProcesses,
    equipments: [...(bopData.equipments || []), ...additionalEquipments],
    workers: [...(bopData.workers || []), ...additionalWorkers]
  };
}

// Collapse parallel processes: convert separate processes back to parallel_count format
// JSON structure matches Excel: connection info + parallel_lines (no duplicate representative values)
function collapseParallelProcesses(bopData) {
  if (!bopData || !bopData.processes) return bopData;

  const collapsedProcesses = [];
  const collapsedGroups = new Set();  // Track which parallel groups have been collapsed

  bopData.processes.forEach(process => {
    if (process.is_parent) {
      // Skip parent processes (they're just logical grouping)
      // Do NOT mark as collapsed here — children handle that
    } else if (process.parent_id) {
      // Child process - group with siblings
      if (!collapsedGroups.has(process.parent_id)) {
        // Find all siblings
        const siblings = bopData.processes
          .filter(p => p.parent_id === process.parent_id)
          .sort((a, b) => (a.parallel_index || 0) - (b.parallel_index || 0));

        // Merge into single process with parallel_count
        // Only connection info at process level, all details in parallel_lines
        const collapsedProcess = {
          process_id: process.parent_id,
          parallel_count: siblings.length,
          predecessor_ids: siblings[0].predecessor_ids || [],
          successor_ids: siblings[0].successor_ids || [],
          // All line details in parallel_lines (no duplicate representative values)
          parallel_lines: siblings.map(sibling => ({
            parallel_index: sibling.parallel_index,
            name: sibling.name,
            description: sibling.description || '',
            cycle_time_sec: sibling.cycle_time_sec,
            location: sibling.location,
            rotation_y: sibling.rotation_y || 0
          })),
          resources: siblings.flatMap((sibling, index) =>
            (sibling.resources || []).map(r => ({
              ...r,
              parallel_line_index: index // Re-add parallel_line_index
            }))
          )
        };

        collapsedProcesses.push(collapsedProcess);
        collapsedGroups.add(process.parent_id);
      }
    } else {
      // Independent process (no parent) - should not happen in current structure
      // but handle for safety: wrap in parallel_lines format
      const { name, description, cycle_time_sec, location, rotation_y, ...rest } = process;
      collapsedProcesses.push({
        ...rest,
        parallel_count: 1,
        parallel_lines: [{
          parallel_index: 1,
          name,
          description: description || '',
          cycle_time_sec,
          location,
          rotation_y: rotation_y || 0
        }]
      });
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
    const match = e.equipment_id.match(/^EQ(\d+)$/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  });
  return `EQ${String(maxNum + 1).padStart(3, '0')}`;
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
    const match = m.material_id.match(/^M(\d+)$/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  });
  return `M${String(maxNum + 1).padStart(3, '0')}`;
}

function generateNextObstacleId(obstacles) {
  let maxNum = 0;
  (obstacles || []).forEach(o => {
    const match = o.obstacle_id.match(/^OBS(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  });
  return `OBS${String(maxNum + 1).padStart(3, '0')}`;
}

// Clone resources for a new parallel line:
// - equipment: create new master entry with new ID (1:1)
// - worker: create new master entry with new ID (1:1)
// - material: share same ID (1:N)
function cloneResourcesForNewLine(sourceResources, bopData) {
  const newEquipments = [];
  const newWorkers = [];
  // Track cumulative lists to avoid ID collisions within a single call
  let allEquipments = [...(bopData.equipments || [])];
  let allWorkers = [...(bopData.workers || [])];

  const clonedResources = (sourceResources || []).map(r => {
    if (r.resource_type === 'equipment') {
      const original = allEquipments.find(e => e.equipment_id === r.resource_id);
      const newId = generateNextEquipmentId(allEquipments);
      const idNumber = newId.match(/\d+/)?.[0] || '';
      const defaultName = idNumber ? `장비 ${idNumber}` : `장비 ${newId}`;
      const newEquip = {
        equipment_id: newId,
        name: original ? `${original.name} (복제)` : defaultName,
        type: original ? original.type : 'machine'
      };
      newEquipments.push(newEquip);
      allEquipments.push(newEquip);
      return { ...r, resource_id: newId };
    }

    if (r.resource_type === 'worker') {
      const original = allWorkers.find(w => w.worker_id === r.resource_id);
      const newId = generateNextWorkerId(allWorkers);
      const idNumber = newId.match(/\d+/)?.[0] || '';
      const defaultName = idNumber ? `작업자 ${idNumber}` : `작업자 ${newId}`;
      const newWorker = {
        worker_id: newId,
        name: original ? `${original.name} (복제)` : defaultName,
        skill_level: original ? original.skill_level : 'Mid'
      };
      newWorkers.push(newWorker);
      allWorkers.push(newWorker);
      return { ...r, resource_id: newId };
    }

    // material: share same ID
    return { ...r };
  });

  return { clonedResources, newEquipments, newWorkers };
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
  // Hierarchical BOP data - starts with empty structure
  bopData: {
    project_title: "새 프로젝트",
    target_uph: 60,
    processes: [],
    equipments: [],
    workers: [],
    materials: [],
    obstacles: []
  },

  // Flag to track if initial data load has happened (prevents auto-load after createNewScenario)
  initialLoadDone: true,

  // Selection state (processId-parallelIndex format, e.g., "P001-0", "P001-1")
  selectedProcessKey: null,

  // Resource selection state (type-id-processId-parallelIndex format, e.g., "equipment-EQ-ROBOT-01-P001-0")
  selectedResourceKey: null,

  // Active tab state
  activeTab: 'bop', // 'bop' | 'equipments' | 'workers' | 'materials' | 'obstacles'

  // Obstacle selection state
  selectedObstacleId: null,

  // Obstacle creation mode (Two-Click)
  obstacleCreationMode: false,
  obstacleCreationFirstClick: null, // { x, z }
  pendingObstacleType: 'fence', // 생성 대기 중인 장애물 유형

  // 3D Model toggle (true: GLB/FBX models, false: basic geometry)
  use3DModels: false,

  // Chat messages
  messages: [], // { role: 'user' | 'assistant', content: string, timestamp: Date }

  // LLM Model Selection
  selectedModel: 'gemini-2.5-flash',  // Default model
  supportedModels: {},  // { modelId: { provider: string, display: string } }

  // Actions
  setSelectedModel: (model) => set({ selectedModel: model }),
  setSupportedModels: (models) => set({ supportedModels: models }),

  setBopData: (data) => {
    console.log('[STORE] setBopData called with:', data);
    // Automatically expand parallel processes
    const expandedData = expandParallelProcesses(data);
    console.log('[STORE] Parallel processes expanded');
    set({ bopData: expandedData });
    console.log('[STORE] bopData updated');
  },

  setInitialLoadDone: (done) => set({ initialLoadDone: done }),

  // Update project settings (project_title, target_uph)
  updateProjectSettings: (fields) => set((state) => {
    if (!state.bopData) return state;

    const updates = {};
    if (fields.project_title !== undefined) {
      updates.project_title = fields.project_title;
    }
    if (fields.target_uph !== undefined) {
      const uph = parseInt(fields.target_uph, 10);
      if (isNaN(uph) || uph <= 0) {
        console.error('[STORE] Invalid target_uph:', fields.target_uph);
        return state;
      }
      updates.target_uph = uph;
    }

    return {
      bopData: { ...state.bopData, ...updates }
    };
  }),

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

  clearSelection: () => set({ selectedProcessKey: null, selectedResourceKey: null, selectedObstacleId: null }),

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

  // Update resource quantity (for materials)
  updateResourceQuantity: (processId, resourceType, resourceId, quantity) => set((state) => {
    if (!state.bopData) return state;

    const updatedProcesses = state.bopData.processes.map(process => {
      if (process.process_id === processId) {
        const updatedResources = process.resources.map(resource => {
          if (resource.resource_type === resourceType && resource.resource_id === resourceId) {
            return {
              ...resource,
              quantity: quantity
            };
          }
          return resource;
        });

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
    const childId = `${newId}-01`;

    // Default position: rightmost process x + 5
    let newX = 0;
    processes.forEach(p => {
      if (p.location && !p.is_parent) {
        newX = Math.max(newX, p.location.x);
      }
    });
    newX += 5;

    // Create parent + child pair (all processes are parent+child)
    const newParent = {
      process_id: newId,
      name,
      description,
      cycle_time_sec,
      is_parent: true,
      children: [childId],
      predecessor_ids: [],
      successor_ids: []
    };

    const newChild = {
      process_id: childId,
      name,
      description,
      cycle_time_sec,
      parent_id: newId,
      parallel_index: 1,
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

        // Set links on both parent and child
        newParent.predecessor_ids = [baseId];
        newParent.successor_ids = oldSuccIds;
        newChild.predecessor_ids = [baseId];
        newChild.successor_ids = oldSuccIds;

        // Position after the reference process
        const refProc = afterProc.is_parent
          ? processes.find(p => p.parent_id === baseId)
          : afterProc;
        if (refProc?.location) {
          newChild.location.x = refProc.location.x + 5;
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

    updatedProcesses.push(newParent, newChild);

    return {
      bopData: { ...state.bopData, processes: updatedProcesses },
      selectedProcessKey: childId,
      activeTab: 'bop'
    };
  }),

  // Update process properties (name, description, cycle_time_sec).
  // For parallel groups, updates all siblings and parent together.
  updateProcess: (processId, fields) => set((state) => {
    if (!state.bopData) return state;

    // Fields that can be updated individually per child process
    const individualFields = ['name', 'description', 'cycle_time_sec'];
    // Fields that update the entire parallel group
    const groupFields = ['location', 'rotation_y'];

    const individualUpdates = {};
    const groupUpdates = {};

    for (const key of individualFields) {
      if (fields[key] !== undefined) individualUpdates[key] = fields[key];
    }
    for (const key of groupFields) {
      if (fields[key] !== undefined) groupUpdates[key] = fields[key];
    }

    if (Object.keys(individualUpdates).length === 0 && Object.keys(groupUpdates).length === 0) {
      return state;
    }

    const target = state.bopData.processes.find(p => p.process_id === processId);
    if (!target) return state;

    // Determine which processes to update for group fields
    const groupIds = new Set();
    if (Object.keys(groupUpdates).length > 0) {
      groupIds.add(processId);
      if (target.parent_id) {
        groupIds.add(target.parent_id);
        state.bopData.processes
          .filter(p => p.parent_id === target.parent_id)
          .forEach(p => groupIds.add(p.process_id));
      } else if (target.is_parent && target.children) {
        target.children.forEach(cid => groupIds.add(cid));
      }
    }

    let updatedProcesses = state.bopData.processes.map(process => {
      let updated = process;

      // Apply individual updates only to the specific process
      if (process.process_id === processId && Object.keys(individualUpdates).length > 0) {
        updated = { ...updated, ...individualUpdates };
      }

      // Apply group updates to all processes in the group
      if (groupIds.has(process.process_id)) {
        updated = { ...updated, ...groupUpdates };
      }

      return updated;
    });

    // If we updated cycle_time_sec on a child, update parent to max of all children
    if (individualUpdates.cycle_time_sec !== undefined && target.parent_id) {
      const parentId = target.parent_id;
      const allChildren = updatedProcesses.filter(p => p.parent_id === parentId);
      if (allChildren.length > 0) {
        const maxChildCT = Math.max(...allChildren.map(c => c.cycle_time_sec || 0));
        updatedProcesses = updatedProcesses.map(p =>
          p.process_id === parentId ? { ...p, cycle_time_sec: maxChildCT } : p
        );
      }
    }

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
  // All processes are parent+child, so resolve parentId and add a new child.
  addParallelLine: (processId) => set((state) => {
    if (!state.bopData) return state;

    const processes = state.bopData.processes;
    const target = processes.find(p => p.process_id === processId);
    if (!target) return state;

    // Resolve parentId: target is either parent or child
    const parentId = target.is_parent ? target.process_id : target.parent_id;
    if (!parentId) return state;

    const siblings = processes
      .filter(p => p.parent_id === parentId)
      .sort((a, b) => (a.parallel_index || 0) - (b.parallel_index || 0));
    if (siblings.length === 0) return state;

    const nextIndex = Math.max(...siblings.map(s => s.parallel_index ?? 1)) + 1;
    const newChildId = `${parentId}-${String(nextIndex).padStart(2, '0')}`;
    const firstSibling = siblings[0];

    const { clonedResources, newEquipments, newWorkers } =
      cloneResourcesForNewLine(firstSibling.resources || [], state.bopData);

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
        z: firstSibling.location.z + (nextIndex - 1) * 5
      },
      rotation_y: firstSibling.rotation_y || 0,
      predecessor_ids: firstSibling.predecessor_ids || [],
      successor_ids: firstSibling.successor_ids || [],
      resources: clonedResources
    };

    const updatedProcesses = processes.map(p => {
      if (p.process_id === parentId && p.is_parent) {
        return { ...p, children: [...(p.children || []), newChildId] };
      }
      return p;
    });
    updatedProcesses.push(newChild);

    return {
      bopData: {
        ...state.bopData,
        processes: updatedProcesses,
        equipments: [...(state.bopData.equipments || []), ...newEquipments],
        workers: [...(state.bopData.workers || []), ...newWorkers]
      },
      selectedProcessKey: newChildId,
      activeTab: 'bop'
    };
  }),

  // Remove a parallel line from a parallel group.
  // Always keeps parent+child structure; re-indexes remaining children sequentially.
  removeParallelLine: (processId) => set((state) => {
    if (!state.bopData) return state;

    const processes = state.bopData.processes;
    const target = processes.find(p => p.process_id === processId);
    if (!target) return state;

    // Only children can be removed (not parent)
    if (!target.parent_id) return state;

    const parentId = target.parent_id;
    const siblings = processes.filter(p => p.parent_id === parentId);

    // Can't remove if only 1 child left
    if (siblings.length <= 1) return state;

    // Remove the target child
    let updatedProcesses = processes.filter(p => p.process_id !== processId);

    // Sort remaining siblings for re-indexing
    const remainingSiblings = updatedProcesses
      .filter(p => p.parent_id === parentId)
      .sort((a, b) => (a.parallel_index || 0) - (b.parallel_index || 0));

    // Build ID mapping: oldId → newId (for re-indexing)
    const idMap = {};
    const newChildrenIds = [];
    remainingSiblings.forEach((s, idx) => {
      const newIdx = idx + 1;  // 1-based
      const newId = `${parentId}-${String(newIdx).padStart(2, '0')}`;
      newChildrenIds.push(newId);
      if (s.process_id !== newId) {
        idMap[s.process_id] = newId;
      }
    });

    // Apply re-indexing: update parent's children, rename child IDs and parallel_index
    updatedProcesses = updatedProcesses.map(p => {
      // Update parent's children array
      if (p.process_id === parentId && p.is_parent) {
        return { ...p, children: newChildrenIds };
      }
      // Re-index siblings: update process_id and parallel_index
      if (p.parent_id === parentId) {
        const sortedIdx = remainingSiblings.findIndex(s => s.process_id === p.process_id);
        if (sortedIdx >= 0) {
          const newIdx = sortedIdx + 1;
          return {
            ...p,
            process_id: `${parentId}-${String(newIdx).padStart(2, '0')}`,
            parallel_index: newIdx
          };
        }
      }
      return p;
    });

    // Update selection if it was the deleted or renamed process
    let newSelectedProcess = state.selectedProcessKey;
    if (newSelectedProcess === processId) {
      newSelectedProcess = null;
    } else if (idMap[newSelectedProcess]) {
      newSelectedProcess = idMap[newSelectedProcess];
    }

    // Update resource selection if it referenced deleted or renamed process
    let newSelectedResource = state.selectedResourceKey;
    if (newSelectedResource) {
      if (newSelectedResource.endsWith(`:${processId}`)) {
        newSelectedResource = null;
      } else {
        for (const [oldId, newId] of Object.entries(idMap)) {
          if (newSelectedResource.endsWith(`:${oldId}`)) {
            newSelectedResource = newSelectedResource.replace(`:${oldId}`, `:${newId}`);
            break;
          }
        }
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

    // Extract number from ID (e.g., "EQ001" -> "001")
    const idNumber = newId.match(/\d+/)?.[0] || '';
    const defaultName = idNumber ? `새 장비 ${idNumber}` : '새 장비';

    const newEquipment = {
      equipment_id: newId,
      name: data.name || defaultName,
      type: data.type || 'manual_station'
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

    // Extract number from ID (e.g., "W001" -> "001")
    const idNumber = newId.match(/\d+/)?.[0] || '';
    const defaultName = idNumber ? `새 작업자 ${idNumber}` : '새 작업자';

    const newWorker = {
      worker_id: newId,
      name: data.name || defaultName,
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

    // Extract number from ID (e.g., "M001" -> "001")
    const idNumber = newId.match(/\d+/)?.[0] || '';
    const defaultName = idNumber ? `새 자재 ${idNumber}` : '새 자재';

    const newMaterial = {
      material_id: newId,
      name: data.name || defaultName,
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
  }),

  // ===================================================================
  // Obstacle CRUD
  // ===================================================================

  // Select an obstacle (with auto tab switching)
  setSelectedObstacle: (obstacleId) => set({
    selectedObstacleId: obstacleId,
    selectedProcessKey: null,
    selectedResourceKey: null,
    activeTab: 'obstacles'
  }),

  clearObstacleSelection: () => set({ selectedObstacleId: null }),

  // Get obstacle by ID
  getObstacleById: (obstacleId) => {
    const state = useBopStore.getState();
    if (!state.bopData || !state.bopData.obstacles) return null;
    return state.bopData.obstacles.find(o => o.obstacle_id === obstacleId);
  },

  // Add a new obstacle
  addObstacle: (data = {}) => set((state) => {
    if (!state.bopData) return state;

    const obstacles = state.bopData.obstacles || [];
    const newId = data.obstacle_id || generateNextObstacleId(obstacles);

    // Prevent duplicate ID
    if (obstacles.some(o => o.obstacle_id === newId)) return state;

    const obstacleType = data.type || state.pendingObstacleType || 'fence';

    // Default size based on obstacle type
    const getDefaultSize = (type) => {
      switch (type) {
        case 'fence': return { width: 3, height: 1.5, depth: 0.1 };
        case 'zone': return { width: 3, height: 0.05, depth: 3 };
        case 'pillar': return { width: 0.5, height: 3, depth: 0.5 };
        case 'wall': return { width: 4, height: 2.5, depth: 0.2 };
        default: return { width: 2, height: 2, depth: 0.1 };
      }
    };

    // Type-specific name
    const getDefaultName = (type) => {
      switch (type) {
        case 'fence': return '안전 펜스';
        case 'zone': return '위험 구역';
        case 'pillar': return '기둥';
        case 'wall': return '벽';
        default: return '새 장애물';
      }
    };

    const newObstacle = {
      obstacle_id: newId,
      name: data.name || getDefaultName(obstacleType),
      type: obstacleType,
      position: data.position || { x: 0, y: 0, z: 0 },
      size: data.size || getDefaultSize(obstacleType),
      rotation_y: data.rotation_y || 0
    };

    return {
      bopData: { ...state.bopData, obstacles: [...obstacles, newObstacle] },
      selectedObstacleId: newId,
      activeTab: 'obstacles'
    };
  }),

  // Update obstacle properties
  updateObstacle: (obstacleId, fields) => set((state) => {
    if (!state.bopData) return state;

    const allowedFields = ['name', 'type', 'position', 'size', 'rotation_y'];
    const updatedObstacles = (state.bopData.obstacles || []).map(obstacle => {
      if (obstacle.obstacle_id === obstacleId) {
        const updates = {};
        for (const key of allowedFields) {
          if (fields[key] !== undefined) updates[key] = fields[key];
        }
        return { ...obstacle, ...updates };
      }
      return obstacle;
    });

    return {
      bopData: { ...state.bopData, obstacles: updatedObstacles }
    };
  }),

  // Delete an obstacle
  deleteObstacle: (obstacleId) => set((state) => {
    if (!state.bopData) return state;

    const updatedObstacles = (state.bopData.obstacles || []).filter(
      o => o.obstacle_id !== obstacleId
    );

    return {
      bopData: { ...state.bopData, obstacles: updatedObstacles },
      selectedObstacleId: state.selectedObstacleId === obstacleId ? null : state.selectedObstacleId
    };
  }),

  // ===================================================================
  // Obstacle Two-Click Creation
  // ===================================================================

  setObstacleCreationMode: (enabled, type = null) => set((state) => ({
    obstacleCreationMode: enabled,
    obstacleCreationFirstClick: null,
    pendingObstacleType: type || state.pendingObstacleType
  })),

  // Toggle 3D models on/off
  toggleUse3DModels: () => set((state) => ({
    use3DModels: !state.use3DModels
  })),

  setPendingObstacleType: (type) => set({ pendingObstacleType: type }),

  setObstacleCreationFirstClick: (point) => set({
    obstacleCreationFirstClick: point
  }),

  // Create obstacle from two corner points
  createObstacleFromTwoClicks: (corner1, corner2) => set((state) => {
    if (!state.bopData) return state;

    const obstacles = state.bopData.obstacles || [];
    const newId = generateNextObstacleId(obstacles);
    const obstacleType = state.pendingObstacleType || 'fence';

    // Calculate center and size from two corners
    const centerX = (corner1.x + corner2.x) / 2;
    const centerZ = (corner1.z + corner2.z) / 2;
    const width = Math.abs(corner2.x - corner1.x);
    const depth = Math.abs(corner2.z - corner1.z);

    // Default height based on obstacle type
    const getDefaultHeight = (type) => {
      switch (type) {
        case 'fence': return 1.5;
        case 'zone': return 0.05;
        case 'pillar': return 3;
        case 'wall': return 2.5;
        default: return 2;
      }
    };

    // Type-specific name
    const getDefaultName = (type) => {
      switch (type) {
        case 'fence': return '안전 펜스';
        case 'zone': return '위험 구역';
        case 'pillar': return '기둥';
        case 'wall': return '벽';
        default: return '새 장애물';
      }
    };

    const newObstacle = {
      obstacle_id: newId,
      name: getDefaultName(obstacleType),
      type: obstacleType,
      position: { x: centerX, y: 0, z: centerZ },
      size: { width: Math.max(0.5, width), height: getDefaultHeight(obstacleType), depth: Math.max(0.5, depth) },
      rotation_y: 0
    };

    return {
      bopData: { ...state.bopData, obstacles: [...obstacles, newObstacle] },
      selectedObstacleId: newId,
      activeTab: 'obstacles',
      obstacleCreationMode: false,
      obstacleCreationFirstClick: null
    };
  }),

  // ===================================================================
  // Scenario Management (localStorage)
  // ===================================================================

  // Save current BOP as a scenario (collapsed format for consistency with exports)
  saveScenario: (name) => {
    const state = useBopStore.getState();
    if (!state.bopData) {
      throw new Error('저장할 BOP 데이터가 없습니다.');
    }

    // Save in collapsed format for consistency with JSON/Excel exports
    const collapsedData = collapseParallelProcesses(state.bopData);

    const scenarios = JSON.parse(localStorage.getItem('bop_scenarios') || '[]');
    const now = new Date().toISOString();

    // Check if scenario with this name exists
    const existingIndex = scenarios.findIndex(s => s.name === name);

    if (existingIndex >= 0) {
      // Update existing
      scenarios[existingIndex] = {
        ...scenarios[existingIndex],
        updatedAt: now,
        data: collapsedData
      };
    } else {
      // Create new
      const newScenario = {
        id: `scenario-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        createdAt: now,
        updatedAt: now,
        data: collapsedData
      };
      scenarios.push(newScenario);
    }

    localStorage.setItem('bop_scenarios', JSON.stringify(scenarios));
    return scenarios;
  },

  // Load a scenario (expand parallel processes for UI)
  loadScenario: (id) => set((state) => {
    const scenarios = JSON.parse(localStorage.getItem('bop_scenarios') || '[]');
    const scenario = scenarios.find(s => s.id === id);

    if (!scenario) {
      throw new Error('시나리오를 찾을 수 없습니다.');
    }

    // Expand parallel processes for UI rendering
    const expandedData = expandParallelProcesses(scenario.data);

    return {
      bopData: expandedData,
      selectedProcessKey: null,
      selectedResourceKey: null,
      selectedObstacleId: null
    };
  }),

  // Delete a scenario
  deleteScenario: (id) => {
    const scenarios = JSON.parse(localStorage.getItem('bop_scenarios') || '[]');
    const filtered = scenarios.filter(s => s.id !== id);
    localStorage.setItem('bop_scenarios', JSON.stringify(filtered));
    return filtered;
  },

  // List all scenarios
  listScenarios: () => {
    return JSON.parse(localStorage.getItem('bop_scenarios') || '[]');
  },

  // Create new empty scenario
  createNewScenario: () => set(() => ({
    bopData: {
      project_title: "새 프로젝트",
      target_uph: 60,
      processes: [],
      equipments: [],
      workers: [],
      materials: [],
      obstacles: []
    },
    selectedProcessKey: null,
    selectedResourceKey: null,
    selectedObstacleId: null,
    activeTab: 'bop'
  }))
}));

export default useBopStore;
