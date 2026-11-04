import type { ApiFixtureCase } from './types.mts'

const claimantUserId = '00000000-0000-7000-8000-000000000807'

export const claimantMisuseApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.copyright.claimant-misuse-summary.default',
    method: 'GET',
    path: `/api/v1/copyright-notices/claimants/${claimantUserId}/misuse-summary`,
    route: {
      routeTemplate: '/api/v1/copyright-notices/claimants/:claimantUserId/misuse-summary',
      pathParams: { claimantUserId },
    },
    auth: 'fixture-admin',
    status: 200,
    body: {
      claimant_misuse: {
        notice_withdrawn: 1,
        notice_rejected: 2,
        restriction_reversed_by_counter_notice: 0,
        restriction_reversed_by_appeal: 1,
        notice_count: 4,
        page_info: {
          has_next_page: false,
          start_cursor: null,
          end_cursor: null,
        },
      },
    },
    consumers: ['web'],
    migratedFrom: ['backend/api/v1/copyright-notices/claimant-misuse-summary-route.mts'],
  },
]
