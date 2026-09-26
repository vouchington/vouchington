import { beforeAll, describe, expect, it, vi } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { setTestOAuthArtifactExpiry } from '@voucha/test-helpers/entities/oauth-authorization-server'
import { assignTestOAuthClientOwner } from '@voucha/test-helpers/entities/oauth-client-management'
import {
  getTestOAuthConsentDecisions,
  mutateTestOAuthLifecycleEvent,
} from '@voucha/test-helpers/entities/oauth-authorization-server-events'
import {
  createTestApprovedOAuthAuthorization,
  createTestPendingOAuthAuthorization,
  randomTestOAuthRedirectUri,
  TEST_OAUTH_RESOURCE,
} from './test-support.mts'
import {
  createOAuthBrowserBindingHash,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
  getOAuthAuthorizationRequestForUser,
  OAuthProtocolError,
  updateOwnedOAuthApp,
} from './index.mts'

type TestUser = Awaited<ReturnType<typeof createTestUserDirect>>

/** Has a fresh owner replace the client's only redirect URI, as the owner's settings page would. */
async function replaceTestRedirectUri(clientId: string): Promise<void> {
  const appOwner = await createTestUserDirect()
  const appId = await assignTestOAuthClientOwner(clientId, appOwner.id)
  await updateOwnedOAuthApp(appOwner.id, appId, { redirect_uris: [randomTestOAuthRedirectUri()] })
}

describe('OAuth consent', () => {
  let owner: TestUser
  let otherUser: TestUser

  beforeAll(async () => {
    ;[owner, otherUser] = await Promise.all([createTestUserDirect(), createTestUserDirect()])
  })

  it('allows only the owning user and browser session to decide a pending request', async () => {
    const pending = await createTestPendingOAuthAuthorization(owner)

    await expect(
      getOAuthAuthorizationRequestForUser(otherUser.id, pending.requestId, pending.bindingHash),
    ).resolves.toBeNull()
    await expect(
      decideOAuthAuthorizationRequest(
        otherUser.id,
        pending.requestId,
        'approve',
        pending.bindingHash,
      ),
    ).rejects.toBeInstanceOf(OAuthProtocolError)
    const wrongBinding = createOAuthBrowserBindingHash(uuidv7(), uuidv7())
    await expect(
      getOAuthAuthorizationRequestForUser(owner.id, pending.requestId, wrongBinding),
    ).resolves.toBeNull()
    await expect(
      decideOAuthAuthorizationRequest(owner.id, pending.requestId, 'approve', wrongBinding),
    ).rejects.toBeInstanceOf(OAuthProtocolError)
    await expect(
      getOAuthAuthorizationRequestForUser(owner.id, pending.requestId, pending.bindingHash),
    ).resolves.toMatchObject({
      client_name: pending.client.client_name,
      resource: TEST_OAUTH_RESOURCE,
    })
    await expect(
      decideOAuthAuthorizationRequest(owner.id, pending.requestId, 'deny', pending.bindingHash),
    ).resolves.toMatchObject({ redirect_uri: expect.stringContaining('error=access_denied') })
    await expect(
      decideOAuthAuthorizationRequest(owner.id, pending.requestId, 'deny', pending.bindingHash),
    ).rejects.toBeInstanceOf(OAuthProtocolError)
    await expect(getTestOAuthConsentDecisions(pending.client.client_id)).resolves.toEqual([
      {
        decision: 'deny',
        resource: TEST_OAUTH_RESOURCE,
        scopes: ['mcp.user:read', 'mcp.user:write'],
      },
    ])
  })

  it('rejects an expired pending consent request', async () => {
    const pending = await createTestPendingOAuthAuthorization(owner)
    await setTestOAuthArtifactExpiry(pending.client.client_id, new Date(Date.now() - 1_000))

    await expect(
      getOAuthAuthorizationRequestForUser(owner.id, pending.requestId, pending.bindingHash),
    ).resolves.toBeNull()
    await expect(
      decideOAuthAuthorizationRequest(owner.id, pending.requestId, 'approve', pending.bindingHash),
    ).rejects.toMatchObject({ code: 'access_denied' })
  })

  it('refuses a pending request whose redirect URI the owner has since removed', async () => {
    const pending = await createTestPendingOAuthAuthorization(owner)
    await replaceTestRedirectUri(pending.client.client_id)

    await expect(
      getOAuthAuthorizationRequestForUser(owner.id, pending.requestId, pending.bindingHash),
    ).resolves.toBeNull()
    for (const decision of ['approve', 'deny'] as const) {
      await expect(
        decideOAuthAuthorizationRequest(owner.id, pending.requestId, decision, pending.bindingHash),
      ).rejects.toMatchObject({ code: 'access_denied' })
    }
  })

  it('refuses to exchange a code issued to a redirect URI the owner has since removed', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    await replaceTestRedirectUri(flow.client.client_id)

    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('records each consent outcome in durable append-only evidence', async () => {
    const approved = await createTestApprovedOAuthAuthorization(owner)
    const denied = await createTestPendingOAuthAuthorization(owner)
    await decideOAuthAuthorizationRequest(owner.id, denied.requestId, 'deny', denied.bindingHash)

    await expect(getTestOAuthConsentDecisions(approved.client.client_id)).resolves.toEqual([
      {
        decision: 'approve',
        resource: TEST_OAUTH_RESOURCE,
        scopes: ['mcp.user:read', 'mcp.user:write'],
      },
    ])
    await expect(getTestOAuthConsentDecisions(denied.client.client_id)).resolves.toEqual([
      {
        decision: 'deny',
        resource: TEST_OAUTH_RESOURCE,
        scopes: ['mcp.user:read', 'mcp.user:write'],
      },
    ])
    await expect(
      mutateTestOAuthLifecycleEvent(approved.client.client_id, 'update'),
    ).rejects.toThrow('oauth authorization server events are append-only')
    await expect(
      mutateTestOAuthLifecycleEvent(approved.client.client_id, 'delete'),
    ).rejects.toThrow('oauth authorization server events are append-only')
  })

  it('does not write issued credentials to captured console output', async () => {
    const spies = [
      vi.spyOn(console, 'error').mockReturnValue(undefined),
      vi.spyOn(console, 'info').mockReturnValue(undefined),
      vi.spyOn(console, 'warn').mockReturnValue(undefined),
    ]
    try {
      const flow = await createTestApprovedOAuthAuthorization(owner)
      const tokens = await exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      })
      const captured = JSON.stringify(spies.flatMap(spy => spy.mock.calls))
      expect(captured).not.toContain(flow.code)
      expect(captured).not.toContain(tokens.access_token)
      expect(captured).not.toContain(tokens.refresh_token)
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
})
