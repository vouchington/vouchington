import type { ManifestEndpoint } from './endpoint-registry'

const endpoint = (path: string, query?: Record<string, string>): ManifestEndpoint => ({
  method: 'GET',
  path,
  query,
})

export const communityEndpointRegistry: Record<string, ManifestEndpoint> = {
  'native.communities.automod-flag.dismissal.default': {
    method: 'POST',
    path: '/api/v1/communities/test-community/posts/00000000-0000-7000-8000-000000000902/automod-flag/dismissal',
  },
  'native.communities.moderation-queue.automod-flag.member': endpoint(
    '/api/v1/communities/test-community/moderation-queue',
    { limit: '1', source: 'automod_flag' },
  ),
  'native.communities.moderation-queue.automod-flag.page-1': endpoint(
    '/api/v1/communities/test-community/moderation-queue',
    { limit: '1', source: 'automod_flag' },
  ),
  'native.communities.moderation-queue.automod-flag.page-2': endpoint(
    '/api/v1/communities/test-community/moderation-queue',
    {
      after:
        'eyJjcmVhdGVkX2F0IjoiMjAyNi0wMS0wMVQwMDowMDowMC4wMDAwMDBaIiwiaWQiOiIwMDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDA5MDIifQ',
      limit: '1',
      source: 'automod_flag',
    },
  ),
  'web.communities.modmail.page-2': endpoint('/api/v1/communities/test-community/modmail', {
    after:
      'eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTAxVDEyOjAwOjAwLjAwMDAwMFoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDUwMSJ9',
    limit: '25',
  }),
  'web.communities.modmail-messages.page-2': endpoint(
    '/api/v1/communities/test-community/modmail/00000000-0000-7000-8000-000000000501/messages',
    {
      after: 'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDYwMSJ9',
      limit: '25',
    },
  ),
  'web.communities.saved-replies.page-2': endpoint(
    '/api/v1/communities/test-community/saved-replies',
    {
      after: 'eyJyYW5raW5nIjowLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDcwMSJ9',
      limit: '25',
    },
  ),
}
