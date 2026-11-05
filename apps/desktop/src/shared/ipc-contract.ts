import { z } from 'zod';

export const INVOKE_CHANNELS = [
  'engine:getAcpUrl',
  'engine:getStatus',
  'projects:list',
  'projects:pick',
  'threads:list',
  'threads:create',
  'threads:update',
  'threads:delete',
] as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];

export const EVENT_ENGINE_STATUS = 'engine:status';

const none = z.undefined();

export const inputSchemas = {
  'engine:getAcpUrl': none,
  'engine:getStatus': none,
  'projects:list': none,
  'projects:pick': none,
  'threads:list': z.strictObject({ projectId: z.string().min(1).optional() }).optional(),
  'threads:create': z.strictObject({ projectId: z.string().min(1), title: z.string().trim().min(1).max(200) }),
  'threads:update': z.strictObject({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    sessionId: z.string().min(1).optional(),
  }),
  'threads:delete': z.strictObject({ id: z.string().min(1) }),
} satisfies Record<InvokeChannel, z.ZodType>;
