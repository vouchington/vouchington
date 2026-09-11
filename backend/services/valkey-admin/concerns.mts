export const FLUSH_CONCERNS = [
  'caches',
  'recently-viewed',
  'blooms',
  'rate-limiter',
  'dynamic-config',
  'sessions',
  'queues',
] as const

export type FlushConcern = (typeof FLUSH_CONCERNS)[number]
export type ServiceFlushConcern = Exclude<FlushConcern, 'queues'>
export type FlushTargetPrefixRegistry = Record<FlushConcern, readonly string[]>

export function isFlushConcern(value: string): value is FlushConcern {
  return FLUSH_CONCERNS.includes(value as FlushConcern)
}
