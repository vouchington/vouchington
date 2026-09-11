import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'
import type { ApiFixtureCase } from './types.mts'

const consumers = ['web', 'swift-core', 'swift-ui', 'dotnet-core'] as ApiFixtureCase['consumers']

export const nativeModerationTransparencyApiFixtureCases = [
  {
    ...fixtureCase({
      id: 'native.moderation.transparency.default',
      method: 'GET',
      path: '/api/v1/moderation-transparency',
      query: { range: '30d' },
      route: { routeTemplate: '/api/v1/moderation-transparency' },
      auth: 'fixture-user',
      status: 200,
      body: {
        range: '30d',
        buckets: [
          { date: '2026-01-01', metric: 'reports', category: 'spam', count: 25 },
          { date: '2026-01-01', metric: 'appeals', category: 'accept', count: 25 },
          { date: '2026-01-01', metric: 'moderation_actions', category: 'remove', count: 25 },
          {
            date: '2026-01-01',
            metric: 'automated_moderation',
            category: 'community_ai',
            count: 25,
          },
        ],
      },
      migratedFrom: ['backend/api/v1/moderation-transparency.mts'],
    }),
    consumers,
  },
  {
    ...fixtureCase({
      id: 'native.community.moderation-transparency.default',
      method: 'GET',
      path: '/api/v1/communities/fixture-community/moderation-transparency',
      query: { range: '30d' },
      route: {
        routeTemplate: '/api/v1/communities/:idOrSlug/moderation-transparency',
        pathParams: { idOrSlug: 'fixture-community' },
      },
      auth: 'fixture-user',
      status: 200,
      body: {
        range: '30d',
        buckets: [
          {
            date: '2026-01-01',
            metric: 'automated_moderation',
            category: 'community_ai',
            count: 25,
          },
        ],
      },
      migratedFrom: ['backend/api/v1/communities/moderation-transparency.mts'],
    }),
    consumers,
  },
] satisfies readonly ApiFixtureCase[]
