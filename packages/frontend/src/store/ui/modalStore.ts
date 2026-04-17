import { create } from 'zustand';

interface ModalState {
  policyModalOpen: boolean;
  setPolicyModalOpen: (isOpen: boolean) => void;
  
  operationsModalOpen: boolean;
  operationsTargetId: string;
  operationsActionType: 'slash' | 'dispute' | 'transfer_lock' | 'pause' | 'terminate' | 'halt';
  openOperationsModal: (targetId?: string, actionType?: 'slash' | 'dispute' | 'transfer_lock' | 'pause' | 'terminate' | 'halt') => void;
  closeOperationsModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  policyModalOpen: false,
  setPolicyModalOpen: (isOpen) => set({ policyModalOpen: isOpen }),

  operationsModalOpen: false,
  operationsTargetId: '',
  operationsActionType: 'transfer_lock',
  openOperationsModal: (targetId = '', actionType = 'transfer_lock') => 
    set({ operationsModalOpen: true, operationsTargetId: targetId, operationsActionType: actionType }),
  closeOperationsModal: () => set({ operationsModalOpen: false })
}));
