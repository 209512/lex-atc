import { z } from 'zod';
import { LOG_ACTIONS, LOG_DOMAINS, LOG_STAGES } from './constants/logEvents';

const Vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

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

export const LogContractSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  agentId: z.string().optional(),
  message: z.string(),
  level: z.string().optional(),
  type: z.string().optional(),
  domain: z.enum(Object.values(LOG_DOMAINS) as [string, ...string[]]).optional(),
  stage: z.enum(Object.values(LOG_STAGES) as [string, ...string[]]).optional(),
  actionKey: z.enum(Object.values(LOG_ACTIONS) as [string, ...string[]]).optional(),
}).passthrough();

export const AgentContractSchema = z.object({
  id: z.string(),
  uuid: z.string().optional(),
  status: z.string().optional(),
  shardId: z.string().nullable().optional(),
  lockState: z.string().optional(),
  lockMessage: z.string().optional(),
  displayId: z.string().optional(),
  displayName: z.string().optional(),
  lastHeartbeat: z.number().optional(),
  queuePos: z.number().optional(),
  activity: z.string().optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
  position: Vector3Schema.optional(),
  account: z.object({
    address: z.string().optional(),
    balance: z.number(),
    escrow: z.number().optional(),
    staked: z.number().optional(),
    reputation: z.number().optional(),
    difficulty: z.number().optional(),
    totalEarned: z.number().optional(),
    lastWorkHash: z.string().optional(),
  }).optional(),
}).passthrough();

export const StateContractSchema = z.object({
  globalStop: z.boolean().optional(),
  systemStatus: z.string().optional(),
  activeAgentCount: z.number().optional(),
  contractVersion: z.number().optional(),
  sse: z.object({
    serverTime: z.number(),
  }).optional(),
  logs: z.array(LogContractSchema).optional(),
}).passthrough();

export const SseEventContractSchema = z.object({
  state: StateContractSchema.optional(),
  agents: z.array(AgentContractSchema).optional(),
}).passthrough();

export const AuthSessionResponseSchema = z.object({
  success: z.boolean(),
  mode: z.string(),
}).passthrough();

export const AgentStatusResponseSchema = z.array(AgentContractSchema);

