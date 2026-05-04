import { z } from 'zod';
import { LOG_ACTIONS, LOG_DOMAINS, LOG_STAGES } from './constants/logEvents';

export const SettlementDisputeResultSchema = z.object({
  ok: z.boolean(),
  disputeId: z.string(),
  txid: z.string(),
  commitment: z.string(),
  status: z.string(),
}).strict();

export const SettlementSlashResultSchema = z.object({
  ok: z.boolean(),
  txid: z.string(),
  commitment: z.string(),
  status: z.string(),
}).strict();

export const DisputeSchema = z.object({
  channelId: z.string().optional().default(''),
  actorUuid: z.string().optional(),
  openedBy: z.string().optional(),
  targetNonce: z.number().int().nonnegative().optional().default(0),
  reason: z.string().optional().default('DISPUTE'),
}).refine(
  (data) => !!(data.channelId || data.actorUuid),
  { message: 'Must provide either channelId or actorUuid', path: ['channelId'] }
);

export type DisputeInput = z.infer<typeof DisputeSchema>;

const SLASH_HEATMAP_DOMAINS = [LOG_DOMAINS.ECONOMY, LOG_DOMAINS.SETTLEMENT] as const;
const SLASH_HEATMAP_STAGES = [LOG_STAGES.EXECUTED, LOG_STAGES.FAILED] as const;

export const SettlementSlashHeatmapMetaSchema = z.object({
  stage: z.enum(SLASH_HEATMAP_STAGES),
  domain: z.enum(SLASH_HEATMAP_DOMAINS),
  actionKey: z.literal(LOG_ACTIONS.SETTLEMENT_SLASH),
  agentId: z.string().min(1),
  metrics: z.object({
    conflictRate: z.number().min(0).max(100),
    balanceDrain: z.number().min(0).max(100),
    anomalyScore: z.number().min(0).max(1),
  }),
  arweaveTxId: z.string().min(1),
}).passthrough();

export type SettlementSlashHeatmapMeta = z.infer<typeof SettlementSlashHeatmapMetaSchema>;

