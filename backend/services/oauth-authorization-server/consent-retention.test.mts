import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  backdateTestOAuthGrantEnd,
  createTestOldOAuthConsent,
  deleteTestOAuthGrant,
  deleteTestOldOAuthConsent,
  oauthConsentExists,
  setTestOAuthGrantEnd,
} from '@voucha/test-helpers/entities/oauth-retention-evidence'
import { createTestPendingOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'

describe('OAuth consent retention', () => {
  it('keeps old latest consent while the grant is live and for 12 months after revocation', async () => {
    const now = new Date()
    const cutoff = new Date(now.getTime() - 366 * 86_400_000)
    const twoYearsAgo = new Date(now.getTime() - 730 * 86_400_000)
    const user = await createTestUserDirect()
    const pending = await createTestPendingOAuthAuthorization(user)
    const consent = await createTestOldOAuthConsent({
      userId: user.id,
      clientId: pending.client.client_id,
      occurredAt: twoYearsAgo,
    })

    await expect(deleteTestOldOAuthConsent(consent.eventId, cutoff)).rejects.toThrow(
      'latest live OAuth consent evidence cannot be deleted',
    )
    await setTestOAuthGrantEnd(consent.grantId, now)
    await expect(deleteTestOldOAuthConsent(consent.eventId, cutoff)).rejects.toThrow(
      'latest live OAuth consent evidence cannot be deleted',
    )
    expect(await oauthConsentExists(consent.eventId)).toBe(true)

    await deleteTestOAuthGrant(consent.grantId)
    await expect(deleteTestOldOAuthConsent(consent.eventId, cutoff)).rejects.toThrow(
      'latest live OAuth consent evidence cannot be deleted',
    )

    await backdateTestOAuthGrantEnd(consent.grantId, twoYearsAgo)
    await deleteTestOldOAuthConsent(consent.eventId, cutoff)
    expect(await oauthConsentExists(consent.eventId)).toBe(false)
  })
})
