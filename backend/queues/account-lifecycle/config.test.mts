import { describe, expect, it } from 'vitest'
import { LOCK_DURATION_MS } from './config.mts'

describe('LOCK_DURATION_MS', () => {
  it('is 10 minutes (crash-recovery window, not a runtime cap)', () => {
    expect(LOCK_DURATION_MS).toBe(600_000)
  })
})
