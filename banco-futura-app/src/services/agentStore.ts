import { create } from 'zustand';

interface AgentState {
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
  setState: (newState: 'idle' | 'listening' | 'thinking' | 'speaking') => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  state: 'idle',
  setState: (newState) => set({ state: newState }),
}));
