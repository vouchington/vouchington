import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  getUserPreservationHoldState,
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from './preservation-holds.mts'
import { usersWorkConfig } from './work-limits.mts'

describe('preservation hold history limit', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
  })
  afterEach(() => vi.unstubAllEnvs())

  it('lists only the configured number of newest holds', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    for (const reference of ['matter-1', 'matter-2', 'matter-3']) {
      await placeUserPreservationHold(admin, user.id, reference)
      await releaseUserPreservationHold(admin, user.id)
    }

    const restore = overrideDynamicConfigFieldsForTest(usersWorkConfig, {
      preservation_hold_history_limit: 2,
    })
    try {
      const limited = await getUserPreservationHoldState(admin, user.id)
      expect(limited.holds.map(hold => hold.reference)).toEqual(['matter-3', 'matter-2'])
    } finally {
      restore()
    }
    const full = await getUserPreservationHoldState(admin, user.id)
    expect(full.holds.map(hold => hold.reference)).toEqual(['matter-3', 'matter-2', 'matter-1'])
  })
})
