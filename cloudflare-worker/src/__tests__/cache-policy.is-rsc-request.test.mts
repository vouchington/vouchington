import { describe, expect, it } from 'vitest'
import { isRscRequest } from '../cache-route-policy.mts'

const makeRequest = (urlString: string, accept?: string): { request: Request; url: URL } => {
  const headers = new Headers()
  if (accept !== undefined) {
    headers.set('accept', accept)
  }
  const request = new Request(urlString, { headers })
  return { request, url: new URL(urlString) }
}

describe('isRscRequest', () => {
  it('returns true when _rsc query param is present', () => {
    const { request, url } = makeRequest('https://example.com/?_rsc=abc')
    expect(isRscRequest(request, url)).toBe(true)
  })

  it('returns true for a header-only RSC request (rsc: 1, no _rsc param or Accept signal)', () => {
    const { request, url } = makeRequest('https://example.com/')
    request.headers.set('rsc', '1')
    expect(isRscRequest(request, url)).toBe(true)
  })

  it('returns false when the rsc header is present but not "1"', () => {
    const { request, url } = makeRequest('https://example.com/')
    request.headers.set('rsc', '0')
    expect(isRscRequest(request, url)).toBe(false)
  })

  it('returns true when Accept includes lowercase text/x-component', () => {
    const { request, url } = makeRequest('https://example.com/', 'text/x-component')
    expect(isRscRequest(request, url)).toBe(true)
  })

  it('returns true when Accept includes mixed-case Text/X-Component (RFC 9110)', () => {
    const { request, url } = makeRequest('https://example.com/', 'Text/X-Component')
    expect(isRscRequest(request, url)).toBe(true)
  })

  it('returns false for plain HTML Accept with no _rsc param', () => {
    const { request, url } = makeRequest('https://example.com/', 'text/html')
    expect(isRscRequest(request, url)).toBe(false)
  })

  it('returns false when neither signal is present', () => {
    const { request, url } = makeRequest('https://example.com/')
    expect(isRscRequest(request, url)).toBe(false)
  })
})
