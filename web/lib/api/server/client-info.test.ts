import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildWebClientInfoHeaders } from './client-info'

describe('buildWebClientInfoHeaders', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('prefers the browser-visible web release', () => {
    vi.stubEnv('NEXT_PUBLIC_GIT_COMMIT', 'public-release')
    vi.stubEnv('GIT_COMMIT', 'server-release')
    expect(buildWebClientInfoHeaders()['x-voucha-app-version']).toBe('public-release')
  })

  it('uses the server release when a public release is unavailable', () => {
    vi.stubEnv('GIT_COMMIT', 'server-release')
    expect(buildWebClientInfoHeaders()['x-voucha-app-version']).toBe('server-release')
  })

  it('uses the explicit development fallback', () => {
    expect(buildWebClientInfoHeaders()).toEqual({
      'x-voucha-app-version': 'development',
      'x-voucha-client': 'web',
      'x-voucha-platform': 'web',
    })
  })
})
