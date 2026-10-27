import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { mintUuidv7 as mintUUIDv7 } from '@vouchington/session-jwt'
import { getCachedVerifiedDeviceToken, getCachedVerifiedSessionPair } from './index.mts'
import { createRequestClientInfoListener } from './listener.mts'

describe('request client session pair cache', () => {
  it('keeps one verified session pair for the request cookies', async () => {
    const did = mintUUIDv7()
    const verifiedSession = { did, sid: mintUUIDv7(), uid: null }
    let request: IncomingMessage | undefined
    const listener = createRequestClientInfoListener(
      (req, res) => {
        request = req
        res.end()
      },
      {
        isEnforced: () => true,
        mintDeviceId: mintUUIDv7,
        verifyDeviceIdentity: async () => ({ did, dc: 'attested', verifiedSession }),
      },
    )

    await new Promise<void>(resolve => {
      listener(
        {
          method: 'GET',
          url: '/api/v1/posts',
          headers: {
            'x-voucha-client': 'web',
            'x-voucha-platform': 'web',
            'x-voucha-app-version': 'test',
            cookie: 'dt=valid; st=session',
            'cf-connecting-ip': '203.0.113.2',
          },
          socket: { remoteAddress: '127.0.0.1' },
        } as unknown as IncomingMessage,
        {
          writeHead: vi.fn<ServerResponse['writeHead']>(),
          end: () => resolve(),
          headersSent: false,
        } as unknown as ServerResponse,
      )
    })

    expect(request).toBeDefined()
    expect(getCachedVerifiedSessionPair(request!, 'valid', 'session')).toBe(verifiedSession)
    expect(getCachedVerifiedSessionPair(request!, 'valid', 'other')).toBeUndefined()
    expect(getCachedVerifiedDeviceToken(request!, 'valid')).toEqual({ did, dc: 'attested' })
  })
})
