import { z } from 'zod';
import { LOG_ACTIONS, LOG_DOMAINS, LOG_STAGES } from './constants/logEvents';

export const AgentSchema = z.object({
  id: z.string(),
  uuid: z.string(),
  status: z.string(),
  shardId: z.string().nullable().optional(),
  lockState: z.string().optional(),
  lockMessage: z.string().optional(),
  displayId: z.string().optional(),
  displayName: z.string().optional(),
  lastHeartbeat: z.number().optional(),
  queuePos: z.number().optional(),
  activity: z.string().optional(),
  metrics: z.any().optional(),
  position: z.any().optional(),
  account: z.object({
    address: z.string().optional(),
    balance: z.number(),
    escrow: z.number().optional(),
    staked: z.number().optional(),
    reputation: z.number().optional(),
    difficulty: z.number().optional(),
    totalEarned: z.number().optional(),
    lastWorkHash: z.string().optional()
  }).optional()
}).passthrough();

export const LogSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  agentId: z.string().optional(),
  message: z.string(),
  level: z.string().optional(),
  type: z.string().optional(),
  domain: z.string().optional(),
  stage: z.string().optional(),
  actionKey: z.string().optional()
}).passthrough();

export const StateSchema = z.object({
  globalStop: z.boolean(),
  systemStatus: z.string().optional(),
  activeAgentCount: z.number().optional(),
  contractVersion: z.number().optional(),
  sse: z.object({
    serverTime: z.number()
  }).optional(),
  logs: z.array(LogSchema).optional()
}).passthrough();

export const SseEventSchema = z.object({
  state: StateSchema.optional(),
  agents: z.array(AgentSchema).optional()
}).passthrough();

// Settlement dispute request schema
// channelId OR actorUuid must be provided (actorUuid resolves to channel:{actorUuid})
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
