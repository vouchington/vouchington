import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createTestPendingOAuthAuthorization,
  issueTestOAuthTokens,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { decideOAuthAuthorizationRequest } from './consent.mts'
import { getTestOAuthGrantMfaVerifiedAt } from '@voucha/test-helpers/entities/oauth-authorization-server'
import { validateOAuthAccessToken } from './access-tokens.mts'

describe('MFA assurance for staff OAuth grants', () => {
  it('denies staff consent without current-session MFA proof even for an enrolled administrator', async () => {
    const user = await createTestUser({ administrator: true })
    const pending = await createTestPendingOAuthAuthorization(user, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })
    const decision = await decideOAuthAuthorizationRequest(
      user.id,
      pending.requestId,
      'approve',
      pending.bindingHash,
      undefined,
    )
    expect(new URL(decision.redirect_uri).searchParams.get('error')).toBe('access_denied')
    expect(new URL(decision.redirect_uri).searchParams.has('code')).toBe(false)
  })

  it('issues a usable staff grant when the consent session completed MFA', async () => {
    const user = await createTestUser({ administrator: true })
    const token = await issueTestOAuthTokens(user, { audience: 'admin', scope: 'mcp.admin:read' })
    await expect(validateOAuthAccessToken(token.access_token, 'admin')).resolves.toMatchObject({
      user_id: user.id,
    })
  })

  it('records the original verified session instant rather than the consent creation time', async () => {
    const user = await createTestUser({ administrator: true })
    const pending = await createTestPendingOAuthAuthorization(user, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })
    const verifiedAt = Math.floor(Date.now() / 1000) - 300
    const decision = await decideOAuthAuthorizationRequest(
      user.id,
      pending.requestId,
      'approve',
      pending.bindingHash,
      verifiedAt,
    )
    expect(new URL(decision.redirect_uri).searchParams.has('code')).toBe(true)
    expect(await getTestOAuthGrantMfaVerifiedAt(user.id, pending.client.client_id)).toEqual(
      new Date(verifiedAt * 1000),
    )
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid internal assurance instant %s',
    async verifiedAt => {
      const user = await createTestUser({ administrator: true })
      const pending = await createTestPendingOAuthAuthorization(user, {
        audience: 'admin',
        scope: 'mcp.admin:read',
      })
      await expect(
        decideOAuthAuthorizationRequest(
          user.id,
          pending.requestId,
          'approve',
          pending.bindingHash,
          verifiedAt,
        ),
      ).rejects.toMatchObject({ code: 'access_denied' })
      expect(await getTestOAuthGrantMfaVerifiedAt(user.id, pending.client.client_id)).toBeNull()
    },
  )
})
