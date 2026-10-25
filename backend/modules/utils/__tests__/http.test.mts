import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { HttpRateLimitError, HttpServerError } from '@vouchington/sentry'
import {
  enableApiEgressGuardrail,
  fetchWithTimeoutSimple,
  getExternalRequestDispatcher,
  handleHttpErrors,
  isAmbiguousBilledHttpStatus,
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

describe('isAmbiguousBilledHttpStatus', () => {
  it.each([408, 409, 429, 500, 503])('treats %i as possibly billed', status => {
    expect(isAmbiguousBilledHttpStatus(status)).toBe(true)
  })

  it.each([200, 400, 401, 404])('treats %i as not billed', status => {
    expect(isAmbiguousBilledHttpStatus(status)).toBe(false)
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
  it('composes the egress guardrail onto the external dispatcher', () => {
    const raw = getExternalRequestDispatcher()
    enableApiEgressGuardrail()
    expect(getExternalRequestDispatcher()).not.toBe(raw)
  })
})
