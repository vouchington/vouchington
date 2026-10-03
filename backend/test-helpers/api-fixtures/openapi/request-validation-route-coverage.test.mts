import { beforeAll, describe, expect, it } from 'vitest'

import type { OpenApiDocument } from 'vouchington-tooling/openapi-document'
import { COLD_OPENAPI_BUILD_TIMEOUT_MS } from '../cold-build-budget.mts'
import { buildOpenApiDocument } from './build-openapi-document.mts'
import { buildRequestContractsBundle } from './request-contract-bundle.mts'
import {
  discoverRuntimeValidatedOperations,
  discoverThirdPartyRoutes,
  routeKey,
} from './request-validation-route-coverage.mts'
import { discoverSourceInputOperations } from './request-validation-route-input.mts'

const SPECIALIZED_INGRESS = {
  'POST:/api/v1/mcp': {
    parser: 'MCP SDK JSON-RPC transport',
    evidence: 'backend/api/v1/mcp/mcp.test.mts',
    proof: 'does not disclose malformed MCP schemas before API-key authentication',
  },
  'POST:/api/v1/admin/mcp': {
    parser: 'MCP SDK JSON-RPC transport after admin OAuth admission',
    evidence: 'backend/api/v1/admin/mcp.request-boundary.test.mts',
    proof: 'answers authenticated malformed JSON with the body reader 400',
  },
  'POST:/api/v1/memberships/apple-app-store/notifications': {
    parser: 'Apple signed JWS verifier and notification decoder',
    evidence: 'backend/api/v1/memberships/__tests__/apple-notifications.test.mts',
    proof: 'rejects malformed and oversized bodies without a schema diagnostic',
  },
  'POST:/api/v1/memberships/google-play/notifications': {
    parser: 'Google Pub/Sub OIDC verifier and RTDN envelope decoder',
    evidence: 'backend/api/v1/memberships/__tests__/google-play-notifications.test.mts',
    proof: 'answers an oversized envelope with the specialized 401',
  },
  'POST:/api/v1/email-unsubscribe': {
    parser: 'signed unsubscribe token parser from query or JSON body',
    evidence: 'backend/api/v1/my/__tests__/email-preferences.test.mts',
    proof: 'rejects an invalid unsubscribe token without login',
  },
  'GET:/api/v1/auth/oauth/:provider/broker-callback': {
    parser: 'OAuth provider, state, and callback result verifier',
    evidence: 'backend/api/v1/sessions-authentication/__tests__/auth-oauth-broker.test.mts',
    proof: 'relays web and native callbacks through their dedicated handoffs',
  },
  'GET:/api/v1/auth/bluesky/callback': {
    parser:
      'AT Protocol code/state verifier (peekBlueskyAccountLinkAppState / completeBlueskyAccountLink)',
    evidence:
      'backend/api/v1/sessions-authentication/__tests__/auth-bluesky-invalid-state.test.mts',
    proof: 'invalid saved app state',
  },
} as const

