import type { ApiFixtureCase } from './types.mts'

export const webRssFeedCategoryApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.rss-feed-categories.default',
    method: 'GET',
    path: '/api/v1/rss-feed-categories',
    route: { routeTemplate: '/api/v1/rss-feed-categories' },
    query: { limit: '2', status: 'pending' },
    auth: 'fixture-admin',
    status: 200,
    body: {
      results: [
        { category_text: 'Deals', item_count: 12, rejected: false },
        { category_text: 'Reviews', item_count: 7, rejected: false },
      ],
      page_info: {
        has_next_page: true,
        start_cursor: 'rss-feed-categories-first',
        end_cursor: 'rss-feed-categories-next',
      },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/admin/rss-feed-categories/categories.mts',
      'web/lib/api/server/rss-feed-categories.ts',
    ],
  },
]
