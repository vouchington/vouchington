import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'

const reportId = '019f6559-6b31-7171-b5b1-ccd9d702c45e'
const appealId = '00000000-0000-7000-8000-000000000102'
const token = '00000000-0000-7000-8000-000000000303'
const appealRunId = `appeal_resolution_${token}`

export const nativeModerationRerunApiFixtureCases = [
  ...(['succeeded', 'failed', 'expired'] as const).map(status =>
    fixtureCase({
      id: `native.moderation.report-judgement-run.${status}`,
      backendResponseContractKey: 'GET:/api/v1/reports/:id/judgements/:runId',
      method: 'GET',
      path: `/api/v1/reports/${reportId}/judgements/${token}`,
      route: {
        routeTemplate: '/api/v1/reports/:id/judgements/:runId',
        pathParams: { id: reportId, runId: token },
      },
      body: {
        run_id: token,
        status,
        judgement_id: status === 'succeeded' ? '00000000-0000-7000-8000-000000000304' : null,
      },
      migratedFrom: ['backend/api/v1/reports/reports.mts'],
    }),
  ),
  ...(['active', 'succeeded', 'failed', 'expired'] as const).map(status =>
    fixtureCase({
      id: `native.moderation.appeals.resolution-draft-run.${status}`,
      backendResponseContractKey: 'GET:/api/v1/appeals/:id/resolution-drafts/:runId#staff',
      method: 'GET',
      path: `/api/v1/appeals/${appealId}/resolution-drafts/${appealRunId}`,
      route: {
        routeTemplate: '/api/v1/appeals/:id/resolution-drafts/:runId',
        pathParams: { id: appealId, runId: appealRunId },
      },
      body: {
        run_id: appealRunId,
        status,
        ai_drafted_at: status === 'succeeded' ? '2026-06-01T12:00:00.000Z' : null,
        latest_lifecycle_change_id:
          status === 'succeeded' ? '00000000-0000-7000-8000-000000000305' : null,
      },
      migratedFrom: ['backend/api/v1/appeals/appeals-staff.mts'],
    }),
  ),
]
