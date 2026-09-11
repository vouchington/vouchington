import { describe, expect, it } from 'vitest'
import { edgeErrorResponse, withFailureNoStoreHeaders } from './error-response.mts'

describe('edgeErrorResponse', () => {
  it('returns JSON body with message and code', async () => {
    const response = edgeErrorResponse(429, 'Too Many Requests', 'RATE_LIMIT')
    const body = await response.json()
    expect(body).toEqual({ message: 'Too Many Requests', code: 'RATE_LIMIT' })
  })

  it('sets content-type to application/json', () => {
    const response = edgeErrorResponse(400, 'Bad Request', 'INVALID_INPUT')
    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('preserves the status code', () => {
    expect(edgeErrorResponse(400, 'Bad Request', 'INVALID_INPUT').status).toBe(400)
    expect(edgeErrorResponse(403, 'Forbidden', 'FORBIDDEN').status).toBe(403)
    expect(edgeErrorResponse(429, 'Rate Limited', 'RATE_LIMIT').status).toBe(429)
    expect(edgeErrorResponse(502, 'Bad Gateway', 'BAD_GATEWAY').status).toBe(502)
  })

  it('merges custom headers while forcing shared-cache no-store headers', async () => {
    const response = edgeErrorResponse(503, 'Service unavailable', 'SERVICE_UNAVAILABLE', {
      'cache-control': 'public, max-age=300',
      'retry-after': '60',
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(response.headers.get('cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('retry-after')).toBe('60')
    await expect(response.json()).resolves.toEqual({
      message: 'Service unavailable',
      code: 'SERVICE_UNAVAILABLE',
    })
  })

  it('forces shared-cache no-store headers without caller cache-control', () => {
    const response = edgeErrorResponse(429, 'Too Many Requests', 'RATE_LIMIT', {
      'retry-after': '60',
    })

    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(response.headers.get('cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('retry-after')).toBe('60')
  })

  it('works without custom headers', () => {
    const response = edgeErrorResponse(500, 'Internal Error', 'INTERNAL_ERROR')
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.status).toBe(500)
  })
})

describe('withFailureNoStoreHeaders', () => {
  it('returns 2xx responses unchanged', () => {
    const response = new Response('ok', { status: 200 })

    expect(withFailureNoStoreHeaders(response)).toBe(response)
  })

  it('returns redirect responses unchanged', () => {
    const response = new Response(null, { status: 302, headers: { location: '/next' } })

    expect(withFailureNoStoreHeaders(response)).toBe(response)
  })

  it('overrides cache headers on failure responses while preserving origin headers', async () => {
    const response = new Response('forbidden', {
      status: 403,
      statusText: 'Forbidden',
      headers: {
        'cache-control': 'public, max-age=300',
        'content-type': 'text/plain',
        'x-origin-header': 'kept',
      },
    })

    const result = withFailureNoStoreHeaders(response)

    expect(result).not.toBe(response)
    expect(result.status).toBe(403)
    expect(result.statusText).toBe('Forbidden')
    expect(result.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(result.headers.get('cdn-cache-control')).toBe('no-store')
    expect(result.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
    expect(result.headers.get('content-type')).toBe('text/plain')
    expect(result.headers.get('x-origin-header')).toBe('kept')
    await expect(result.text()).resolves.toBe('forbidden')
  })

  it('preserves multiple set-cookie headers when rewrapping failures', () => {
    const headers = new Headers()
    headers.append('set-cookie', 'a=1; Path=/')
    headers.append('set-cookie', 'b=2; Path=/')
    const response = new Response('forbidden', { status: 403, headers })

    const result = withFailureNoStoreHeaders(response)

    expect(result.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/'])
  })

  it('keeps 5xx bodies readable after rewrap', async () => {
    const response = new Response('server error', { status: 500 })

    const result = withFailureNoStoreHeaders(response)

    await expect(result.text()).resolves.toBe('server error')
  })
})
