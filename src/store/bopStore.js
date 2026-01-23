import { create } from 'zustand';

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
    set({ bopData: data });
    console.log('[STORE] bopData updated');
  },

  setSelectedProcess: (processId, parallelIndex = 0) => {
    const key = `${processId}-${parallelIndex}`;
    set({ selectedProcessKey: key, selectedResourceKey: null });
  },

  clearSelection: () => set({ selectedProcessKey: null, selectedResourceKey: null }),

  // Set active tab
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Select a resource (with auto tab switching)
  setSelectedResource: (resourceType, resourceId, processId, parallelIndex) => {
    const key = `${resourceType}-${resourceId}-${processId}-${parallelIndex}`;
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

  // Helper to parse selectedProcessKey
  getSelectedProcessInfo: () => {
    const state = useBopStore.getState();
    if (!state.selectedProcessKey) return null;

    const parts = state.selectedProcessKey.split('-');
    const parallelIndex = parseInt(parts[parts.length - 1]);
    const processId = parts.slice(0, -1).join('-');

    return { processId, parallelIndex };
  },

  // Helper to parse selectedResourceKey
  getSelectedResourceInfo: () => {
    const state = useBopStore.getState();
    if (!state.selectedResourceKey) return null;

    const parts = state.selectedResourceKey.split('-');
    // Format: type-id-processId-parallelIndex
    // e.g., "equipment-EQ-ROBOT-01-P001-0"
    const parallelIndex = parseInt(parts[parts.length - 1]);
    const processId = parts[parts.length - 2];
    const resourceType = parts[0];
    const resourceId = parts.slice(1, -2).join('-');

    return { resourceType, resourceId, processId, parallelIndex };
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

    const updatedProcesses = state.bopData.processes.map(process => {
      if (process.process_id === processId) {
        const updatedResources = process.resources.map(resource => {
          if (resource.resource_type === resourceType && resource.resource_id === resourceId) {
            return {
              ...resource,
              relative_location: { ...newRelativeLocation }
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
  })
}));

export default useBopStore;
