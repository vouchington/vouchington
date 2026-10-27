import { describe, expect, it } from 'vitest'
import { getRouteConfig } from './config.mts'

describe('route rate-limit registry', () => {
  it('classifies authorization-server routes as sensitive', () => {
    const routes = [
      'GET:/authorize',
      'POST:/register',
      'POST:/token',
      'POST:/revoke',
      'GET:/api/v1/oauth/authorization-requests/:id',
      'POST:/api/v1/oauth/authorization-requests/:id/decisions',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('sensitive')
    }
  })

  it('classifies OAuth completion polling as read traffic', () => {
    expect(getRouteConfig('POST:/api/v1/auth/oauth/authorizations/:flowId/complete')).toEqual({
      category: 'read',
    })
  })

  it('allows mailbox-provider bursts on signed one-click unsubscribe requests', () => {
    expect(getRouteConfig('POST:/api/v1/email-unsubscribe')).toEqual({
      category: 'write',
      multiplier: 1000,
    })
  })

  it('classifies MFA and re-auth verification routes as sensitive', () => {
    const routes = [
      'POST:/api/v1/auth/mfa/totp/verification',
      'POST:/api/v1/auth/mfa/passkeys/authentication/options',
      'POST:/api/v1/auth/mfa/passkeys/authentication/verification',
      'POST:/api/v1/auth/mfa/re-auth/email/tokens',
      'POST:/api/v1/auth/mfa/re-auth/email/verification',
      'POST:/api/v1/auth/mfa/re-auth/totp/verification',
      'POST:/api/v1/auth/mfa/re-auth/tokens/verification',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('sensitive')
    }
  })

  it('classifies discoverable passkey sign-in routes as sensitive', () => {
    const routes = [
      'POST:/api/v1/auth/passkeys/authentication/options',
      'POST:/api/v1/auth/passkeys/authentication/verify',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('sensitive')
    }
  })

  it('keeps email OTP login route rate limit aligned with its verifier threshold', () => {
    expect(getRouteConfig('POST:/api/v1/auth/email-address/login')).toEqual({
      category: 'sensitive',
      multiplier: 2,
    })
  })

  it('classifies credential management routes as sensitive', () => {
    const routes = [
      'POST:/api/v1/auth/totp',
      'POST:/api/v1/auth/totp/setup/verification',
      'PATCH:/api/v1/auth/totp/:id',
      'DELETE:/api/v1/auth/totp/:id',
      'PATCH:/api/v1/auth/passkeys/:id',
      'DELETE:/api/v1/auth/passkeys/:id',
      'DELETE:/api/v1/auth/sessions/:id',
      'POST:/api/v1/auth/sessions/revocations',
      'POST:/api/v1/my/api-keys',
      'DELETE:/api/v1/my/api-keys/:id',
      'POST:/api/v1/my/oauth-apps',
      'PATCH:/api/v1/my/oauth-apps/:id',
      'DELETE:/api/v1/my/oauth-apps/:id',
      'POST:/api/v1/my/oauth-apps/:id/client-secrets',
      'DELETE:/api/v1/my/oauth-grants/:id',
      'PUT:/api/v1/admin/oauth-clients/:id/verification',
      'DELETE:/api/v1/admin/oauth-clients/:id/verification',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('sensitive')
    }
  })

  it('classifies membership purchase and verification mutations as sensitive', () => {
    const routes = [
      'POST:/api/v1/membership-purchase-intents',
      'POST:/api/v1/membership-verifications',
      'POST:/api/v1/memberships/microsoft-store/service-tickets',
      'POST:/api/v1/memberships/billing-portal-sessions',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('sensitive')
    }
  })

  it('classifies read-only own-state status endpoints as read', () => {
    const routes = [
      'GET:/api/v1/auth/me',
      'GET:/api/v1/auth/mfa/status',
      'GET:/api/v1/auth/passkeys',
      'GET:/api/v1/auth/sessions',
      'GET:/api/v1/auth/totp',
      'GET:/api/v1/my/identity-verification',
    ]

    for (const route of routes) {
      expect(getRouteConfig(route).category).toBe('read')
    }
  })

  it('classifies topic-claim domain verification as sensitive', () => {
    expect(
      getRouteConfig('POST:/api/v1/topics/:idOrSlug/claims/:claimId/domain-verification').category,
    ).toBe('sensitive')
  })
})
