import { reviewedStaffCase } from './native-copyright-staff-form-review.mts'
import type { ApiFixtureCase } from './types.mts'

/** The staff queue names each submission's latest AI run so native clients can follow it to its end. */
export const nativeCopyrightAiRunApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.copyright.staff-queue.ai-run',
    pending: true,
    method: 'GET',
    path: '/api/v1/copyright-notices/review-queue',
    route: { routeTemplate: '/api/v1/copyright-notices/review-queue' },
    auth: 'fixture-admin',
    status: 200,
    body: {
      copyright_notices: [
        {
          ...reviewedStaffCase,
          legal_holds: [
            {
              submission_id: '00000000-0000-7000-8000-000000000860',
              received_at: '2026-07-01T11:30:00.000Z',
              statement: {},
              assessment: null,
              guidance: null,
              ai_run: { id: '00000000-0000-7000-8000-000000000861', status: 'active' },
            },
          ],
        },
      ],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    },
    consumers: ['swift-core', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/copyright-notices/staff-queue-route.mts'],
  },
]
