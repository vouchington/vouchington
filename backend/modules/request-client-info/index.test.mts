import { describe, expect, it } from 'vitest'
import {
  cacheBootstrapDeviceId,
  cacheVerifiedDeviceToken,
  getCachedBootstrapDeviceId,
  getCachedVerifiedDeviceToken,
  getOptionalRequestClientInfo,
  getRequestClientInfo,
  runWithRequestClientInfo,
} from './index.mts'
import type { IncomingMessage } from 'node:http'
import type { DeviceTokenPayload } from '@ts-shared/session-jwt'

describe('request client information context', () => {
  it('propagates immutable metadata through awaited work', async () => {
    await runWithRequestClientInfo(
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
      runWithRequestClientInfo(
        { client: 'web', platform: 'web', appVersion: 'test', deviceId, ipAddress: '::1' },
        async () => {
          await Promise.resolve()
          return getRequestClientInfo().deviceId
        },
      )
    await expect(Promise.all([read('one'), read('two')])).resolves.toEqual(['one', 'two'])
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
