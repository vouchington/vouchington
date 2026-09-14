import { describe, expect, it } from 'vitest'
import { getBasicAuthResponse, parseBasicAuthCredentials } from './basic-auth.mts'
import type { Env } from './types.mts'

const baseEnv: Env = {
  BACKEND_ORIGIN: 'https://backend.example.com',
  WEB_ORIGIN: 'https://web.example.com',
}

describe('parseBasicAuthCredentials', () => {
  it('returns null when env value is unset', () => {
    expect(parseBasicAuthCredentials(undefined)).toBeNull()
  })

  it('returns null when env value is empty', () => {
    expect(parseBasicAuthCredentials('')).toBeNull()
  })

  it('returns null when env value is whitespace only', () => {
    expect(parseBasicAuthCredentials('   ')).toBeNull()
  })

  it('parses a single credential', () => {
    const result = parseBasicAuthCredentials('alice:hunter2')
    expect(result).toEqual(new Set(['alice:hunter2']))
  })

  it('parses multiple credentials (rotation list)', () => {
    const result = parseBasicAuthCredentials('alice:hunter2,bob:s3cr3t')
    expect(result).toEqual(new Set(['alice:hunter2', 'bob:s3cr3t']))
  })

  it('preserves significant whitespace around entries', () => {
    const result = parseBasicAuthCredentials(' alice:hunter2 , bob:s3cr3t ')
    expect(result).toEqual(new Set([' alice:hunter2 ', ' bob:s3cr3t ']))
  })

  it('rejects the entire list when any entry is malformed', () => {
    const result = parseBasicAuthCredentials('alice:hunter2,,bob:s3cr3t,')
    expect(result).toEqual(new Set())
  })

  it('returns an empty Set (gate enabled, fail-closed) when all entries are malformed', () => {
    const result = parseBasicAuthCredentials('alice,bob')
    expect(result).not.toBeNull()
    expect(result?.size).toBe(0)
  })

  it('rejects an entry with an empty password (colon at end)', () => {
    const result = parseBasicAuthCredentials('alice:')
    expect(result).not.toBeNull()
    expect(result?.size).toBe(0)
  })

  it('rejects an entry with an empty username (colon at start)', () => {
    const result = parseBasicAuthCredentials(':hunter2')
    expect(result).not.toBeNull()
    expect(result?.size).toBe(0)
  })

  it('accepts credentials where the password contains a colon', () => {
    const result = parseBasicAuthCredentials('alice:pass:word')
    expect(result).toEqual(new Set(['alice:pass:word']))
  })
})

const makeRequest = (
  path: string,
  authHeader?: string,
  method = 'GET',
): { request: Request; url: URL } => {
  const headers: Record<string, string> = {}
  if (authHeader) headers['authorization'] = authHeader
  const url = new URL(`https://staging.voucha.ai${path}`)
  return { request: new Request(url.toString(), { headers, method }), url }
}

const encodeCreds = (userPass: string) => `Basic ${btoa(userPass)}`

describe('getBasicAuthResponse', () => {
  it('returns null (gate disabled) when BASIC_AUTH_CREDENTIALS is unset', () => {
    const { request, url } = makeRequest('/')
    const result = getBasicAuthResponse(request, baseEnv, url)
    expect(result).toBeNull()
  })

  it('returns null (gate disabled) when BASIC_AUTH_CREDENTIALS is empty', () => {
    const { request, url } = makeRequest('/')
    const result = getBasicAuthResponse(
      request,
      {
        ...baseEnv,
        BASIC_AUTH_CREDENTIALS: '',
      },
      url,
    )
    expect(result).toBeNull()
  })

  it('returns 401 (fail-closed) when BASIC_AUTH_CREDENTIALS is set but all entries are malformed', () => {
    const { request, url } = makeRequest('/')
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice,bob' },
      url,
    )
    expect(result?.status).toBe(401)
  })

  it('returns 401 when creds are set and no Authorization header', () => {
    const { request, url } = makeRequest('/')
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2' },
      url,
    )
    expect(result?.status).toBe(401)
    expect(result?.headers.get('www-authenticate')).toMatch(/^Basic realm=/)
    expect(result?.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(result?.headers.get('cdn-cache-control')).toBe('no-store')
    expect(result?.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
  })

  it('returns 401 on wrong credentials', () => {
    const { request, url } = makeRequest('/', encodeCreds('alice:wrong'))
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2' },
      url,
    )
    expect(result?.status).toBe(401)
  })

  it('returns 401 on malformed base64', () => {
    const { request, url } = makeRequest('/', 'Basic not-valid-base64!!!')
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2' },
      url,
    )
    expect(result?.status).toBe(401)
  })

  it('returns 401 for non-Basic Authorization scheme', () => {
    const { request, url } = makeRequest('/', 'Bearer some-token')
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2' },
      url,
    )
    expect(result?.status).toBe(401)
  })

  it('returns null (pass) on a correct credential', () => {
    const { request, url } = makeRequest('/', encodeCreds('alice:hunter2'))
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2' },
      url,
    )
    expect(result).toBeNull()
  })

  it('returns null (pass) on the second credential in a rotation list', () => {
    const { request, url } = makeRequest('/', encodeCreds('bob:s3cr3t'))
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2,bob:s3cr3t' },
      url,
    )
    expect(result).toBeNull()
  })

  it('returns null (exempted) for MCP Bearer-auth path regardless of auth', () => {
    const { request, url } = makeRequest('/api/v1/mcp', undefined, 'POST')
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2' },
      url,
    )
    expect(result).toBeNull()
  })

  it('exempts only POST Google Play notifications from staging Basic Auth', () => {
    const env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2' }
    const post = makeRequest(
      '/api/v1/memberships/google-play/notifications',
      'Bearer google-jwt',
      'POST',
    )
    expect(getBasicAuthResponse(post.request, env, post.url)).toBeNull()
    const get = makeRequest('/api/v1/memberships/google-play/notifications', 'Bearer google-jwt')
    expect(getBasicAuthResponse(get.request, env, get.url)?.status).toBe(401)
  })

  it('returns null (exempted) for infra ping without credentials', () => {
    const { request, url } = makeRequest('/infra/ping')
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2' },
      url,
    )
    expect(result).toBeNull()
  })

  it('returns null (exempted) for the web app manifest without credentials', () => {
    const { request, url } = makeRequest('/manifest.webmanifest')
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2' },
      url,
    )
    expect(result).toBeNull()
  })

  it('returns 401 for wrong-method (POST) manifest fetch without credentials', () => {
    const { request, url } = makeRequest('/manifest.webmanifest', undefined, 'POST')
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2' },
      url,
    )
    expect(result?.status).toBe(401)
  })

  it('returns 401 for a wrong-method machine route without Basic credentials', () => {
    const { request, url } = makeRequest('/api/v1/mcp', 'Bearer voucha_mcp_test')
    const result = getBasicAuthResponse(
      request,
      { ...baseEnv, BASIC_AUTH_CREDENTIALS: 'alice:hunter2' },
      url,
    )
    expect(result?.status).toBe(401)
  })
})
