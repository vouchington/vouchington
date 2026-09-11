import { describe, expect, it } from 'vitest'
import { ACCOUNT_DATA_REQUESTS_LOCK_DURATION_MS } from './config.mts'

describe('ACCOUNT_DATA_REQUESTS_LOCK_DURATION_MS', () => {
  it('is 10 minutes (crash-recovery window, not a runtime cap)', () => {
    expect(ACCOUNT_DATA_REQUESTS_LOCK_DURATION_MS).toBe(600_000)
  })
})
