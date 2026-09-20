import type { RouteRateLimitEntry } from './types.mts'

/**
 * Static route registry: maps `METHOD:/path` → rate limit config.
 * Provides deploy-time defaults per endpoint.
 *
 * Categories:
 * - read: GET/HEAD endpoints (default for GET/HEAD)
 * - write: POST/PUT/PATCH/DELETE (default for mutating methods)
 * - sensitive: billing, auth, account operations (explicit only)
 *
 * multiplier: scales the category threshold up/down (e.g. 0.5 = half rate)
 */
export const ROUTE_REGISTRY: Record<string, RouteRateLimitEntry> = {
  // OAuth authorization server — public protocol operations and authenticated consent.
  'GET:/authorize': { category: 'sensitive' },
  'POST:/register': { category: 'sensitive' },
  'POST:/token': { category: 'sensitive' },
  'POST:/revoke': { category: 'sensitive' },
  'GET:/api/v1/oauth/authorization-requests/:id': { category: 'sensitive' },
  'POST:/api/v1/oauth/authorization-requests/:id/decisions': { category: 'sensitive' },
  // Auth & sessions — sensitive: low threshold, high-risk operations
  'POST:/api/v1/auth/email-address/tokens': { category: 'sensitive' },
  'POST:/api/v1/auth/email-address/login': { category: 'sensitive', multiplier: 2 },
  'POST:/api/v1/auth/mfa/totp/verification': { category: 'sensitive' },
  'POST:/api/v1/auth/mfa/passkeys/authentication/options': { category: 'sensitive' },
  'POST:/api/v1/auth/mfa/passkeys/authentication/verification': { category: 'sensitive' },
  'POST:/api/v1/auth/mfa/re-auth/email/tokens': { category: 'sensitive' },
  'POST:/api/v1/auth/mfa/re-auth/email/verification': { category: 'sensitive' },
  'POST:/api/v1/auth/mfa/re-auth/totp/verification': { category: 'sensitive' },
  'POST:/api/v1/auth/mfa/re-auth/tokens/verification': { category: 'sensitive' },
  'GET:/api/v1/auth/sessions': { category: 'read' },
  'DELETE:/api/v1/auth/sessions/:id': { category: 'sensitive' },
  'POST:/api/v1/auth/sessions/revocations': { category: 'sensitive' },
  'POST:/api/v1/auth/passkeys/authentication/options': { category: 'sensitive' },
  'POST:/api/v1/auth/passkeys/authentication/verify': { category: 'sensitive' },
  'POST:/api/v1/auth/passkeys/registration/options': { category: 'sensitive' },
  'POST:/api/v1/auth/passkeys/registration/verify': { category: 'sensitive' },
  // App Attest — sensitive: anonymous device-scoped cryptographic ceremonies
  'POST:/api/v1/app-attestation/challenge': { category: 'sensitive' },
  'POST:/api/v1/app-attestation/attest': { category: 'sensitive' },
  // Auth read-only status — fetched on every page render; use read threshold (180/min), not sensitive
  'GET:/api/v1/auth/mfa/status': { category: 'read' },
  'GET:/api/v1/auth/passkeys': { category: 'read' },
  'PATCH:/api/v1/auth/passkeys/:id': { category: 'sensitive' },
  'DELETE:/api/v1/auth/passkeys/:id': { category: 'sensitive' },
  'POST:/api/v1/auth/totp': { category: 'sensitive' },
  'POST:/api/v1/auth/totp/setup/verification': { category: 'sensitive' },
  'GET:/api/v1/auth/totp': { category: 'read' },
  'PATCH:/api/v1/auth/totp/:id': { category: 'sensitive' },
  'DELETE:/api/v1/auth/totp/:id': { category: 'sensitive' },
  'GET:/api/v1/auth/me': { category: 'read' },
  'GET:/api/v1/auth/oauth/providers': { category: 'read' },
  'POST:/api/v1/auth/oauth/:provider/authorizations': { category: 'sensitive' },
  'GET:/api/v1/auth/oauth/:provider/broker-callback': { category: 'oauth_callback' },
  'POST:/api/v1/auth/oauth/authorizations/:flowId/complete': { category: 'read' },
  'PUT:/api/v1/auth/oauth/:provider/connect': { category: 'sensitive' },
  'DELETE:/api/v1/auth/oauth/:provider/connect': { category: 'sensitive' },
  'POST:/api/v1/auth/oauth/:provider/continue': { category: 'sensitive' },
  'POST:/api/v1/auth/bluesky/link': { category: 'sensitive' },
  'POST:/api/v1/auth/bluesky/link-completions': { category: 'sensitive' },
  'DELETE:/api/v1/auth/bluesky/link': { category: 'sensitive' },
  // Anonymous cross-origin redirect target from Bluesky's authorization server — sensitive despite
  // being a GET, since it exchanges a one-time authorization code (see auth-bluesky.mts).
  'GET:/api/v1/auth/bluesky/callback': { category: 'sensitive' },
  // Session — read: called on every page load by Next.js to refresh session state
  'PATCH:/api/v1/session': { category: 'read' },
  'DELETE:/api/v1/session': { category: 'write' },

  // Memberships — sensitive: purchase, verification, and billing-management operations
  'POST:/api/v1/membership-purchase-intents': { category: 'sensitive' },
  'POST:/api/v1/membership-verifications': { category: 'sensitive' },
  'POST:/api/v1/memberships/microsoft-store/service-tickets': { category: 'sensitive' },
  'POST:/api/v1/memberships/billing-portal-sessions': { category: 'sensitive' },

  // Identity verification — status read is read-only (fetched on render); billing/Stripe ops stay sensitive
  'GET:/api/v1/my/identity-verification': { category: 'read' },
  'GET:/api/v1/my/identity-verification/session-url': { category: 'sensitive' },
  'POST:/api/v1/my/identity-verification/checkout-sessions': { category: 'sensitive' },
  'PATCH:/api/v1/my/identity-verification/display-preferences': { category: 'sensitive' },

  // Account/identity management — sensitive: destructive/auth operations
  'DELETE:/api/v1/users/:idOrSlug': { category: 'sensitive' },
  'POST:/api/v1/my/email-addresses': { category: 'sensitive' },
  'POST:/api/v1/my/email-addresses/:email/verifications': { category: 'sensitive' },
  'PATCH:/api/v1/my/email-addresses/:email': { category: 'sensitive' },
  'DELETE:/api/v1/my/email-addresses/:email': { category: 'sensitive' },
  'POST:/api/v1/my/api-keys': { category: 'sensitive' },
  'DELETE:/api/v1/my/api-keys/:id': { category: 'sensitive' },
  'POST:/api/v1/email-unsubscribe': { category: 'write', multiplier: 1000 },
  'POST:/api/v1/crm/unsubscribe': { category: 'write', multiplier: 1000 },

  // Write operations with lower multiplier (vote-like actions)
  'PUT:/api/v1/entity-relations/:id/vote': { category: 'write', multiplier: 0.5 },
  'PUT:/api/v1/hostnames/:id/vote': { category: 'write', multiplier: 0.5 },
  'PUT:/api/v1/topics/:id/vote': { category: 'write', multiplier: 0.5 },
  'PUT:/api/v1/posts/:id/vote': { category: 'write', multiplier: 0.5 },
  'PUT:/api/v1/rss-feed-items/:id/vote': { category: 'write', multiplier: 0.5 },
  'PUT:/api/v1/agent-moderations/:id/vote': { category: 'write', multiplier: 0.5 },
  'PUT:/api/v1/users/:id/vouch-vote': { category: 'write', multiplier: 0.5 },
  'DELETE:/api/v1/entity-relations/:id/vote': { category: 'write', multiplier: 0.5 },
  'DELETE:/api/v1/hostnames/:id/vote': { category: 'write', multiplier: 0.5 },
  'DELETE:/api/v1/topics/:id/vote': { category: 'write', multiplier: 0.5 },
  'DELETE:/api/v1/posts/:id/vote': { category: 'write', multiplier: 0.5 },
  'DELETE:/api/v1/rss-feed-items/:id/vote': { category: 'write', multiplier: 0.5 },
  'DELETE:/api/v1/agent-moderations/:id/vote': { category: 'write', multiplier: 0.5 },
  'DELETE:/api/v1/users/:id/vouch-vote': { category: 'write', multiplier: 0.5 },

  // Moderation reports — sensitive: rate-limit submissions to 10/hour per tier3 user
  'POST:/api/v1/reports': { category: 'sensitive', ttlSeconds: 3600 },
  'GET:/api/v1/reports': { category: 'read' },
  'PATCH:/api/v1/reports/:id': { category: 'write' },
  'GET:/api/v1/communities/:idOrSlug/reports/pending': { category: 'read' },
  'PATCH:/api/v1/communities/:idOrSlug/reports/:reportId': { category: 'write' },
  // Copyright intake — sensitive: legal submissions are CAPTCHA-protected and deliberately scarce
  'POST:/api/v1/copyright-notices': { category: 'sensitive', ttlSeconds: 3600 },
  'POST:/api/v1/copyright-notices/:id/appeals': { category: 'sensitive', ttlSeconds: 3600 },
  'POST:/api/v1/copyright-notices/:id/counter-notices': {
    category: 'sensitive',
    ttlSeconds: 3600,
  },
  'POST:/api/v1/copyright-email-intakes/:id/approvals': { category: 'sensitive' },
  'POST:/api/v1/copyright-email-intakes/:id/rejections': { category: 'sensitive' },
  'POST:/api/v1/copyright-form-intakes/:id/reviews': { category: 'sensitive' },
  'GET:/api/v1/admin/moderation-analytics': { category: 'read' },
  'GET:/api/v1/communities/:idOrSlug/moderation-analytics': { category: 'read' },
  'PATCH:/api/v1/communities/:idOrSlug/post-type-settings': { category: 'write' },
  'GET:/api/v1/communities/:idOrSlug/restrictions': { category: 'read' },
  'POST:/api/v1/communities/:idOrSlug/restrictions': { category: 'write' },
  'DELETE:/api/v1/communities/:idOrSlug/restrictions/:id': { category: 'write' },

  // MCP — write (stateless Streamable HTTP, higher cost per request)
  'POST:/api/v1/mcp': { category: 'write', multiplier: 4 },
  'POST:/api/v1/admin/mcp': { category: 'write', multiplier: 4 },

  // Content creation — write (default)
  'POST:/api/v1/posts': { category: 'write' },
  'POST:/api/v1/topics': { category: 'write' },
  'POST:/api/v1/rss-feeds': { category: 'write' },
  'POST:/api/v1/communities': { category: 'write' },
}
