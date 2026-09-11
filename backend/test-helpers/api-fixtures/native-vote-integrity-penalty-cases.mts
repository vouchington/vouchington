import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'
import {
  adminId,
  penaltyCursor,
  revokedAt,
  terminalPage,
  voteActivePenalty,
  votePenaltyId,
  voteRetainedPenalty,
  voteRetainedPenaltyId,
  voteRevokedPenalty,
  voteSecondPenaltyId,
} from './native-integrity-penalty-data.mts'

const route = { routeTemplate: '/api/v1/vote-integrity/penalties' }
const filterScope = { source: 'flag', source_flag_id: null }
const migratedFrom = ['backend/api/v1/vote-integrity/penalties.mts']

export const nativeVoteIntegrityPenaltyApiFixtureCases = [
  fixtureCase({
    id: 'native.moderation.vote-integrity.penalties.default',
    method: 'GET',
    path: '/api/v1/vote-integrity/penalties',
    query: { source: 'flag' },
    route,
    body: {
      results: [voteRetainedPenalty, voteRevokedPenalty, voteActivePenalty],
      page_info: terminalPage(penaltyCursor('vote-weight-penalties', 'all', voteRetainedPenaltyId)),
      filter_scope: filterScope,
    },
    migratedFrom,
  }),
  fixtureCase({
    id: 'native.moderation.vote-integrity.penalties.active',
    method: 'GET',
    path: '/api/v1/vote-integrity/penalties',
    query: { status: 'active', source: 'flag' },
    route,
    body: {
      results: [voteRetainedPenalty, voteActivePenalty],
      page_info: terminalPage(
        penaltyCursor('vote-weight-penalties', 'active', voteRetainedPenaltyId),
      ),
      filter_scope: filterScope,
    },
    migratedFrom,
  }),
  fixtureCase({
    id: 'native.moderation.vote-integrity.penalties.revoked',
    method: 'GET',
    path: '/api/v1/vote-integrity/penalties',
    query: { status: 'revoked', source: 'flag' },
    route,
    body: {
      results: [voteRevokedPenalty],
      page_info: terminalPage(
        penaltyCursor('vote-weight-penalties', 'revoked', voteSecondPenaltyId),
      ),
      filter_scope: filterScope,
    },
    migratedFrom,
  }),
  fixtureCase({
    id: 'native.moderation.vote-integrity.penalties.all',
    method: 'GET',
    path: '/api/v1/vote-integrity/penalties',
    query: { source: 'flag' },
    route,
    body: {
      results: [voteRetainedPenalty, voteRevokedPenalty, voteActivePenalty],
      page_info: terminalPage(penaltyCursor('vote-weight-penalties', 'all', voteRetainedPenaltyId)),
      filter_scope: filterScope,
    },
    migratedFrom,
  }),
  fixtureCase({
    id: 'native.moderation.vote-integrity.penalties.page-2',
    method: 'GET',
    path: '/api/v1/vote-integrity/penalties',
    query: {
      status: 'active',
      source: 'flag',
      after: penaltyCursor('vote-weight-penalties', 'active', voteRetainedPenaltyId),
    },
    route,
    body: {
      results: [voteActivePenalty],
      page_info: terminalPage(penaltyCursor('vote-weight-penalties', 'active', votePenaltyId)),
      filter_scope: filterScope,
    },
    migratedFrom,
  }),
  fixtureCase({
    id: 'native.moderation.vote-integrity.penalties.get',
    method: 'GET',
    path: `/api/v1/vote-integrity/penalties/${votePenaltyId}`,
    route: {
      routeTemplate: '/api/v1/vote-integrity/penalties/:id',
      pathParams: { id: votePenaltyId },
    },
    body: { penalty: voteActivePenalty },
    migratedFrom,
  }),
  fixtureCase({
    id: 'native.moderation.vote-integrity.penalties.revoke',
    method: 'DELETE',
    path: `/api/v1/vote-integrity/penalties/${votePenaltyId}`,
    route: {
      routeTemplate: '/api/v1/vote-integrity/penalties/:id',
      pathParams: { id: votePenaltyId },
    },
    body: { penalty: { ...voteActivePenalty, revoked_at: revokedAt, revoked_by_id: adminId } },
    migratedFrom,
  }),
]
