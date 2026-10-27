import { describe, expect, it } from 'vitest'
import {
  BLOOM_FILTER_DEFAULTS,
  BLOOM_FILTER_LOCK_DURATION_MS,
  BLOOM_FILTER_STALLED_INTERVAL_MS,
  rebuildBloomFilterJobOptions,
  rebuildEmbeddingBloomFilterJobOptions,
} from './config.mts'

describe('BLOOM_FILTER_LOCK_DURATION_MS', () => {
  it('is 10 minutes (crash-recovery window, not a runtime cap)', () => {
    expect(BLOOM_FILTER_LOCK_DURATION_MS).toBe(600_000)
  })
})

describe('BLOOM_FILTER_STALLED_INTERVAL_MS', () => {
  it('is 30 seconds (stalled-job detection interval, not a runtime cap)', () => {
    expect(BLOOM_FILTER_STALLED_INTERVAL_MS).toBe(30_000)
  })
})

describe('rebuild bloom delay', () => {
  it('waits out replica lag for blocklist rebuilds only', () => {
    expect(rebuildBloomFilterJobOptions({ filter: 'url-blocklist' }).delay).toBe(
      BLOOM_FILTER_DEFAULTS.replicaLagSafetyMarginMs,
    )
    expect(rebuildBloomFilterJobOptions({ filter: 'email-blocklist' }).delay).toBe(
      BLOOM_FILTER_DEFAULTS.replicaLagSafetyMarginMs,
    )
    expect(rebuildBloomFilterJobOptions({ filter: 'embedding' }).delay).toBeUndefined()
    expect(rebuildBloomFilterJobOptions({ filter: 'api-keys' }).delay).toBeUndefined()
    expect(rebuildEmbeddingBloomFilterJobOptions().delay).toBeUndefined()
  })
})
