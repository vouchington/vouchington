import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  createDeviceAndSessionTokens,
  createSessionToken,
  isSessionRevoked,
} from '@services/jwt-session'
import { mintAuthenticatedDeviceAuthority } from '@services/jwt-session/device-authority-mint'
import { createSessionClientBinding } from '@services/jwt-session/client-binding'
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
    expect(response.body.code).toBe('AUTH_REQUIRED')
    expect(
      (response.headers['set-cookie'] as unknown as string[]).every(cookie =>
        cookie.includes('Max-Age=0'),
      ),
    ).toBe(true)
    const renewalRequest = createRequest()
    renewalRequest.setClientInfo({
      'x-voucha-client': 'dotnet',
      'x-voucha-platform': 'windows',
      'x-voucha-app-version': 'test',
    })
    await expect(
      isSessionRevoked(tokens.sessionToken.payload.sid, { userId: user.id }),
    ).resolves.toBe(false)
    const refreshed = await renewalRequest
      .patch('/api/v1/session')
      .set('Cookie', `dt=${tokens.deviceToken.token}`)
      .set('User-Agent', userAgent)
      .send({})
      .expect(200)
    expect(refreshed.body.session.uid).toBe(user.id)
    expect(typeof refreshed.body.session.dt).toBe('string')
    expect(typeof refreshed.body.session.st).toBe('string')
    expect(refreshed.headers['set-cookie']).toHaveLength(2)
  })

  it('retains the original credential expiry in renewal cookies and native transport metadata', async () => {
    const user = await createTestUserDirect()
    const did = v7()
    const sid = v7()
    const issuedAt = Math.floor(Date.now() / 1000) - 24 * 60 * 60
    const binding = createSessionClientBinding(undefined, { user_agent: userAgent })
    const device = await mintAuthenticatedDeviceAuthority({
      uid: user.id,
      did,
      sid,
      binding,
      issuedAt,
      deviceContext: { user_agent: userAgent },
    })
    const session = await createSessionToken({ uid: user.id, did, sid, clientBinding: binding })
    const request = createRequest()
    request.setClientInfo({
      'x-voucha-client': 'dotnet',
      'x-voucha-platform': 'windows',
      'x-voucha-app-version': 'test',
    })
    const response = await request
      .patch('/api/v1/session')
      .set('Cookie', `dt=${device.token}; st=${session.token}`)
      .set('User-Agent', userAgent)
      .send({})
      .expect(200)
    expect(response.body.session.uid).toBe(user.id)
    expect(response.body.session.dte).toBeLessThanOrEqual(29 * 24 * 60 * 60)
    const cookie = (response.headers['set-cookie'] as unknown as string[]).find(value =>
      value.startsWith('dt='),
    )!
    const maxAge = Number(cookie.match(/Max-Age=(\d+)/u)![1])
    expect(maxAge).toBeLessThanOrEqual(29 * 24 * 60 * 60)
    expect(maxAge).toBeGreaterThan(0)
  })

  it.each(['POST logout', 'DELETE session'] as const)(
    'clears cookies and revokes a cookie session despite a changed browser: %s',
    async operation => {
      const user = await createTestUserDirect()
      const tokens = await createDeviceAndSessionTokens({
        did: v7(),
        uid: user.id,
        deviceContext: { user_agent: userAgent },
      })
      const request = createRequest()
      const action =
        operation === 'POST logout'
          ? request.post('/api/v1/auth/logout')
          : request.delete('/api/v1/session')
      const response = await action
        .set('Cookie', `dt=${tokens.deviceToken.token}; st=${tokens.sessionToken.token}`)
        .set('User-Agent', 'Another client')
        .send({})
        .expect(operation === 'POST logout' ? 204 : 200)
      expect(
        (response.headers['set-cookie'] as unknown as string[]).every(cookie =>
          cookie.includes('Max-Age=0'),
        ),
      ).toBe(true)
      await expect(
        isSessionRevoked(tokens.sessionToken.payload.sid, { userId: user.id }),
      ).resolves.toBe(true)
    },
  )

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
    expect(response.body.session.client).toBe('web')
    expect(response.headers['set-cookie']).toHaveLength(2)
    expect(Object.hasOwn(response.body, 'dt')).toBe(client === 'native')
    expect(Object.hasOwn(response.body, 'st')).toBe(client === 'native')
    expect(typeof response.body.dt?.token === 'string').toBe(client === 'native')
    expect(typeof response.body.st?.token === 'string').toBe(client === 'native')
    const accessCookie = (response.headers['set-cookie'] as unknown as string[]).find(
      (cookie: string) => cookie.startsWith('st='),
    )
    expect(accessCookie).toContain(`Max-Age=600`)
  })
})
