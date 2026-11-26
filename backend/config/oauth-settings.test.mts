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
  'MICROSOFT_TENANT_ID',
  'X_CLIENT_ID',
  'X_CLIENT_SECRET',
] as const

async function importConfig() {
  vi.resetModules()
  return import('./index.mts')
}

describe('oauth config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('treats OpenTofu placeholder credentials as unset', async () => {
    for (const name of oauthEnvNames) vi.stubEnv(name, 'PLACEHOLDER')

    await expect(importConfig()).resolves.toMatchObject({
      APPLE_CLIENT_ID: '',
      FACEBOOK_APP_ID: '',
      FACEBOOK_APP_SECRET: '',
      GITHUB_CLIENT_ID: '',
      GITHUB_CLIENT_SECRET: '',
      GOOGLE_CLIENT_ID: '',
      LINKEDIN_CLIENT_ID: '',
      LINKEDIN_CLIENT_SECRET: '',
      MICROSOFT_CLIENT_ID: '',
      MICROSOFT_CLIENT_SECRET: '',
      MICROSOFT_TENANT_ID: 'common',
      X_CLIENT_ID: '',
      X_CLIENT_SECRET: '',
    })
  })

  it('trims configured OAuth credentials', async () => {
    vi.stubEnv('GITHUB_CLIENT_ID', ' github-client ')
    vi.stubEnv('GITHUB_CLIENT_SECRET', ' github-secret ')
    vi.stubEnv('MICROSOFT_TENANT_ID', ' organizations ')

    await expect(importConfig()).resolves.toMatchObject({
      GITHUB_CLIENT_ID: 'github-client',
      GITHUB_CLIENT_SECRET: 'github-secret',
      MICROSOFT_TENANT_ID: 'organizations',
    })
  })

  it('uses the common Microsoft tenant when the tenant id is unset', async () => {
    vi.stubEnv('MICROSOFT_TENANT_ID', undefined)

    await expect(importConfig()).resolves.toMatchObject({
      MICROSOFT_TENANT_ID: 'common',
    })
  })
})
