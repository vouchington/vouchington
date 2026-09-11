import { describe, expect, it } from 'vitest'
import { stripCacheHeaders } from '../cache-response-headers.mts'

describe('stripCacheHeaders', () => {
  it('strips CSP enforcement and report-only headers', () => {
    const headers = new Headers({
      'content-security-policy': "script-src 'nonce-stale'",
      'content-security-policy-report-only': "script-src 'nonce-report-only'",
      'content-type': 'text/html',
    })

    const result = stripCacheHeaders(headers)

    expect(result.get('content-security-policy')).toBeNull()
    expect(result.get('content-security-policy-report-only')).toBeNull()
    expect(result.get('content-type')).toBe('text/html')
  })

  it('preserves multiple set-cookie headers as separate values', () => {
    const headers = new Headers()
    headers.append('set-cookie', 'a=1; Path=/')
    headers.append('set-cookie', 'b=2; Path=/')

    const result = stripCacheHeaders(headers)

    expect(result.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/'])
  })
})
