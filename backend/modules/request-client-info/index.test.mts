import { describe, expect, it } from 'vitest'
import {
  cacheBootstrapDeviceId,
  cacheVerifiedDeviceToken,
  getCachedBootstrapDeviceId,
  getCachedVerifiedDeviceToken,
  getOptionalRequestClientInfo,
  getOptionalRequestOrigin,
  getRequestClientInfo,
  runWithCredentialRequestContext,
  runWithSessionRequestContext,
} from './index.mts'
import type { IncomingMessage } from 'node:http'
import type { DeviceTokenPayload } from '@ts-shared/session-jwt'

describe('request client information context', () => {
  it('propagates immutable metadata through awaited work', async () => {
    await runWithSessionRequestContext(
      {
        client: 'web',
        platform: 'web',
        appVersion: 'test',
        deviceId: 'device',
        ipAddress: '::1',
      },
      async () => {
        await Promise.resolve()
        expect(getRequestClientInfo().deviceId).toBe('device')
        expect(Object.isFrozen(getRequestClientInfo())).toBe(true)
      },
    )
  })

  it('isolates concurrent requests and supports optional access outside requests', async () => {
    expect(getOptionalRequestClientInfo()).toBeUndefined()
    expect(() => getRequestClientInfo()).toThrow('outside')
    const read = (deviceId: string) =>
      runWithSessionRequestContext(
        { client: 'web', platform: 'web', appVersion: 'test', deviceId, ipAddress: '::1' },
        async () => {
          await Promise.resolve()
          return getRequestClientInfo().deviceId
        },
      )
    await expect(Promise.all([read('one'), read('two')])).resolves.toEqual(['one', 'two'])
  })

  it('derives a session origin from the validated client information', () => {
    expect(getOptionalRequestOrigin()).toBeUndefined()
    runWithSessionRequestContext(
      { client: 'swift', platform: 'ios', appVersion: 'test', deviceId: 'd', ipAddress: '::1' },
      () => {
        expect(getOptionalRequestOrigin()).toEqual({
          interface: 'rest',
          credential: 'session',
          client: 'swift',
          oauthClientId: null,
        })
        expect(Object.isFrozen(getOptionalRequestOrigin())).toBe(true)
      },
    )
  })

  it('keeps a session origin without client information for unvalidated requests', () => {
    runWithSessionRequestContext(null, () => {
      expect(getOptionalRequestOrigin()).toMatchObject({ credential: 'session', client: null })
      expect(getOptionalRequestClientInfo()).toBeUndefined()
      expect(() => getRequestClientInfo()).toThrow('outside')
    })
  })

  it('stores a credential origin without client information', () => {
    const origin = {
      interface: 'mcp',
      credential: 'oauth',
      client: null,
      oauthClientId: 'client-id',
    } as const
    runWithCredentialRequestContext(origin, () => {
      expect(getOptionalRequestOrigin()).toEqual(origin)
      expect(getOptionalRequestOrigin()).not.toBe(origin)
      expect(Object.isFrozen(getOptionalRequestOrigin())).toBe(true)
      expect(getOptionalRequestClientInfo()).toBeUndefined()
    })
  })

  it('caches verified and bootstrap device identities per request', () => {
    const request = {} as IncomingMessage
    const payload = { did: 'device' } as DeviceTokenPayload
    cacheVerifiedDeviceToken(request, 'token', payload)
    cacheBootstrapDeviceId(request, 'bootstrap')
    expect(getCachedVerifiedDeviceToken(request, 'token')).toBe(payload)
    expect(getCachedVerifiedDeviceToken(request, 'other')).toBeUndefined()
    expect(getCachedBootstrapDeviceId(request)).toBe('bootstrap')
    expect(getCachedBootstrapDeviceId({} as IncomingMessage)).toBeUndefined()
  })
})
