import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { mintUuidv7 as mintUUIDv7 } from '@vouchington/session-jwt'
import { createRequestClientInfoListener } from './listener.mts'

describe('request client information listener completion', () => {
  it('returns the admitted handler completion without treating its failure as invalid client info', async () => {
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let calls = 0
    const listener = createRequestClientInfoListener(
      () => {
        calls++
        entered.resolve()
        return release.promise
      },
      {
        isEnforced: () => true,
        mintDeviceId: mintUUIDv7,
        verifyDeviceIdentity: async () => ({ did: mintUUIDv7() }),
      },
    )
    const handling = listener(
      {
        method: 'GET',
        url: '/api/v1/posts',
        headers: {
          'x-voucha-client': 'web',
          'x-voucha-platform': 'web',
          'x-voucha-app-version': 'test',
          cookie: 'dt=valid',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as IncomingMessage,
      {} as ServerResponse,
    )
    const failure = handling.catch(err => err)
    await entered.promise
    expect(calls).toBe(1)
    release.reject(new Error('handler failure'))
    expect(await failure).toEqual(new Error('handler failure'))
    expect(calls).toBe(1)
  })
})
