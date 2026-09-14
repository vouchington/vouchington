import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUserDirect,
  getSessionReferralAttributions,
  hardDeleteTestUser,
} from '@voucha/test-helpers'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { v7 } from 'uuid'
import type { PrivateUser } from '@services/users/types'

describe('referrer', () => {
  let referrer: PrivateUser | null = null
  let signedInUser: PrivateUser | null = null

  beforeAll(async () => {
    referrer = await createTestUserDirect()
    signedInUser = await createTestUserDirect()
  })
  async function createAnonymousSession() {
    const did = v7()
    const sid = v7()
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did, sid })
    return { sid, deviceToken, sessionToken }
  }

  async function createAuthenticatedSession(uid: string) {
    const did = v7()
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did, uid })
    return { sid: sessionToken.payload.sid, deviceToken, sessionToken }
  }

  function setSameOriginSessionCookies(
    request: ReturnType<typeof createRequest>,
    deviceToken: string,
    sessionToken: string,
  ): void {
    request.set('Cookie', [`dt=${deviceToken}`, `st=${sessionToken}`])
    request.set('Sec-Fetch-Site', 'same-origin')
  }

  describe('POST /api/v1/attribution/referrer', () => {
    it('returns 200 and stores attribution for valid UUID referrer', async () => {
      const request = createRequest()
      const { sid, deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      const landingUrl = `https://example.com/?referrer=${referrer!.id}`
      const res = await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: referrer!.id, landing_url: landingUrl })
        .expect(200)

      expect(res.body.ok).toBe(true)

      const rows = await getSessionReferralAttributions(sid)
      expect(rows).toHaveLength(1)
      expect(rows[0].referrer_id).toBe(referrer!.id)
      expect(rows[0].landing_url).toBe(landingUrl)
    })

    it('returns 200 and stores attribution for valid username referrer', async () => {
      const request = createRequest()
      const { sid, deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      const res = await request
        .post('/api/v1/attribution/referrer')
        .send({
          referrer: referrer!.username,
          landing_url: `https://example.com/?referrer=${referrer!.username}`,
        })
        .expect(200)

      expect(res.body.ok).toBe(true)

      const rows = await getSessionReferralAttributions(sid)
      expect(rows).toHaveLength(1)
      expect(rows[0].referrer_id).toBe(referrer!.id)
    })

    it('returns 200 for unknown referrer (no enumeration)', async () => {
      const request = createRequest()
      const { deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      const res = await request
        .post('/api/v1/attribution/referrer')
        .send({
          referrer: 'unknown-user-that-does-not-exist-xyz123',
          landing_url: 'https://example.com/',
        })
        .expect(200)

      expect(res.body.ok).toBe(true)
    })

    it('returns 200 and stores no attribution row when Global Privacy Control is active', async () => {
      const request = createRequest()
      const { sid, deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      const res = await request
        .post('/api/v1/attribution/referrer')
        .set('Sec-GPC', '1')
        .send({ referrer: referrer!.id, landing_url: 'https://example.com/' })
        .expect(200)

      expect(res.body.ok).toBe(true)

      const rows = await getSessionReferralAttributions(sid)
      expect(rows).toHaveLength(0)
    })

    it('returns 400 if referrer is missing', async () => {
      const request = createRequest()
      const { deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      await request
        .post('/api/v1/attribution/referrer')
        .send({ landing_url: 'https://example.com/' })
        .expect(400)
    })

    it('returns 400 if landing_url is missing', async () => {
      const request = createRequest()
      const { deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: referrer!.id })
        .expect(400)
    })

    it('returns 400 if landing_url is not a valid URL', async () => {
      const request = createRequest()
      const { deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: referrer!.id, landing_url: 'not-a-valid-url' })
        .expect(400)
    })

    it('returns 400 if landing_url exceeds 2048 characters', async () => {
      const request = createRequest()
      const { deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      const longUrl = `https://example.com/?x=${'a'.repeat(2050)}`
      await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: referrer!.id, landing_url: longUrl })
        .expect(400)
    })

    it('returns 400 if normalized landing_url exceeds 2048 characters', async () => {
      const request = createRequest()
      const { deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      const expandingUrl = `https://example.com/${'é'.repeat(1000)}`
      expect(expandingUrl.length).toBeLessThanOrEqual(2048)
      expect(new URL(expandingUrl).href.length).toBeGreaterThan(2048)

      await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: referrer!.id, landing_url: expandingUrl })
        .expect(400)
    })

    it('multiple calls with same session+referrer dedup to one row, moved to latest', async () => {
      const request = createRequest()
      const { sid, deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: referrer!.id, landing_url: 'https://example.com/page1' })
        .expect(200)

      const [firstClick] = await getSessionReferralAttributions(sid)

      await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: referrer!.id, landing_url: 'https://example.com/page2' })
        .expect(200)

      const rows = await getSessionReferralAttributions(sid)
      expect(rows).toHaveLength(1)
      expect(rows[0].landing_url).toBe('https://example.com/page2')
      // Moved to latest: the repeat click replaces the row with a fresh, greater id.
      // (id is a UUIDv7 string, not a number/bigint, so this can't use toBeGreaterThan.)
      const movedToLatest = rows[0].id > firstClick!.id
      expect(movedToLatest).toBe(true)
    })

    it('anonymous sessions store null user_id', async () => {
      const request = createRequest()
      const { sid, deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: referrer!.id, landing_url: 'https://example.com/' })
        .expect(200)

      const rows = await getSessionReferralAttributions(sid)
      expect(rows).toHaveLength(1)
      expect(rows[0].user_id).toBeNull()
    })

    it('returns 200 and stores no row when signed-in user refers themselves', async () => {
      const request = createRequest()
      const { sid, deviceToken, sessionToken } = await createAuthenticatedSession(referrer!.id)
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      const res = await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: referrer!.id, landing_url: 'https://example.com/' })
        .expect(200)

      expect(res.body.ok).toBe(true)

      const rows = await getSessionReferralAttributions(sid)
      expect(rows).toHaveLength(0)
    })

    it('returns 200 and stores no row when signed-in user refers themselves by username', async () => {
      const request = createRequest()
      const { sid, deviceToken, sessionToken } = await createAuthenticatedSession(referrer!.id)
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      const res = await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: referrer!.username, landing_url: 'https://example.com/' })
        .expect(200)

      expect(res.body.ok).toBe(true)

      const rows = await getSessionReferralAttributions(sid)
      expect(rows).toHaveLength(0)
    })

    it('preserves attribution record with null referrer_id when referrer account is deleted', async () => {
      const tempReferrer = await createTestUserDirect()

      const request = createRequest()
      const { sid, deviceToken, sessionToken } = await createAnonymousSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: tempReferrer!.id, landing_url: 'https://example.com/' })
        .expect(200)

      let rows = await getSessionReferralAttributions(sid)
      expect(rows).toHaveLength(1)
      expect(rows[0].referrer_id).toBe(tempReferrer!.id)

      // Hard-delete the referrer to trigger ON DELETE SET NULL on the FK constraint
      await hardDeleteTestUser(tempReferrer!.id)
      rows = await getSessionReferralAttributions(sid)
      expect(rows).toHaveLength(1)
      expect(rows[0].referrer_id).toBeNull()
    })

    it('stores user_id for signed-in users', async () => {
      const request = createRequest()
      const { sid, deviceToken, sessionToken } = await createAuthenticatedSession(signedInUser!.id)
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      const landingUrl = `https://example.com/?referrer=${referrer!.id}`
      await request
        .post('/api/v1/attribution/referrer')
        .send({ referrer: referrer!.id, landing_url: landingUrl })
        .expect(200)

      const rows = await getSessionReferralAttributions(sid)
      expect(rows).toHaveLength(1)
      expect(rows[0].referrer_id).toBe(referrer!.id)
      expect(rows[0].user_id).toBe(signedInUser!.id)
      expect(rows[0].landing_url).toBe(landingUrl)
    })
  })
})
