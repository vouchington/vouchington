import { describe, expect, it } from 'vitest'
import { buildProviderAuthorizationUrl } from '../authorization-provider-url.mts'

describe('LinkedIn authorization URL', () => {
  it('enables extended login only for native broker callbacks', () => {
    const request = {
      provider: 'linkedin',
      clientId: 'linkedin-client-id',
      redirectUri: 'https://example.com/auth/callback/linkedin/broker',
      state: 'opaque-state',
      codeChallenge: 'Z'.repeat(43),
    } as const
    const native = new URL(buildProviderAuthorizationUrl({ ...request, callbackMode: 'native' }))
    const web = new URL(buildProviderAuthorizationUrl({ ...request, callbackMode: 'web' }))

    expect(native.searchParams.get('enable_extended_login')).toBe('true')
    expect(web.searchParams.has('enable_extended_login')).toBe(false)
    expect(native.searchParams.get('redirect_uri')).toBe(web.searchParams.get('redirect_uri'))
    expect(native.searchParams.get('scope')).toBe(web.searchParams.get('scope'))
  })
})
