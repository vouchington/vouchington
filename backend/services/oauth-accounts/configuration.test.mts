import { afterEach, describe, expect, it, vi } from 'vitest'

const oauthEnvNames = [
  'APPLE_CLIENT_ID',
  'FACEBOOK_APP_ID',
  'FACEBOOK_APP_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID',
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'X_CLIENT_ID',
  'X_CLIENT_SECRET',
] as const

describe('configured login providers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })
  it('only reports OAuth providers whose backend credentials are configured', async () => {
    for (const name of oauthEnvNames) vi.stubEnv(name, '')
    vi.resetModules()
    process.env.GOOGLE_CLIENT_ID = 'google-client'
    process.env.APPLE_CLIENT_ID = 'apple-client'
    process.env.GITHUB_CLIENT_ID = 'github-client'
    process.env.GITHUB_CLIENT_SECRET = 'PLACEHOLDER'
    process.env.FACEBOOK_APP_ID = 'facebook-app'
    process.env.FACEBOOK_APP_SECRET = 'facebook-secret'
    process.env.X_CLIENT_ID = 'x-client'
    process.env.X_CLIENT_SECRET = 'x-secret'
    process.env.LINKEDIN_CLIENT_ID = 'linkedin-client'
    process.env.MICROSOFT_CLIENT_ID = 'microsoft-client'
    process.env.MICROSOFT_CLIENT_SECRET = 'microsoft-secret'

    const { getConfiguredOAuthProviders } = await import('./configuration.mts')

    expect(getConfiguredOAuthProviders()).toEqual(['facebook', 'apple', 'google', 'x', 'microsoft'])
  })
})
