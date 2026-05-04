import { z } from 'zod';
import { IsolationTaskCancelResultSchema, IsolationTaskFinalizeResultSchema, IsolationTaskRetryResultSchema, IsolationTaskRollbackResultSchema } from './schemas.isolation';
import { SettlementDisputeResultSchema, SettlementSlashResultSchema } from './schemas.settlement';

export const GovernanceProposalResponseSchema = z.object({
  success: z.boolean(),
  accepted: z.boolean().optional(),
  scheduled: z.boolean().optional(),
  proposalId: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  autoExecuted: z.boolean().optional(),
  executeAfter: z.number().nullable().optional(),
  threshold: z.number().nullable().optional(),
  executed: z.any().nullable().optional(),
  executedOk: z.boolean().nullable().optional(),
  error: z.any().nullable().optional(),
}).passthrough();

export const GovernanceProposeResponseSchema = z.object({
  success: z.boolean(),
  action: z.string(),
  proposalId: z.string().optional(),
  status: z.string().optional(),
  executeAfter: z.number().optional(),
  threshold: z.number().optional(),
  autoExecuted: z.boolean().optional(),
  executed: z.unknown().optional(),
  error: z.string().optional(),
}).strict();

export const GovernanceApproveResponseSchema = z.object({
  success: z.boolean(),
  action: z.string(),
  proposalId: z.string().optional(),
  approvals: z.number().optional(),
  status: z.string().optional(),
  idempotent: z.boolean().optional(),
  error: z.string().optional(),
}).strict();

export const ToggleStopResultSchema = z.object({
  success: z.boolean(),
  globalStop: z.boolean(),
}).strict();

export const ScaleAgentsResultSchema = z.object({
  success: z.boolean(),
  count: z.number(),
  activeAgentCount: z.number(),
}).strict();

export const PauseAgentResultSchema = z.object({
  success: z.boolean(),
  uuid: z.string(),
  pause: z.boolean(),
}).strict();

export const TerminateAgentResultSchema = z.object({
  success: z.boolean(),
  uuid: z.string(),
}).strict();

export const SetAgentConfigResultSchema = z.object({
  success: z.boolean(),
  uuid: z.string(),
}).strict();

const GovernanceExecuteBaseSchema = z.object({
  success: z.boolean(),
  action: z.string(),
  proposalId: z.string().optional(),
  status: z.string().optional(),
  idempotent: z.boolean().optional(),
  error: z.string().optional(),
  executeAfter: z.number().optional(),
}).strict();

export const GovernanceExecuteResponseSchema = z.union([
  GovernanceExecuteBaseSchema.extend({ action: z.literal('TASK_FINALIZE'), result: IsolationTaskFinalizeResultSchema.optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('TASK_ROLLBACK'), result: IsolationTaskRollbackResultSchema.optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('TASK_CANCEL'), result: IsolationTaskCancelResultSchema.optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('TASK_RETRY'), result: IsolationTaskRetryResultSchema.optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('OVERRIDE'), result: z.object({ success: z.boolean() }).strict().optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('RELEASE'), result: z.object({ success: z.boolean() }).strict().optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('TRANSFER_LOCK'), result: z.object({ success: z.boolean(), error: z.string().optional() }).passthrough().optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('TOGGLE_STOP'), result: ToggleStopResultSchema.optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('SCALE_AGENTS'), result: ScaleAgentsResultSchema.optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('PAUSE_AGENT'), result: PauseAgentResultSchema.optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('TERMINATE_AGENT'), result: TerminateAgentResultSchema.optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('SET_AGENT_CONFIG'), result: SetAgentConfigResultSchema.optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('SETTLEMENT_DISPUTE'), result: SettlementDisputeResultSchema.optional() }),
  GovernanceExecuteBaseSchema.extend({ action: z.literal('SETTLEMENT_SLASH'), result: SettlementSlashResultSchema.optional() }),
  GovernanceExecuteBaseSchema.extend({ result: z.unknown().optional() }),
]);

export const GovernanceCancelResponseSchema = z.object({
  success: z.boolean(),
  action: z.string(),
  proposalId: z.string().optional(),
  status: z.string().optional(),
  idempotent: z.boolean().optional(),
  error: z.string().optional(),
}).strict();

export const GovernanceProposalsListSchema = z.object({
  proposals: z.array(z.object({
    id: z.string(),
    action: z.string(),
    status: z.string(),
    approvals: z.array(z.object({
      adminId: z.string(),
      at: z.number(),
    })).optional(),
    threshold: z.number().optional(),
    timelockMs: z.number().nullable().optional(),
    executeAfter: z.number().nullable().optional(),
    createdAt: z.number().optional(),
    executedAt: z.number().nullable().optional(),
    cancelledAt: z.number().nullable().optional(),
    reason: z.string().nullable().optional(),
  })).optional(),
}).passthrough();
