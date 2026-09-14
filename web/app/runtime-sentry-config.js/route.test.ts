import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET, HEAD } from './route'

describe('runtime Sentry config web fallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('serves the validated runtime DSN as uncached JavaScript', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    vi.stubEnv('SENTRY_WEB_DSN', 'https://public@example.test/123')

    const response = GET()
    const body = await response.text()

    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('application/javascript; charset=utf-8')
    expect(body).toContain('"environment":"production"')
    expect(body).toContain('https://public@example.test/123')
    expect(body).toContain('voucha:runtime-public-config-ready')
  })

  it('omits malformed DSNs and returns an empty HEAD body', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    vi.stubEnv('SENTRY_WEB_DSN', 'invalid-private-value')

    expect(await GET().text()).not.toContain('invalid-private-value')
    expect(HEAD().body).toBeNull()
  })
})
