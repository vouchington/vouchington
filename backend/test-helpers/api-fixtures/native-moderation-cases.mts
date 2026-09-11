import { nativeModerationAppealApiFixtureCases } from './native-moderation-appeal-cases.mts'
import { nativeModerationDisputeApiFixtureCases } from './native-moderation-dispute-cases.mts'
import { nativeModerationExposureApiFixtureCases } from './native-moderation-exposure-cases.mts'
import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'
import { nativeIntegrityPenaltyApiFixtureCases } from './native-integrity-penalty-cases.mts'
import { nativeIntegrityFlagApiFixtureCases } from './native-integrity-flag-cases.mts'
import { nativeModerationReportApiFixtureCases } from './native-moderation-report-cases.mts'
import { nativeModerationReviewQueueApiFixtureCases } from './native-moderation-review-queue-cases.mts'
import { nativeModerationMemberNoticeApiFixtureCases } from './native-moderation-member-notice-cases.mts'
import { nativeModerationTransparencyApiFixtureCases } from './native-moderation-transparency-cases.mts'

export const nativeModerationFlatReportId = '019f6559-6b31-7171-b5b1-ccd9d702c45e'
export const nativeModerationMemberOwnerId = '00000000-0000-7000-8700-000000000101'

const paginationReportApiFixtureCases = nativeModerationReportApiFixtureCases.flatMap(fixture => {
  if (fixture.id === 'native.moderation.reports.member.default') {
    return [
      {
        ...fixture,
        body: {
          results: [
            {
              id: nativeModerationFlatReportId,
              case_id: 'case-1',
              created_at: '2026-06-01T12:00:00.000Z',
              reviewed_at: null,
              entity_type: 'post',
              entity_id: 'post-1',
              reason: 'spam',
              status: 'pending',
              report_count: 3,
              target_available: true,
              target_label: 'Native post',
              target_content: {
                kind: 'post',
                text: 'Native post',
                declared_language: null,
                lingua_rs_detected_language: null,
              },
              target_path: '/review/native-post',
              post_moderation_context: null,
            },
          ],
          page_info: {
            has_next_page: false,
            has_previous_page: false,
            start_cursor: Buffer.from(
              JSON.stringify({
                cluster: false,
                id: nativeModerationFlatReportId,
                sort: 'created_at_desc',
                status: 'pending',
                scope: JSON.stringify({
                  audience: 'member',
                  ownerId: nativeModerationMemberOwnerId,
                }),
              }),
            ).toString('base64url'),
            end_cursor: null,
          },
        },
      },
    ]
  }
  if (fixture.id === 'native.moderation.report-judgement.default') {
    return [
      {
        ...fixture,
        path: `/api/v1/reports/${nativeModerationFlatReportId}/judgements`,
        route: {
          routeTemplate: '/api/v1/reports/:reportId/judgements',
          pathParams: { reportId: nativeModerationFlatReportId },
        },
      },
    ]
  }
  if (fixture.id === 'native.moderation.report-resolution.reviewed') {
    const body = fixture.body as { report: Record<string, unknown> }
    return [
      {
        ...fixture,
        path: `/api/v1/reports/${nativeModerationFlatReportId}`,
        route: {
          routeTemplate: '/api/v1/reports/:id',
          pathParams: { id: nativeModerationFlatReportId },
        },
        body: { report: { ...body.report, id: nativeModerationFlatReportId } },
      },
    ]
  }
  if (fixture.id === 'native.moderation.admin-warning.report') {
    const requestBody = fixture.requestBody as Record<string, unknown>
    const body = fixture.body as { warning: Record<string, unknown> }
    return [
      {
        ...fixture,
        requestBody: { ...requestBody, reportId: nativeModerationFlatReportId },
        body: { warning: { ...body.warning, report_id: nativeModerationFlatReportId } },
      },
    ]
  }
  if (fixture.id !== 'native.moderation.reports.clustered.default') return [fixture]
  return [
    { ...fixture, query: { cluster: 'entity', limit: '4', status: 'pending' } },
    fixtureCase({
      id: 'native.moderation.reports.clustered.page-2',
      backendResponseContractKey: 'GET:/api/v1/reports#clustered',
      method: 'GET',
      path: '/api/v1/reports',
      query: {
        after:
          'eyJjbHVzdGVyIjp0cnVlLCJjcmVhdGVkX2F0IjoiMjAyNi0wNi0wMVQxMjowNTowMC4wMDAwMDBaIiwiZW50aXR5X3R5cGUiOiJwb3N0IiwiaWQiOiIwMDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDAxMDMiLCJzb3J0IjoiY3JlYXRlZF9hdF9kZXNjIiwic3RhdHVzIjoicGVuZGluZyIsInNjb3BlIjoie1wiYXVkaWVuY2VcIjpcInN0YWZmXCIsXCJvd25lcklkXCI6bnVsbH0ifQ',
        cluster: 'entity',
        limit: '3',
        status: 'pending',
      },
      route: { routeTemplate: '/api/v1/reports' },
      migratedFrom: ['backend/api/v1/reports/reports.mts'],
    }),
  ]
})

export { reviewQueueFixture } from './native-moderation-review-queue-cases.mts'

export const nativeModerationApiFixtureCases = [
  ...paginationReportApiFixtureCases,
  ...nativeModerationAppealApiFixtureCases,
  ...nativeModerationDisputeApiFixtureCases,
  ...nativeModerationReviewQueueApiFixtureCases,
  ...nativeModerationExposureApiFixtureCases,
  ...nativeModerationMemberNoticeApiFixtureCases,
  fixtureCase({
    id: 'native.moderation.modlog.default',
    method: 'GET',
    path: '/api/v1/admin/modlog',
    route: { routeTemplate: '/api/v1/admin/modlog' },
    migratedFrom: ['backend/api/v1/admin/modlog.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.analytics.default',
    method: 'GET',
    path: '/api/v1/admin/moderation-analytics',
    query: { range: '30d' },
    route: { routeTemplate: '/api/v1/admin/moderation-analytics' },
    migratedFrom: ['backend/api/v1/admin/moderation-analytics/moderation-analytics.mts'],
  }),
  ...nativeModerationTransparencyApiFixtureCases,
  ...nativeIntegrityFlagApiFixtureCases,
  ...nativeIntegrityPenaltyApiFixtureCases,
]
