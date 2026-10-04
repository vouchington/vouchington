import type { ApiFixtureCase } from './types.mts'

export const webCopyrightEuApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.copyright.eu.jurisdiction-availability',
    method: 'GET',
    path: '/api/v1/copyright-jurisdiction-availability',
    route: { routeTemplate: '/api/v1/copyright-jurisdiction-availability' },
    auth: 'none',
    status: 200,
    body: { copyright_jurisdiction_availability: { eu_dsa: false, uk: false } },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/index.mts',
      'web/lib/api/server/copyright-notices.ts',
    ],
  },
]
