import { z } from 'zod';

export const IsolationTaskFinalizeResultSchema = z.object({
  success: z.boolean(),
  taskId: z.string().optional(),
  status: z.string().optional(),
  idempotent: z.boolean().optional(),
  error: z.string().optional(),
}).passthrough();

export const IsolationTaskRollbackResultSchema = z.object({
  success: z.boolean(),
  taskId: z.string().optional(),
  status: z.string().optional(),
  idempotent: z.boolean().optional(),
  error: z.string().optional(),
}).passthrough();

export const IsolationTaskCancelResultSchema = z.object({
  success: z.boolean(),
  taskId: z.string().optional(),
  status: z.string().optional(),
  idempotent: z.boolean().optional(),
  error: z.string().optional(),
}).passthrough();

export const IsolationTaskRetryResultSchema = z.object({
  success: z.boolean(),
  taskId: z.string().optional(),
  status: z.string().optional(),
  idempotent: z.boolean().optional(),
  error: z.string().optional(),
}).passthrough();

export const IsolationTasksResponseSchema = z.object({
  pending: z.array(z.object({
    taskId: z.string(),
    actorUuid: z.string(),
    shardId: z.string(),
    classification: z.string(),
    status: z.string(),
    createdAt: z.number(),
    timeoutAt: z.number(),
  })).optional(),
  tasks: z.array(z.object({
    taskId: z.string(),
    actorUuid: z.string(),
    shardId: z.string(),
    shardEpoch: z.number(),
    resourceId: z.string().nullable().optional(),
    fenceToken: z.any().nullable().optional(),
    classification: z.string(),
    requiresFinalization: z.boolean(),
    status: z.string(),
    createdAt: z.number(),
    timeoutAt: z.number(),
    finalizedAt: z.number().nullable().optional(),
    executedAt: z.number().nullable().optional(),
    rolledBackAt: z.number().nullable().optional(),
    lastError: z.string().nullable().optional(),
  })).optional(),
  dlq: z.array(z.object({
    taskId: z.string(),
    error: z.string(),
    failedAt: z.number(),
  })).optional(),
  summary: z.object({
    waitingAdmin: z.number(),
    inProgress: z.number(),
    failed: z.number(),
    dlqCount: z.number(),
  }).optional(),
}).passthrough();

