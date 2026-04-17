import React from 'react';
import { PolicyTemplateModal } from '@/components/sidebar/operations/PolicyTemplateModal';
import { OperationsActionModal } from '@/components/sidebar/operations/OperationsActionModal';
import { useModalStore } from '@/store/ui/modalStore';

export const GlobalModals = () => {
  const { policyModalOpen, setPolicyModalOpen } = useModalStore();

  return (
    <>
      <PolicyTemplateModal isOpen={policyModalOpen} onClose={() => setPolicyModalOpen(false)} />
      <OperationsActionModal />
    </>
  );
};
