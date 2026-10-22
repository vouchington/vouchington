import type { ApiFixtureCase } from './types.mts'

const claim = {
  id: '00000000-0000-7000-8000-000000000401',
  topic_id: '00000000-0000-7000-8000-000000000301',
  claimant_user_id: '00000000-0000-7000-8000-000000000001',
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
]
