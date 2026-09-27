import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { QueryExecutor } from '@data-stores/psql'
import { getOAuthAuthorizationErrorRedirect } from './authorization-error-redirect.mts'
import { OAuthProtocolError } from './errors.mts'

function redirectInput() {
  return {
    clientId: `https://client.example/${randomBytes(12).toString('hex')}/metadata.json`,
    redirectUri: 'https://app.example/oauth/callback',
    state: 'opaque-state',
    error: new OAuthProtocolError('invalid_scope', 'scope rejected'),
  }
}

describe('OAuth authorization error redirects', () => {
  it('rethrows unexpected metadata resolution failures', async () => {
    await expect(
      getOAuthAuthorizationErrorRedirect(redirectInput(), {
        query: async () => Promise.reject(new Error('database unavailable')),
      }),
    ).rejects.toThrow('database unavailable')
  })

  it('rethrows operational metadata protocol failures', async () => {
    const query: QueryExecutor = async () => ({
      command: 'SELECT',
      fields: [],
      oid: 0,
      rowCount: 0,
      rows: [],
    })
    await expect(
      getOAuthAuthorizationErrorRedirect(redirectInput(), { query }),
    ).rejects.toMatchObject({ code: 'server_error' })
  })
})
