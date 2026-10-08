import { describe, expect, it, vi } from 'vitest'
import contracts from '../../api-fixtures/v1/request-contracts.json' with { type: 'json' }

// Other API tests can preload index.mts in this shared Vitest fork. Reload the graph so this
// inventory observes registration even when those tests ran first; no HTTP test-server import.
vi.resetModules()
const { default: app } = await import('./app.mts')
const registered = new Set<string>()
const originalRoute = app.route
app.route = path => {
  const builder = originalRoute.call(app, path)
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const originalMethod = builder[method]
    builder[method] = (...args: Parameters<typeof originalMethod>) => {
      registered.add(`${method.toUpperCase()}:${path}`)
      Reflect.apply(originalMethod, builder, args)
      return builder
    }
  }
  return builder
}
try {
  await import('./index.mts')
} finally {
  app.route = originalRoute
}

type ExemptionReason = 'no-input' | 'protocol-parser' | 'fixed-status'
// The audited cap of 56 was approved after the option-B stop condition in issue #298.
const EXEMPTIONS: Record<string, ExemptionReason> = {
  'DELETE:/api/v1/admin/mcp': 'fixed-status',
  'DELETE:/api/v1/auth/bluesky/link': 'no-input',
  'DELETE:/api/v1/mcp': 'fixed-status',
  'GET:/.well-known/nodeinfo': 'no-input',
  'GET:/.well-known/oauth-authorization-server': 'no-input',
  'GET:/.well-known/oauth-protected-resource/api/v1/admin/mcp': 'no-input',
  'GET:/.well-known/oauth-protected-resource/api/v1/mcp': 'no-input',
  'GET:/.well-known/webfinger': 'protocol-parser',
  'GET:/ap/users/:userId': 'protocol-parser',
  'GET:/api/v1/admin/mcp': 'fixed-status',
  'GET:/api/v1/admin/postgresql/stream': 'no-input',
  'GET:/api/v1/admin/topic-claims': 'no-input',
  'GET:/api/v1/admin/valkey/stream': 'no-input',
  'GET:/api/v1/auth/bluesky/callback': 'protocol-parser',
  'GET:/api/v1/auth/me': 'no-input',
  'GET:/api/v1/auth/mfa/status': 'no-input',
  'GET:/api/v1/auth/oauth/providers': 'no-input',
  'GET:/api/v1/captcha-config': 'no-input',
  'GET:/api/v1/copyright-jurisdiction-availability': 'no-input',
  'GET:/api/v1/countries': 'no-input',
  'GET:/api/v1/dynamic-config/namespaces': 'no-input',
  'GET:/api/v1/feature-flags': 'no-input',
  'GET:/api/v1/mcp': 'fixed-status',
  'GET:/api/v1/me/individual': 'no-input',
  'GET:/api/v1/memberships/me': 'no-input',
  'GET:/api/v1/memberships/plans': 'no-input',
  'GET:/api/v1/moderation/exposure': 'no-input',
  'GET:/api/v1/mq/backfills': 'no-input',
  'GET:/api/v1/mq/queues': 'no-input',
  'GET:/api/v1/mq/scheduled-jobs': 'no-input',
  'GET:/api/v1/mq/stats': 'no-input',
  'GET:/api/v1/mq/stream': 'no-input',
  'GET:/api/v1/my/aside-preferences': 'no-input',
  'GET:/api/v1/my/consents': 'no-input',
  'GET:/api/v1/my/email-preferences': 'no-input',
  'GET:/api/v1/my/financial-profile': 'no-input',
  'GET:/api/v1/my/identity': 'no-input',
  'GET:/api/v1/my/identity-verification': 'no-input',
  'GET:/api/v1/my/identity-verification/session-url': 'no-input',
  'GET:/api/v1/my/landing-pages': 'no-input',
  'GET:/api/v1/my/landing-pages/candidates': 'no-input',
  'GET:/api/v1/my/notifications/unread': 'no-input',
  'GET:/api/v1/my/profile': 'no-input',
  'GET:/api/v1/my/profile/links': 'no-input',
  'GET:/api/v1/my/topic-claims': 'no-input',
  'GET:/api/v1/platform-stats': 'no-input',
  'GET:/api/v1/psql/migrations': 'no-input',
  'GET:/api/v1/psql/partitions': 'no-input',
  'GET:/api/v1/scopes': 'no-input',
  'GET:/api/v1/topics/publisher-types': 'no-input',
  'GET:/api/v1/topics/user-tags': 'no-input',
  'GET:/api/v1/valkey/cache-groups': 'no-input',
  'GET:/authorize': 'protocol-parser',
  'GET:/client-metadata.json': 'no-input',
  'GET:/nodeinfo/2.0': 'no-input',
  'POST:/ap/inbox': 'protocol-parser',
  'POST:/api/v1/article-syncs': 'no-input',
  'POST:/api/v1/auth/mfa/re-auth/email/tokens': 'no-input',
  'POST:/api/v1/auth/passkeys/authentication/options': 'no-input',
  'POST:/api/v1/auth/passkeys/registration/options': 'no-input',
  'POST:/api/v1/auth/sessions/revocations': 'no-input',
  'POST:/api/v1/blacklist/dispatch': 'no-input',
  'POST:/api/v1/copyright-media-delivery/replays': 'no-input',
  'POST:/api/v1/memberships/microsoft-store/service-tickets': 'no-input',
  'POST:/api/v1/my/identity-verification/checkout-sessions': 'no-input',
  'POST:/api/v1/my/notifications/read-all': 'no-input',
  'POST:/register': 'protocol-parser',
  'POST:/revoke': 'protocol-parser',
  'POST:/token': 'protocol-parser',
}
const operations = new Set(Object.keys(contracts.operations))

describe('registered route request contracts', () => {
  it('covers every registered route exactly once with a contract or reasoned exemption', () => {
    const uncoveredOrDuplicated = [...registered].filter(
      key => operations.has(key) === Object.hasOwn(EXEMPTIONS, key),
    )
    expect(uncoveredOrDuplicated.toSorted()).toEqual([])
  })

  it('keeps every request and response contract attached to a registered route', () => {
    for (const entries of [contracts.operations, contracts.responses, contracts.adminResponses]) {
      expect(
        Object.keys(entries)
          .filter(key => !registered.has(key))
          .toSorted(),
      ).toEqual([])
    }
  })

  it('keeps every exemption attached to a registered route and caps API v1 exemptions', () => {
    expect(
      Object.keys(EXEMPTIONS)
        .filter(key => !registered.has(key))
        .toSorted(),
    ).toEqual([])
    expect(
      Object.keys(EXEMPTIONS).filter(key => key.split(':')[1]?.startsWith('/api/v1/')).length,
    ).toBeLessThanOrEqual(56)
  })
})
