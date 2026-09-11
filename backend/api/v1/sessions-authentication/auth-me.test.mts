import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { revokeSession, verifyDeviceAndSessionTokens } from '@services/jwt-session'

describe('GET /api/v1/auth/me', () => {
  it('returns 401 when only st cookie is present', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user!)

    const stCookie = request.authCookie.split('; ').find(cookiePart => cookiePart.startsWith('st='))

    const response = await createRequest()
      .get('/api/v1/auth/me')
      .set('Cookie', stCookie!)
      .expect(401)

    expect(response.body.error).toBe('Unauthorized')
  })

  it('returns the current user when both dt and st cookies are present', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user!)

    const response = await request.get('/api/v1/auth/me').expect(200)

    expect(response.body.user.id).toBe(user!.id)
  })

  it('returns 401 immediately when the authenticated session was revoked', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user!)

    const dtCookie = request.authCookie.split('; ').find(cookiePart => cookiePart.startsWith('dt='))
    const stCookie = request.authCookie.split('; ').find(cookiePart => cookiePart.startsWith('st='))
    const deviceToken = dtCookie!.slice(3)
    const sessionToken = stCookie!.slice(3)
    const verified = await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })
    expect(verified).not.toBe(false)

    await revokeSession((verified as Exclude<typeof verified, false>).sid)

    const response = await createRequest()
      .get('/api/v1/auth/me')
      .set('Cookie', [dtCookie!, stCookie!])
      .expect(401)

    expect(response.body.error).toBe('Unauthorized')
  })
})
