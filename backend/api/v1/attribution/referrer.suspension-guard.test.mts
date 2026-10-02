import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getSessionReferralAttributions,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { v7 } from 'uuid'

describe('suspended referral attribution', () => {
  it('rejects suspended-session referral attribution without inserting a click', async () => {
    const user = await createTestUser()
    const referrer = await createTestUser()
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
    })
    await suspendTestUser(user.id)

    try {
      const response = await createRequest()
        .post('/api/v1/attribution/referrer')
        .set('Cookie', [`dt=${deviceToken.token}`, `st=${sessionToken.token}`])
        .set('Sec-Fetch-Site', 'same-origin')
        .send({
          referrer: referrer.id,
          landing_url: `https://example.com/?referrer=${referrer.id}`,
        })
        .expect(403)

      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
      expect(await getSessionReferralAttributions(sessionToken.payload.sid)).toEqual([])
    } finally {
      await unsuspendTestUser(user.id)
    }
  })
})
