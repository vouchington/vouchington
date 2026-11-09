import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'

export const nativeModerationReportDetailApiFixtureCases = (['saved', 'pending'] as const).map(
  state =>
    fixtureCase({
      id: `native.moderation.report-detail.${state}`,
      method: 'GET',
      path: '/api/v1/reports/019f6559-6b31-7171-b5b1-ccd9d702c45e',
      route: {
        routeTemplate: '/api/v1/reports/:id',
        pathParams: { id: '019f6559-6b31-7171-b5b1-ccd9d702c45e' },
      },
      body: {
        report: {
          id: '019f6559-6b31-7171-b5b1-ccd9d702c45e',
          case_id: '00000000-0000-7000-8000-000000000301',
          created_at: '2026-06-01T12:00:00.000Z',
          reviewed_at: null,
          reporter_user_id: '00000000-0000-7000-8000-000000000101',
          entity_type: 'post',
          entity_id: '00000000-0000-7000-8000-000000000201',
          reason: 'spam',
          note: null,
          status: 'pending',
          resolved_by_id: null,
        },
        judgement:
          state === 'pending'
            ? null
            : {
                id: '00000000-0000-7000-8000-000000000302',
                recommended_action: 'no_action',
                public_response: 'No policy violation found.',
                internal_response: 'Saved recommendation for staff review.',
              },
      },
      migratedFrom: ['backend/api/v1/reports/reports.mts'],
    }),
)
