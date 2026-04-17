export const buildProposalParams = ({
  action,
  targetId,
  count,
  pause,
}: {
  action: string;
  targetId: string;
  count: string;
  pause: boolean;
}) => {
  if (action === 'TRANSFER_LOCK' || action === 'TERMINATE_AGENT' || action === 'PAUSE_AGENT') {
    return { targetId, ...(action === 'PAUSE_AGENT' ? { pause } : {}) };
  }
  if (action === 'TOGGLE_STOP') {
    return { enable: pause };
  }
  if (action === 'SCALE_AGENTS') {
    return { count: Number(count || 0) };
  }
  return {};
};