// A newly added route with no validator must be reviewed and placed here only when its source and
// generated contract both prove it has no request input to validate.
const NO_INPUT_OPERATIONS: readonly string[] = [
  'DELETE:/api/v1/admin/mcp',
  'DELETE:/api/v1/auth/bluesky/link',
  'DELETE:/api/v1/mcp',
  'GET:/api/v1/admin/mcp',
  'GET:/api/v1/admin/postgresql/stream',
  'GET:/api/v1/admin/topic-claims',
  'GET:/api/v1/admin/valkey/stream',
  'GET:/api/v1/auth/me',
  'GET:/api/v1/auth/mfa/status',
  'GET:/api/v1/auth/oauth/providers',
  'GET:/api/v1/captcha-config',
  'GET:/api/v1/countries',
  'GET:/api/v1/dynamic-config/namespaces',
  'GET:/api/v1/feature-flags',
  'GET:/api/v1/mcp',
  'GET:/api/v1/me/individual',
  'GET:/api/v1/memberships/me',
  'GET:/api/v1/memberships/plans',
  'GET:/api/v1/moderation/exposure',
  'GET:/api/v1/mq/backfills',
  'GET:/api/v1/mq/queues',
  'GET:/api/v1/mq/scheduled-jobs',
  'GET:/api/v1/mq/stats',
  'GET:/api/v1/mq/stream',
  'GET:/api/v1/my/aside-preferences',
  'GET:/api/v1/my/consents',
  'GET:/api/v1/my/email-preferences',
  'GET:/api/v1/my/financial-profile',
  'GET:/api/v1/my/identity',
  'GET:/api/v1/my/identity-verification',
  'GET:/api/v1/my/identity-verification/session-url',
  'GET:/api/v1/my/landing-pages',
  'GET:/api/v1/my/landing-pages/candidates',
  'GET:/api/v1/my/notifications/unread',
  'GET:/api/v1/my/profile',
  'GET:/api/v1/my/profile/links',
  'GET:/api/v1/my/topic-claims',
  'GET:/api/v1/platform-stats',
  'GET:/api/v1/psql/migrations',
  'GET:/api/v1/psql/partitions',
  'GET:/api/v1/scopes',
  'GET:/api/v1/topics/publisher-types',
  'GET:/api/v1/topics/user-tags',
  'GET:/api/v1/valkey/cache-groups',
  'POST:/api/v1/article-syncs',
  'POST:/api/v1/auth/mfa/re-auth/email/tokens',
  'POST:/api/v1/auth/passkeys/authentication/options',
  'POST:/api/v1/auth/passkeys/registration/options',
  'POST:/api/v1/auth/sessions/revocations',
  'POST:/api/v1/blacklist/dispatch',
  'POST:/api/v1/copyright-media-delivery/replays',
  'POST:/api/v1/memberships/microsoft-store/service-tickets',
  'POST:/api/v1/my/identity-verification/checkout-sessions',
  'POST:/api/v1/my/notifications/read-all',
]

let document: OpenApiDocument
let runtimeValidated: Set<string>

describe('third-party route request validation inventory', () => {
  beforeAll(() => {
    document = buildOpenApiDocument()
    runtimeValidated = discoverRuntimeValidatedOperations()
  }, COLD_OPENAPI_BUILD_TIMEOUT_MS)

  it('classifies every registered REST and MCP route exactly once', () => {
    const routes = discoverThirdPartyRoutes()
    const keys = routes.map(routeKey)
    const noInput = new Set(NO_INPUT_OPERATIONS)
    const specialized = new Set(Object.keys(SPECIALIZED_INGRESS))
    expect(new Set(keys).size).toBe(keys.length)
    expect([...runtimeValidated].filter(key => !keys.includes(key))).toEqual([])
    expect(runtimeValidated).not.toContain('GET:/api/v1/auth/oauth/providers')
    expect([...specialized].filter(key => !keys.includes(key))).toEqual([])
    expect([...noInput].filter(key => !keys.includes(key))).toEqual([])
    expect([...runtimeValidated].filter(key => specialized.has(key) || noInput.has(key))).toEqual(
      [],
    )
    expect([...specialized].filter(key => noInput.has(key))).toEqual([])

    const unclassified = keys.filter(
      key => !runtimeValidated.has(key) && !specialized.has(key) && !noInput.has(key),
    )
    const sourceInputs = discoverSourceInputOperations()
    expect(sourceInputs).toContain('GET:/api/v1/localization')
    expect([...sourceInputs].filter(key => noInput.has(key))).toEqual([])
    expect(
      [...sourceInputs].filter(key => !runtimeValidated.has(key) && !specialized.has(key)),
    ).toEqual([])
    const bundle = buildRequestContractsBundle(document)
    expect({
      carrierless: unclassified.filter(key => !bundle.operations[key]),
      carrierBearing: unclassified.filter(key => bundle.operations[key]),
    }).toEqual({ carrierless: [], carrierBearing: [] })
    expect(keys.toSorted()).toEqual([...runtimeValidated, ...specialized, ...noInput].toSorted())
  })

  it('keeps no-input entries free of generated request carriers', () => {
    const bundle = buildRequestContractsBundle(document)
    for (const operation of NO_INPUT_OPERATIONS) {
      expect(bundle.operations[operation]).toBeUndefined()
    }
  })

  it('keeps the specialized parser exclusions tied to focused boundary tests', async () => {
    const { access, readFile } = await import('node:fs/promises')
    for (const exclusion of Object.values(SPECIALIZED_INGRESS)) {
      expect(exclusion.parser).not.toBe('')
      const evidenceUrl = new URL(`../../../../${exclusion.evidence}`, import.meta.url)
      await expect(access(evidenceUrl)).resolves.toBeUndefined()
      const evidence = await readFile(evidenceUrl, 'utf8')
      expect(evidence).toContain(exclusion.proof)
    }
  })
})
