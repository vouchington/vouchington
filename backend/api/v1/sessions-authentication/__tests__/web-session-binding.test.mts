import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { createEmailAddressLoginToken } from '@services/users/authentication'

const userAgent = 'Synthetic browser/1.0'

describe('web session request boundary', () => {
  it('rejects a changed user agent on mutations even when the copied web token claims a native client', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      deviceContext: { user_agent: userAgent },
    })
    const request = createRequest()
    request.setClientInfo({
      'x-voucha-client': 'dotnet',
      'x-voucha-platform': 'windows',
      'x-voucha-app-version': 'test',
    })
    const response = await request
      .delete(`/api/v1/auth/sessions/${v7()}`)
      .set('Cookie', `dt=${tokens.deviceToken.token}; st=${tokens.sessionToken.token}`)
      .set('User-Agent', 'Another client')
      .expect(401)
    expect(response.body.code).toBe('SESSION_USER_AGENT_MISMATCH')
    const refreshed = await request
      .patch('/api/v1/session')
      .set('Cookie', `dt=${tokens.deviceToken.token}`)
      .set('User-Agent', userAgent)
      .send({})
      .expect(200)
    expect(refreshed.body.session.uid).toBe(user.id)
    expect(refreshed.body.session).not.toHaveProperty('dt')
    expect(refreshed.body.session).not.toHaveProperty('st')
    expect(refreshed.headers['set-cookie']).toHaveLength(2)
  })

  it.each(['web', 'native'] as const)('uses the %s login token transport', async client => {
    const user = await createTestUserDirect({ withEmail: true })
    const { token } = await createEmailAddressLoginToken(user.email_address!)
    const request = createRequest()
    if (client === 'native')
      request.setClientInfo({
        'x-voucha-client': 'dotnet',
        'x-voucha-platform': 'windows',
        'x-voucha-app-version': 'test',
      })
    const response = await request
      .post('/api/v1/auth/email-address/login')
      .set('User-Agent', userAgent)
      .send({ email_address: user.email_address, token })
      .expect(200)
    expect(response.body.session.client).toBe(client)
    expect(response.headers['set-cookie']).toHaveLength(2)
    expect(Object.hasOwn(response.body, 'dt')).toBe(client === 'native')
    expect(Object.hasOwn(response.body, 'st')).toBe(client === 'native')
    expect(typeof response.body.dt?.token === 'string').toBe(client === 'native')
    expect(typeof response.body.st?.token === 'string').toBe(client === 'native')
    const accessCookie = (response.headers['set-cookie'] as unknown as string[]).find(
      (cookie: string) => cookie.startsWith('st='),
    )
    expect(accessCookie).toContain(`Max-Age=${client === 'web' ? 600 : 172800}`)
  })
})
