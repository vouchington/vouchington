import { emit } from '@data-stores/analytics'

interface TrackCacheCallOptions {
  cacheName: string
  batch: boolean
  hits: number
  misses: number
  bloomMisses: number
  duration: number
}

export function trackCacheCall({
  cacheName,
  batch,
  hits,
  misses,
  bloomMisses,
  duration,
}: TrackCacheCallOptions): void {
  const now = new Date()
  emit('valkey_cache_calls', {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
    cache_name: cacheName,
    batch,
    hits,
    misses,
    bloom_misses: bloomMisses,
    duration_ms: duration,
  })
}
