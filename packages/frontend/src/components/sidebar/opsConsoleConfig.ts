export const proposalActions = ['OVERRIDE', 'RELEASE', 'TRANSFER_LOCK', 'PAUSE_AGENT', 'TERMINATE_AGENT', 'TOGGLE_STOP', 'SCALE_AGENTS'] as const;

export const proposalActionHelp: Record<(typeof proposalActions)[number], string> = {
  OVERRIDE: 'Immediately hands lock authority to the human operator path.',
  RELEASE: 'Returns manual override control back to the normal scheduler.',
  TRANSFER_LOCK: 'Requests a lock handoff to one target agent ID.',
  PAUSE_AGENT: 'Pauses or resumes a single agent for review.',
  TERMINATE_AGENT: 'Removes one agent from active traffic management.',
  TOGGLE_STOP: 'Pauses or resumes the entire traffic pool.',
  SCALE_AGENTS: 'Changes the total active agent count for capacity control.',
};

export const governanceHelp = [
  { label: 'action', detail: 'Selects which governance path will execute after approvals.' },
  { label: 'threshold', detail: 'Minimum approvals required before a proposal becomes READY.' },
  { label: 'timelock', detail: 'Delay in milliseconds after approvals before EXECUTE is allowed.' },
];

export const governancePresets = [
  {
    label: 'Fast Transfer',
    description: 'Single approval lock handoff for an identified agent.',
    values: { action: 'TRANSFER_LOCK', reason: 'LOCK_HANDOFF', threshold: '1', timelockMs: '0', count: '2', pauseFlag: true },
  },
  {
    label: 'Night Ops',
    description: 'Two-step transfer policy for lower staffing windows and controlled handoffs.',
    values: { action: 'TRANSFER_LOCK', reason: 'NIGHT_OPS', threshold: '2', timelockMs: '300', count: '2', pauseFlag: true },
  },
  {
    label: 'Emergency Halt',
    description: 'Immediate stop proposal for sector-wide pause.',
    values: { action: 'TOGGLE_STOP', reason: 'SAFETY_HALT', threshold: '1', timelockMs: '0', count: '2', pauseFlag: true },
  },
  {
    label: 'Capacity Shift',
    description: 'Two-step approval for scaling active agents.',
    values: { action: 'SCALE_AGENTS', reason: 'CAPACITY_SHIFT', threshold: '2', timelockMs: '500', count: '4', pauseFlag: true },
  },
  {
    label: 'Capacity Surge',
    description: 'Higher slot expansion with approvals for sustained throughput spikes.',
    values: { action: 'SCALE_AGENTS', reason: 'CAPACITY_SURGE', threshold: '2', timelockMs: '250', count: '6', pauseFlag: true },
  },
];

export const isolationHelp = [
  { label: 'finalize', detail: 'Commits a pending isolated side effect into the canonical task record.' },
  { label: 'rollback', detail: 'Reverts a task and clears staged effects using the supplied operator reason.' },
  { label: 'admin', detail: 'Optional operator ID used for explicit human-in-the-loop actions.' },
];

export const isolationPresets = [
  {
    label: 'Rollback Safe',
    description: 'Prepares a conservative rollback reason for guarded recovery.',
    values: { adminUuid: '', reason: 'SAFE_ROLLBACK' },
  },
  {
    label: 'Admin Review',
    description: 'Marks the task for explicit human validation before finalize or cancel.',
    values: { adminUuid: 'operator-1', reason: 'ADMIN_REVIEW' },
  },
];

export const settlementHelp = [
  { label: 'dispute', detail: 'Opens a challenge on a snapshot nonce when the channel state looks stale or unsafe.' },
  { label: 'slash', detail: 'Escalates operator punishment for a channel when policy or settlement rules were broken.' },
  { label: 'nonce', detail: 'Targets the exact snapshot nonce under review. Leave empty to use the latest known nonce.' },
];

export const settlementPresets = [
  {
    label: 'Review Latest',
    description: 'Opens a manual review dispute against the latest nonce.',
    values: { actorUuid: '', reason: 'MANUAL_REVIEW', targetNonce: '' },
  },
  {
    label: 'Stale State',
    description: 'Flags the latest channel snapshot as stale for dispute.',
    values: { actorUuid: '', reason: 'STALE_STATE', targetNonce: '' },
  },
  {
    label: 'Dispute Escalation',
    description: 'Escalates an already suspicious channel into formal dispute handling.',
    values: { actorUuid: '', reason: 'DISPUTE_ESCALATION', targetNonce: '' },
  },
  {
    label: 'Operator Slash',
    description: 'Prepares a punitive slash request with an operator ID.',
    values: { actorUuid: 'operator-1', reason: 'POLICY_BREACH', targetNonce: '' },
  },
];
