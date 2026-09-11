import { describe, expect, it } from 'vitest'
import { BLOOM_VALKEY_READ_FROM, DYNAMIC_CONFIG_PRIMARY_READ_FROM } from './clients.mts'

describe('valkey clients', () => {
  it('keeps bloom filter reads on primary for ready-marker consistency', () => {
    expect(BLOOM_VALKEY_READ_FROM).toBe('primary')
  })

  it('keeps accounting-uncertainty reads on primary for fail-closed consistency', () => {
    expect(DYNAMIC_CONFIG_PRIMARY_READ_FROM).toBe('primary')
  })
})
