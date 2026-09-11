import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'

const voteFlagId = 'vote-flag-1'
const reportFlagId = 'report-flag-1'

export const nativeIntegrityFlagApiFixtureCases = [
  ...(['default', 'pending', 'resolved'] as const).map(status =>
    fixtureCase({
      id: `native.moderation.vote-integrity.${status}`,
      method: 'GET',
      path: '/api/v1/vote-integrity/flags',
      ...(status === 'default' ? {} : { query: { status } }),
      route: { routeTemplate: '/api/v1/vote-integrity/flags' },
      migratedFrom: ['backend/api/v1/vote-integrity/flags.mts'],
    }),
  ),
  ...(['dismissed', 'penalized', 'suspended'] as const).map(resolution =>
    fixtureCase({
      id: `native.moderation.vote-integrity.resolution.${resolution}`,
      method: 'PATCH',
      path: `/api/v1/vote-integrity/flags/${voteFlagId}`,
      requestBody: { resolution },
      route: {
        routeTemplate: '/api/v1/vote-integrity/flags/:id',
        pathParams: { id: voteFlagId },
      },
      migratedFrom: ['backend/api/v1/vote-integrity/flags.mts'],
    }),
  ),
  fixtureCase({
    id: 'native.moderation.vote-integrity.penalty',
    method: 'POST',
    path: `/api/v1/vote-integrity/flags/${voteFlagId}/penalties`,
    route: {
      routeTemplate: '/api/v1/vote-integrity/flags/:id/penalties',
      pathParams: { id: voteFlagId },
    },
    migratedFrom: ['backend/api/v1/vote-integrity/flags.mts'],
  }),
  ...(['default', 'pending', 'resolved'] as const).map(status =>
    fixtureCase({
      id: `native.moderation.report-integrity.${status}`,
      method: 'GET',
      path: '/api/v1/report-integrity/flags',
      ...(status === 'default' ? {} : { query: { status } }),
      route: { routeTemplate: '/api/v1/report-integrity/flags' },
      migratedFrom: ['backend/api/v1/report-integrity/flags.mts'],
    }),
  ),
  fixtureCase({
    id: 'native.moderation.report-integrity.resolution.dismissed',
    method: 'PATCH',
    path: `/api/v1/report-integrity/flags/${reportFlagId}`,
    requestBody: { resolution: 'dismissed' },
    route: {
      routeTemplate: '/api/v1/report-integrity/flags/:id',
      pathParams: { id: reportFlagId },
    },
    migratedFrom: ['backend/api/v1/report-integrity/flags.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.report-integrity.penalty',
    method: 'POST',
    path: `/api/v1/report-integrity/flags/${reportFlagId}/penalties`,
    route: {
      routeTemplate: '/api/v1/report-integrity/flags/:id/penalties',
      pathParams: { id: reportFlagId },
    },
    status: 201,
    migratedFrom: ['backend/api/v1/report-integrity/flags.mts'],
  }),
]
