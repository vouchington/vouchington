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

const originalEnv = new Map(oauthEnvNames.map(name => [name, process.env[name]]))

async function importConfig() {
  vi.resetModules()
  return import('./index.mts')
}

describe('oauth config', () => {
  afterEach(() => {
    for (const name of oauthEnvNames) {
      const originalValue = originalEnv.get(name)
      if (originalValue === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = originalValue
      }
    }
  })

  it('treats OpenTofu placeholder credentials as unset', async () => {
    for (const name of oauthEnvNames) process.env[name] = 'PLACEHOLDER'

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
    process.env.GITHUB_CLIENT_ID = ' github-client '
    process.env.GITHUB_CLIENT_SECRET = ' github-secret '
    process.env.MICROSOFT_TENANT_ID = ' organizations '

    await expect(importConfig()).resolves.toMatchObject({
      GITHUB_CLIENT_ID: 'github-client',
      GITHUB_CLIENT_SECRET: 'github-secret',
      MICROSOFT_TENANT_ID: 'organizations',
    })
  })

  it('uses the common Microsoft tenant when the tenant id is unset', async () => {
    delete process.env.MICROSOFT_TENANT_ID

    await expect(importConfig()).resolves.toMatchObject({
      MICROSOFT_TENANT_ID: 'common',
    })
  })
})
