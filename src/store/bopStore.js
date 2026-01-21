import { create } from 'zustand';

const useBopStore = create((set) => ({
  // Hierarchical BOP data - initially empty
  bopData: null,

  // Selection state
  selectedProcessId: null,

  // Chat messages
  messages: [], // { role: 'user' | 'assistant', content: string, timestamp: Date }

  // Actions
  setBopData: (data) => {
    console.log('[STORE] setBopData called with:', data);
    set({ bopData: data });
    console.log('[STORE] bopData updated');
  },

  setSelectedProcess: (processId) => set({ selectedProcessId: processId }),

  addMessage: (role, content) => set((state) => ({
    messages: [...state.messages, { role, content, timestamp: new Date() }]
  })),

  clearMessages: () => set({ messages: [] }),

  // Helper functions
  getEquipmentById: (equipmentId) => {
    const state = useBopStore.getState();
    return state.bopData.equipments.find(e => e.equipment_id === equipmentId);
  },

  getWorkerById: (workerId) => {
    const state = useBopStore.getState();
    return state.bopData.workers.find(w => w.worker_id === workerId);
  },

  getMaterialById: (materialId) => {
    const state = useBopStore.getState();
    return state.bopData.materials?.find(m => m.material_id === materialId);
  },

  getProcessById: (processId) => {
    const state = useBopStore.getState();
    return state.bopData.processes.find(p => p.process_id === processId);
  }
}));

export default useBopStore;
