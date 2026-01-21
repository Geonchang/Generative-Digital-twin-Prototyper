import { create } from 'zustand';

const useBopStore = create((set) => ({
  // Hierarchical BOP data - initially empty
  bopData: null,

  // Selection state
  selectedProcessId: null,
  selectedOperationId: null,

  // Expanded processes (for hierarchical display)
  expandedProcessIds: new Set(),

  // Chat messages
  messages: [], // { role: 'user' | 'assistant', content: string, timestamp: Date }

  // Actions
  setBopData: (data) => {
    console.log('[STORE] setBopData called with:', data);
    set({ bopData: data });
    console.log('[STORE] bopData updated');
  },

  setSelectedProcess: (processId) => set({ selectedProcessId: processId }),

  setSelectedOperation: (operationId) => set((state) => {
    // operation을 선택할 때 해당 process도 자동으로 확장
    if (operationId) {
      const processId = operationId.split('-')[0]; // "P1-OP1" -> "P1"
      const expanded = new Set(state.expandedProcessIds);
      expanded.add(processId);
      return {
        selectedOperationId: operationId,
        expandedProcessIds: expanded
      };
    }
    return { selectedOperationId: operationId };
  }),

  toggleProcessExpand: (processId) => set((state) => {
    const expanded = new Set(state.expandedProcessIds);
    if (expanded.has(processId)) {
      expanded.delete(processId);
    } else {
      expanded.add(processId);
    }
    return { expandedProcessIds: expanded };
  }),

  expandAllProcesses: () => set((state) => {
    const allProcessIds = state.bopData.processes.map(p => p.process_id);
    return { expandedProcessIds: new Set(allProcessIds) };
  }),

  collapseAllProcesses: () => set({ expandedProcessIds: new Set() }),

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

  getProcessById: (processId) => {
    const state = useBopStore.getState();
    return state.bopData.processes.find(p => p.process_id === processId);
  }
}));

export default useBopStore;
