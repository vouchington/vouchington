import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { mintUUIDv7, type DeviceTokenPayload } from '@ts-shared/session-jwt'
import { getOptionalRequestOrigin } from './index.mts'
import { createRequestClientInfoListener } from './listener.mts'

describe('request client information listener origin', () => {
  it('records a REST session origin for the validated client', async () => {
    const origin = await originOf({
      headers: {
        'x-voucha-client': 'swift',
        'x-voucha-platform': 'ios',
        'x-voucha-app-version': 'test',
        cookie: 'dt=valid',
      },
      isEnforced: () => true,
    })
    expect(origin).toEqual({
      interface: 'rest',
      credential: 'session',
      client: 'swift',
      oauthClientId: null,
    })
  })

  it('records a client-less session origin for invalid metadata in observe mode', async () => {
    const origin = await originOf({ headers: {}, isEnforced: () => false })
    expect(origin).toMatchObject({ credential: 'session', client: null })
  })

  it('leaves exempt MCP requests for the MCP routes to classify', async () => {
    const origin = await originOf({ path: '/api/v1/mcp', headers: {}, isEnforced: () => true })
    expect(origin).toBeUndefined()
  })
})

type OriginOptions = {
  path?: string
  headers: IncomingMessage['headers']
  isEnforced: () => boolean
}

async function originOf(
  options: OriginOptions,
): Promise<ReturnType<typeof getOptionalRequestOrigin>> {
  return await new Promise(resolve => {
    const listener = createRequestClientInfoListener(() => resolve(getOptionalRequestOrigin()), {
      isEnforced: options.isEnforced,
      mintDeviceId: mintUUIDv7,
      verifyDeviceIdentity: async () => ({ did: mintUUIDv7() }) as DeviceTokenPayload,
    })
    listener(
      {
        method: 'POST',
        url: options.path ?? '/api/v1/posts',
        headers: options.headers,
        socket: { remoteAddress: '127.0.0.1' },
      } as IncomingMessage,
      {} as ServerResponse,
    )
  })
}
