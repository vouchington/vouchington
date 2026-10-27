import { nativeIntegrityPenaltyReviewPaginationCases } from './native-integrity-penalty-review-pagination-cases.mts'
import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'
import { nativeVoteIntegrityPenaltyApiFixtureCases } from './native-vote-integrity-penalty-cases.mts'
import {
  adminId,
  penaltyCursor,
  penaltyReviewCursor,
  reportActivePenalty,
  reportPenaltyId,
  reportRevokedPenalty,
  reportSecondPenaltyId,
  revokedAt,
  reviewedAt,
  nextReviewDueAt,
  terminalPage,
  userId,
} from './native-integrity-penalty-data.mts'
const reportPenaltyRoute = { routeTemplate: '/api/v1/report-integrity/penalties' }

export const nativeIntegrityPenaltyApiFixtureCases = [
  fixtureCase({
    id: 'native.moderation.report-integrity.penalties.default',
    method: 'GET',
    path: '/api/v1/report-integrity/penalties',
    route: reportPenaltyRoute,
    body: {
      results: [reportRevokedPenalty, reportActivePenalty],
      page_info: terminalPage(
        penaltyCursor('report-abuse-penalties', 'all', reportSecondPenaltyId),
      ),
    },
    migratedFrom: ['backend/api/v1/report-integrity/penalties.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.report-integrity.penalties.active',
    method: 'GET',
    path: '/api/v1/report-integrity/penalties',
    query: { status: 'active' },
    route: reportPenaltyRoute,
    body: {
      results: [reportActivePenalty],
      page_info: terminalPage(penaltyCursor('report-abuse-penalties', 'active', reportPenaltyId)),
    },
    migratedFrom: ['backend/api/v1/report-integrity/penalties.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.report-integrity.penalties.revoked',
    method: 'GET',
    path: '/api/v1/report-integrity/penalties',
    query: { status: 'revoked' },
    route: reportPenaltyRoute,
    body: {
      results: [reportRevokedPenalty],
      page_info: terminalPage(
        penaltyCursor('report-abuse-penalties', 'revoked', reportSecondPenaltyId),
      ),
    },
    migratedFrom: ['backend/api/v1/report-integrity/penalties.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.report-integrity.penalties.all',
    method: 'GET',
    path: '/api/v1/report-integrity/penalties',
    route: reportPenaltyRoute,
    body: {
      results: [reportRevokedPenalty, reportActivePenalty],
      page_info: terminalPage(
        penaltyCursor('report-abuse-penalties', 'all', reportSecondPenaltyId),
      ),
    },
    migratedFrom: ['backend/api/v1/report-integrity/penalties.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.report-integrity.penalties.page-2',
    method: 'GET',
    path: '/api/v1/report-integrity/penalties',
    query: {
      status: 'active',
      after: penaltyCursor('report-abuse-penalties', 'active', reportSecondPenaltyId),
    },
    route: reportPenaltyRoute,
    body: {
      results: [reportActivePenalty],
      page_info: terminalPage(penaltyCursor('report-abuse-penalties', 'active', reportPenaltyId)),
    },
    migratedFrom: ['backend/api/v1/report-integrity/penalties.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.report-integrity.penalties.get',
    method: 'GET',
    path: `/api/v1/report-integrity/penalties/${reportPenaltyId}`,
    route: {
      routeTemplate: '/api/v1/report-integrity/penalties/:id',
      pathParams: { id: reportPenaltyId },
    },
    body: { penalty: reportActivePenalty },
    migratedFrom: ['backend/api/v1/report-integrity/penalties.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.report-integrity.penalties.revoke',
    method: 'DELETE',
    path: `/api/v1/report-integrity/penalties/${reportPenaltyId}`,
    route: {
      routeTemplate: '/api/v1/report-integrity/penalties/:id',
      pathParams: { id: reportPenaltyId },
    },
    body: {
      penalty: {
        ...reportActivePenalty,
        revoked_at: revokedAt,
        revoked_by_id: adminId,
        updated_at: revokedAt,
      },
      penaltyId: reportPenaltyId,
      userId,
    },
    migratedFrom: ['backend/api/v1/report-integrity/penalties.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.report-integrity.penalties.review-due',
    method: 'GET',
    path: '/api/v1/report-integrity/penalties/review-due',
    route: { routeTemplate: '/api/v1/report-integrity/penalties/review-due' },
    body: {
      results: [{ ...reportActivePenalty, user_username: 'penalty-recipient' }],
      page_info: terminalPage(penaltyReviewCursor('report', reportPenaltyId)),
    },
    migratedFrom: ['backend/api/v1/report-integrity/penalties.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.report-integrity.penalties.review',
    method: 'POST',
    path: `/api/v1/report-integrity/penalties/${reportPenaltyId}/reviews`,
    route: {
      routeTemplate: '/api/v1/report-integrity/penalties/:id/reviews',
      pathParams: { id: reportPenaltyId },
    },
    body: {
      penalty: {
        ...reportActivePenalty,
        reviewed_at: reviewedAt,
        reviewed_by_id: adminId,
        review_due_at: nextReviewDueAt,
        updated_at: reviewedAt,
      },
    },
    migratedFrom: ['backend/api/v1/report-integrity/penalties.mts'],
  }),
  ...nativeVoteIntegrityPenaltyApiFixtureCases,
  ...nativeIntegrityPenaltyReviewPaginationCases,
]
