import type { ApiFixtureCase } from './types.mts'

export const swiftEmailApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.my.email-addresses.empty',
    method: 'GET',
    path: '/api/v1/my/email-addresses',
    query: { limit: '1', after: 'fixture-owner-scoped-email-cursor' },
    route: { routeTemplate: '/api/v1/my/email-addresses' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: [],
  },
  {
    id: 'native.my.email-addresses.request.default',
    method: 'POST',
    path: '/api/v1/my/email-addresses',
    route: { routeTemplate: '/api/v1/my/email-addresses' },
    auth: 'fixture-user',
    status: 200,
    requestBody: { email_address: ' Tests+Native-User@Voucha.ai ' },
    body: { email_address: 'tests+native-user@voucha.ai' },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: [],
  },
  {
    id: 'native.my.email-addresses.verify.default',
    method: 'POST',
    path: '/api/v1/my/email-addresses/tests%2Bnative-user%40voucha.ai/verifications',
    route: {
      routeTemplate: '/api/v1/my/email-addresses/:email/verifications',
      pathParams: { email: 'tests+native-user@voucha.ai' },
    },
    auth: 'fixture-user',
    status: 200,
    requestBody: { token: 'ABCD1234' },
    body: {
      results: [
        {
          email_address: 'tests+native-user@voucha.ai',
          is_primary: true,
          created_at: '2026-07-11T12:00:00.000Z',
        },
      ],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: [],
  },
  {
    id: 'native.my.email-preferences.default',
    method: 'GET',
    path: '/api/v1/my/email-preferences',
    route: { routeTemplate: '/api/v1/my/email-preferences' },
    auth: 'fixture-user',
    status: 200,
    body: {
      email_preferences: {
        engagement_emails_enabled: true,
        news_digest_frequency: 'weekly',
        moderation_emails_enabled: true,
        community_digest_frequency: 'weekly',
        moderation_email_cadence: 'daily',
        moderation_email_days_of_week: [1, 2, 3, 4, 5],
        moderation_email_time_of_day: '09:00',
        moderation_email_timezone: 'America/Los_Angeles',
      },
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: [],
  },
]
