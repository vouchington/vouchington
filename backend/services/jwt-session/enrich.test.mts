import { addUserRole } from '../users/roles-permissions.mts'
import { it, expect, beforeAll, describe } from 'vitest'
import { getEnrichedSessionClaims, getSessionAuthorizedUser } from './enrich.mts'
import {
  createTestUser,
  getTestPrivateUserById,
  suspendTestUser,
  insertTestTotpAuthenticator,
} from '@voucha/test-helpers'
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

  it('requires original completed MFA for both claim and cached-user administrator authority', async () => {
    const administrator = await createTestUser()
    await insertTestTotpAuthenticator(administrator.id, 'enrolled-is-not-proof')
    await addUserRole(administrator.id, 'administrator')
    const current = (await getTestPrivateUserById(administrator.id))!
    expect(current.roles).toContain('administrator')
    const withoutProof = await getEnrichedSessionClaims(current)
    expect(withoutProof.roles).not.toContain('administrator')
    expect(getSessionAuthorizedUser(current, {}).roles).not.toContain('administrator')
    const withProof = await getEnrichedSessionClaims(current, {
      mfaVerifiedAt: Math.floor(Date.now() / 1000) - 60,
    })
    expect(withProof.roles).toContain('administrator')
    expect(
      getSessionAuthorizedUser(current, { mfaVerifiedAt: Math.floor(Date.now() / 1000) - 60 })
        .roles,
    ).toContain('administrator')
  })

  it('getEnrichedSessionClaims returns suspended=true when user.suspended_at is set', async () => {
    const suspendedUser = await createTestUser()
    await suspendTestUser(suspendedUser.id, 'test suspension')
    const refetchedUser = (await getTestPrivateUserById(suspendedUser.id))!

    const result = await getEnrichedSessionClaims(refetchedUser)

    expect(result.suspended).toBe(true)
  })
})
