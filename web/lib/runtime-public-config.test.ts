import { describe, expect, it } from 'vitest'
import { getOAuthProviders } from './runtime-public-config'

describe('runtime public config', () => {
  it('only exposes OAuth providers with runtime public ids', () => {
    expect(getOAuthProviders({})).toEqual([])
    expect(
      getOAuthProviders({
        facebookAppId: 'facebook-app-id',
        githubClientId: 'github-client-id',
        googleClientId: 'google-client-id',
      }),
    ).toEqual(['facebook', 'google', 'github'])
  })
})
