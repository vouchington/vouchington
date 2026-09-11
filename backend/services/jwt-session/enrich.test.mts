import { it, expect, beforeAll, describe } from 'vitest'
import { getEnrichedSessionClaims } from './enrich.mts'
import { createTestUser, getTestPrivateUserById, suspendTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('enrich', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('getEnrichedSessionClaims returns correct claims for existing user', async () => {
    const result = await getEnrichedSessionClaims(user)

    expect(Array.isArray(result.roles)).toBe(true)
    expect(typeof result.trustTier).toBe('number')
    expect(result.trustTier).toBeGreaterThanOrEqual(0)
    expect(result.trustTier).toBeLessThanOrEqual(5)
    expect(result.suspended).toBe(false)
  })

  it('getEnrichedSessionClaims returns suspended=true when user.suspended_at is set', async () => {
    const suspendedUser = await createTestUser()
    await suspendTestUser(suspendedUser.id, 'test suspension')
    const refetchedUser = (await getTestPrivateUserById(suspendedUser.id))!

    const result = await getEnrichedSessionClaims(refetchedUser)

    expect(result.suspended).toBe(true)
  })
})
