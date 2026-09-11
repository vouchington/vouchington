import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { mintUUIDv7, type DeviceTokenPayload } from '@ts-shared/session-jwt'
import { getOptionalRequestClientInfo } from './index.mts'
import { createRequestClientInfoListener } from './listener.mts'

describe('request client information listener request IDs', () => {
  it('uses the first duplicate request ID in request context', async () => {
    const response = await callListener({
      headers: validHeaders({
        cookie: 'dt=valid',
        'cf-connecting-ip': '203.0.113.2',
        'x-request-id': ['request-1', 'request-2'],
      }),
      verifyDeviceIdentity: async () => ({ did: mintUUIDv7() }) as DeviceTokenPayload,
    })
    expect(JSON.parse(response.body)).toMatchObject({ requestId: 'request-1' })
  })

  it('uses the first duplicate request ID in invalid metadata responses', async () => {
    const response = await callListener({
      headers: { 'x-request-id': ['request-1', 'request-2'] },
      isEnforced: () => true,
    })
    expect(response.status).toBe(400)
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'INVALID_CLIENT_INFO',
      request_id: 'request-1',
    })
  })
})

type CallOptions = {
  method?: string
  path?: string
  headers: IncomingMessage['headers']
  isEnforced?: () => boolean
  verifyDeviceIdentity?: (
    token: string,
    sessionToken?: string,
  ) => Promise<DeviceTokenPayload | null>
}

type ListenerCallResult = {
  status: number
  body: string
}

async function callListener(options: CallOptions): Promise<ListenerCallResult> {
  return await new Promise(resolve => {
    let status = 200
    let body = ''
    const response = {
      headersSent: false,
      setHeader: vi.fn<ServerResponse['setHeader']>(),
      writeHead(statusCode: number) {
        status = statusCode
        return response
      },
      end(chunk?: unknown) {
        body = typeof chunk === 'string' ? chunk : ''
        resolve({ status, body })
        return response
      },
    }
    const listener = createRequestClientInfoListener(
      (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(getOptionalRequestClientInfo() ?? null))
      },
      {
        isEnforced: options.isEnforced ?? (() => true),
        mintDeviceId: mintUUIDv7,
        verifyDeviceIdentity: options.verifyDeviceIdentity ?? (async () => null),
      },
    )
    listener(
      {
        method: options.method,
        url: options.path ?? '/api/v1/posts',
        headers: options.headers,
        socket: { remoteAddress: '127.0.0.1' },
      } as IncomingMessage,
      response as unknown as ServerResponse,
    )
  })
}

function validHeaders(overrides: IncomingMessage['headers'] = {}): IncomingMessage['headers'] {
  return {
    'x-voucha-client': 'web',
    'x-voucha-platform': 'web',
    'x-voucha-app-version': 'test',
    ...overrides,
  }
}
