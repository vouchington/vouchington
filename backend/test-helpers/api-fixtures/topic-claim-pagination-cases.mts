import type { ApiFixtureCase } from './types.mts'

const claim = {
  id: '00000000-0000-7000-8000-000000000401',
  topic_id: '00000000-0000-7000-8000-000000000301',
  topic_name: 'Example topic',
  claimant_user_id: '00000000-0000-7000-8000-000000000001',
  claimant_username: 'claimant',
  claimant_display_name: null,
  verification_method: null,
  claimed_role: 'Issuer',
  evidence: 'Public registry entry',
  submitted_at: null,
  verified_at: null,
  verified_by_id: null,
  rejected_at: null,
  rejected_by_id: null,
  rejection_reason: null,
  revoked_at: null,
  revoked_by_id: null,
  revocation_reason: null,
  verification_hostname_id: null,
  verification_token_issued_at: null,
  domain_verified_at: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  state: 'pending',
}

const body = {
  results: [claim],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}
const { state: _state, ...claimFields } = claim
const adminClaim = { ...claimFields, submitted_at: '2026-07-01T00:00:00Z' }
const nativeClaimConsumers = ['swift-core', 'swift-ui', 'dotnet-core'] as const

export const topicClaimPaginationApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.my-topic-claims.page',
    method: 'GET',
    path: '/api/v1/my/topic-claims',
    route: { routeTemplate: '/api/v1/my/topic-claims' },
    query: { limit: '1' },
    auth: 'fixture-user',
    status: 200,
    body,
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['web/lib/api/server/topic-claims.ts'],
  },
  {
    id: 'native.topic-claims.page',
    method: 'GET',
    path: '/api/v1/topics/00000000-0000-7000-8000-000000000301/claims',
    route: {
      routeTemplate: '/api/v1/topics/:idOrSlug/claims',
      pathParams: { idOrSlug: claim.topic_id },
    },
    query: { limit: '1', mine_only: 'true', active_only: 'true' },
    auth: 'fixture-user',
    status: 200,
    body,
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['web/lib/api/server/topic-claims.ts'],
  },
  {
    id: 'native.moderation.topic-claims.pending',
    method: 'GET',
    path: '/api/v1/admin/topic-claims',
    route: { routeTemplate: '/api/v1/admin/topic-claims' },
    auth: 'fixture-admin',
    status: 200,
    body: { claims: [adminClaim] },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/admin/topic-claims.mts'],
  },
  ...(
    [
      {
        action: 'verification',
        requestBody: undefined,
        fields: {
          verification_method: 'manual_admin',
          verified_at: '2026-07-02T00:00:00Z',
          verified_by_id: '00000000-0000-7000-8000-000000000002',
          updated_at: '2026-07-02T00:00:00Z',
        },
      },
      {
        action: 'rejection',
        requestBody: { rejection_reason: 'Insufficient evidence' },
        fields: {
          rejected_at: '2026-07-02T00:00:00Z',
          rejected_by_id: '00000000-0000-7000-8000-000000000002',
          rejection_reason: 'Insufficient evidence',
          updated_at: '2026-07-02T00:00:00Z',
        },
      },
      {
        action: 'revocation',
        requestBody: { revocation_reason: 'Evidence withdrawn' },
        fields: {
          verification_method: 'manual_admin',
          verified_at: '2026-07-02T00:00:00Z',
          verified_by_id: '00000000-0000-7000-8000-000000000002',
          revoked_at: '2026-07-03T00:00:00Z',
          revoked_by_id: '00000000-0000-7000-8000-000000000002',
          revocation_reason: 'Evidence withdrawn',
          updated_at: '2026-07-03T00:00:00Z',
        },
      },
    ] as const
  ).map(({ action, requestBody, fields }) => ({
    id: `native.moderation.topic-claims.${action}`,
    method: 'POST' as const,
    path: `/api/v1/admin/topic-claims/${claim.id}/${action}`,
    route: {
      routeTemplate: `/api/v1/admin/topic-claims/:id/${action}`,
      pathParams: { id: claim.id },
    },
    ...(requestBody === undefined ? {} : { requestBody }),
    auth: 'fixture-admin' as const,
    status: 200,
    body: { claim: { ...adminClaim, ...fields } },
    consumers: [...nativeClaimConsumers],
    migratedFrom: ['backend/api/v1/admin/topic-claims.mts'],
  })),
]
