import { z } from 'zod';

export const SandboxCommandSchema = z.object({
  bin: z.string().min(1),
  args: z.array(z.string()),
}).passthrough();

export const SandboxCommandKeySchema = z.enum(['ECHO', 'NOOP']);

const SandboxArgSchema = z
  .string()
  .max(2048)
  .refine((s) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s));

export const SandboxArgsEchoSchema = z.array(SandboxArgSchema).max(1);
export const SandboxArgsNoopSchema = z.array(z.string()).length(0);

export const SandboxIntentSchema = z.object({
  text: z.string(),
  commandKey: SandboxCommandKeySchema.optional(),
  args: z.array(z.string()).optional(),
  command: SandboxCommandSchema.optional(),
}).passthrough();

