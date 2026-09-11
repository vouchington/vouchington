import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { grantConsent } from './create.mts'
import { getActiveConsents, hasActiveConsent } from './get.mts'
import { revokeConsent } from './revoke.mts'

describe('user-consents service', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('grants consent and shows as active', async () => {
    await grantConsent(user.id, 'privacy_policy', '1.0')

    const active = await hasActiveConsent(user.id, 'privacy_policy')
    expect(active).toBe(true)
  })

  it('revokes consent and shows as inactive', async () => {
    await grantConsent(user.id, 'terms_of_service', '1.0')
    await revokeConsent(user.id, 'terms_of_service')

    const active = await hasActiveConsent(user.id, 'terms_of_service')
    expect(active).toBe(false)
  })

  it('granting a new version supersedes the old one', async () => {
    const first = await grantConsent(user.id, 'cookie_analytics', '1.0')
    const second = await grantConsent(user.id, 'cookie_analytics', '2.0')

    const consents = await getActiveConsents(user.id)
    const active = consents.filter(c => c.consent_type === 'cookie_analytics')
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(second.id)
    expect(active[0].version).toBe('2.0')

    // First consent should be revoked
    expect(first.id).not.toBe(second.id)
  })

  it('getActiveConsents returns all active consents', async () => {
    const uniqueUser = await createTestUser()
    await grantConsent(uniqueUser.id, 'privacy_policy', '1.0')
    await grantConsent(uniqueUser.id, 'terms_of_service', '1.0')

    const consents = await getActiveConsents(uniqueUser.id)
    const types = consents.map(c => c.consent_type)
    expect(types).toContain('privacy_policy')
    expect(types).toContain('terms_of_service')
  })
})
