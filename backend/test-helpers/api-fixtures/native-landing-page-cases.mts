import {
  nativeLandingGroupReferralLink,
  nativeLandingGroupReview,
  nativeLandingPageDetail,
  nativeLandingPageSummary,
  nativeLandingPageTravelSummary,
  nativeLandingProfileLink,
  nativeLandingReferralLink,
  nativeLandingReview,
} from './native-landing-data.mts'
import type { ApiFixtureCase } from './types.mts'

const nativeLandingPageAnalytics = {
  total_visits: 12,
  total_clicks: 4,
  unique_visitors: 9,
  ctr: 0.3333333333,
  item_clicks: [{ item_id: 'landing-item-1', item_type: 'link', click_count: 4 }],
  daily_stats: [{ date: '2026-06-29', visits: 12, clicks: 4, unique_visitors: 9 }],
  utm_sources: [{ utm_source: 'direct', visits: 12 }],
  conversion_funnel: {
    total_visits: 12,
    total_clicks: 4,
    total_signups: 2,
    visit_to_click_rate: 0.3333333333,
  },
}

export const nativeLandingPageApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.landing-pages.default',
    method: 'GET',
    path: '/api/v1/my/landing-pages',
    route: { routeTemplate: '/api/v1/my/landing-pages' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [nativeLandingPageSummary, nativeLandingPageTravelSummary],
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/admin/landing-pages.mts'],
  },
  {
    id: 'native.landing-page-detail.default',
    method: 'GET',
    path: '/api/v1/my/landing-pages/landing-page-1',
    route: {
      routeTemplate: '/api/v1/my/landing-pages/:pageId',
      pathParams: { pageId: 'landing-page-1' },
    },
    auth: 'fixture-user',
    status: 200,
    body: { landing_page: nativeLandingPageDetail },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['web/lib/api/client/my.ts'],
  },
  {
    id: 'native.landing-page-analytics.default',
    method: 'GET',
    path: '/api/v1/my/landing-pages/landing-page-1/analytics',
    route: {
      routeTemplate: '/api/v1/my/landing-pages/:pageId/analytics',
      pathParams: { pageId: 'landing-page-1' },
    },
    auth: 'fixture-user',
    status: 200,
    body: { analytics: nativeLandingPageAnalytics },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['web/lib/api/client/my.ts'],
  },
  {
    id: 'native.admin-user-landing-pages.default',
    method: 'GET',
    path: '/api/v1/admin/users/user-abc/landing-pages',
    route: {
      routeTemplate: '/api/v1/admin/users/:userId/landing-pages',
      pathParams: { userId: 'user-abc' },
    },
    auth: 'fixture-admin',
    status: 200,
    body: {
      results: [nativeLandingPageSummary],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['web/lib/api/client/my.ts'],
  },
  {
    id: 'native.admin-landing-page-analytics.default',
    method: 'GET',
    path: '/api/v1/admin/landing-pages/landing-page-1/analytics',
    route: {
      routeTemplate: '/api/v1/admin/landing-pages/:pageId/analytics',
      pathParams: { pageId: 'landing-page-1' },
    },
    auth: 'fixture-admin',
    status: 200,
    body: {
      landing_page: { ...nativeLandingPageSummary, items: [] },
      analytics: nativeLandingPageAnalytics,
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/admin/landing-pages.mts'],
  },
  {
    id: 'native.landing-page-candidates.default',
    method: 'GET',
    path: '/api/v1/my/landing-pages/candidates',
    route: { routeTemplate: '/api/v1/my/landing-pages/candidates' },
    auth: 'fixture-user',
    status: 200,
    body: {
      candidates: {
        can_create_landing_pages: true,
        profile_links: [nativeLandingProfileLink],
        reviews: [nativeLandingReview, nativeLandingGroupReview],
        referral_links: [nativeLandingReferralLink, nativeLandingGroupReferralLink],
      },
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['web/lib/api/client/my.ts'],
  },
  {
    id: 'native.landing-page-items-mutation.default',
    method: 'PUT',
    path: '/api/v1/my/landing-pages/landing-page-1/items',
    requestBody: {
      items: [
        { type: 'profile_link', profile_link_id: 'profile-link-1' },
        { type: 'review', review_id: 'review-1' },
        { type: 'referral_link', referral_link_id: 'referral-link-1' },
        {
          type: 'topic_group',
          topic_id: 'topic-1',
          entries: [
            { type: 'review', review_id: 'review-2' },
            { type: 'referral_link', referral_link_id: 'referral-link-2' },
          ],
        },
        { type: 'link', label: 'Newsletter', url: 'https://example.com/newsletter' },
      ],
    },
    route: {
      routeTemplate: '/api/v1/my/landing-pages/:pageId/items',
      pathParams: { pageId: 'landing-page-1' },
    },
    auth: 'fixture-user',
    status: 200,
    body: { landing_page: nativeLandingPageDetail },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['web/lib/api/client/my.ts'],
  },
  {
    id: 'native.landing-page-mutation.default',
    method: 'PATCH',
    path: '/api/v1/my/landing-pages/landing-page-1',
    requestBody: { slug: 'updated-links', title: 'Updated Links' },
    route: {
      routeTemplate: '/api/v1/my/landing-pages/:pageId',
      pathParams: { pageId: 'landing-page-1' },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      landing_page: {
        id: 'landing-page-1',
        user_id: 'user-abc',
        title: 'Updated Links',
        subtitle: null,
        slug: 'updated-links',
        is_default: true,
        created_at: '2026-06-28T10:00:00Z',
        updated_at: '2026-06-30T10:00:00Z',
      },
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['web/lib/api/client/my.ts'],
  },
]
