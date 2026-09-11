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

export interface FlushValkeyResponseBody {
  concern: string
  keysRemoved: number | null
}
