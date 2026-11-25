import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { MockAgent } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import { HttpRateLimitError, HttpServerError } from '@vouchington/sentry'
import {
  enableApiEgressGuardrail,
  fetchWithTimeoutSimple,
  getExternalFetch,
  getExternalRequestDispatcher,
  getLongRunningExternalFetch,
  handleHttpErrors,
  reportHttpTransportError,
} from '../http.mts'

function createResponse(status: number, headers: Record<string, string> = {}): Response {
  return { status, headers: new Headers(headers), body: null } as unknown as Response
}

describe('handleHttpErrors', () => {
  it('throws the app rate-limit error with the parsed retry delay', () => {
    const response = createResponse(429, { 'retry-after': '60' })
    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).toThrow(
      expect.objectContaining({ constructor: HttpRateLimitError, retryAfterMs: 60_000 }),
    )
  })

  it('throws the app server error for 5xx responses', () => {
    const response = createResponse(503)
    expect(() => handleHttpErrors({ response, url: 'https://example.com' })).toThrow(
      HttpServerError,
    )
  })
})

describe('fetchWithTimeoutSimple', () => {
  it('fetches through the shared external dispatcher', async () => {
    const server = createServer((_request, response) => response.end('ok'))
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const { port } = server.address() as AddressInfo
      const response = await fetchWithTimeoutSimple(`http://127.0.0.1:${port}/`, 5_000)
      await expect(response.text()).resolves.toBe('ok')
    } finally {
      server.close()
    }
  })
})

describe('enableApiEgressGuardrail', () => {
  it('composes one shared egress guardrail across dispatchers using Voucha allowlist and reporter', async () => {
    const raw = getExternalRequestDispatcher()
    enableApiEgressGuardrail()
    expect(getExternalRequestDispatcher()).not.toBe(raw)

    vi.stubEnv('NODE_ENV', 'development')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const routineMock = new MockAgent()
    const longRunningMock = new MockAgent()
    routineMock.disableNetConnect()
    longRunningMock.disableNetConnect()
    routineMock
      .get('https://off-allowlist-dedupe.example.com')
      .intercept({ path: '/v1/charges?q=secret', method: 'GET' })
      .reply(200, 'ok')
    routineMock
      .get('https://www.googleapis.com')
      .intercept({ path: '/oauth2/v3/certs', method: 'GET' })
      .reply(200, 'ok')
    longRunningMock
      .get('https://off-allowlist-dedupe.example.com')
      .intercept({ path: '/v1/customers', method: 'GET' })
      .reply(200, 'ok')

    try {
      await getExternalFetch()('https://www.googleapis.com/oauth2/v3/certs', {
        dispatcher: routineMock,
      } as RequestInit)
      expect(consoleWarn).not.toHaveBeenCalled()

      await getExternalFetch()('https://off-allowlist-dedupe.example.com/v1/charges?q=secret', {
        dispatcher: routineMock,
      } as RequestInit)
      await getLongRunningExternalFetch()('https://off-allowlist-dedupe.example.com/v1/customers', {
        dispatcher: longRunningMock,
      } as RequestInit)

      expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(
        '[egress-guardrail] off-allowlist API egress',
        'off-allowlist-dedupe.example.com',
        { path: '/v1/charges', method: 'GET' },
      )
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
      await Promise.all([routineMock.close(), longRunningMock.close()])
    }
  })
})

describe('reportHttpTransportError', () => {
  it('wraps non-Error transport failures before reporting them', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const error = new Error('boom')
      reportHttpTransportError(error)
      reportHttpTransportError('non-error rejection')

      expect(consoleError).toHaveBeenNthCalledWith(1, error)
      expect(consoleError).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          message: 'HTTP transport failure',
          cause: 'non-error rejection',
        }),
      )
    } finally {
      consoleError.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
