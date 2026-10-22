import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getOAuthAuthorizationErrorRedirect } from './authorization-error-redirect.mts'
import { getOAuthClient, registerOAuthClient } from './clients.mts'
import { OAuthProtocolError } from '@vouchington/oauth-server'

describe('OAuth authorization error redirects', () => {
  it('keeps an unknown metadata client on the authorization server', async () => {
    await expect(
      getOAuthAuthorizationErrorRedirect(
        {
          clientId: `https://client.example/${randomBytes(12).toString('hex')}/metadata.json`,
          redirectUri: 'https://app.example/oauth/callback',
          state: 'opaque-state',
          error: new OAuthProtocolError('invalid_scope', 'scope rejected'),
        },
        null,
      ),
    ).resolves.toBeNull()
  })

  it('returns errors only to the existing client registered callback', async () => {
    const redirectUri = 'https://app.example/oauth/callback'
    const client = await registerOAuthClient({
      client_name: 'Registered callback app',
      redirect_uris: [redirectUri],
      scope: 'mcp.user:read',
    })
    const input = {
      clientId: client.client_id,
      redirectUri,
      state: 'opaque-state',
      error: new OAuthProtocolError('invalid_scope', 'scope rejected'),
    }
    const location = await getOAuthAuthorizationErrorRedirect(
      input,
      await getOAuthClient(client.client_id),
    )
    expect(new URL(location!).searchParams.get('error')).toBe('invalid_scope')
    await expect(
      getOAuthAuthorizationErrorRedirect(
        {
          ...input,
          redirectUri: 'https://other.example/callback',
        },
        await getOAuthClient(client.client_id),
      ),
    ).resolves.toBeNull()
  })
})
