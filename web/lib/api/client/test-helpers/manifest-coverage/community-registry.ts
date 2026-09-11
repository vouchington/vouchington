import type { ManifestEndpoint } from './endpoint-registry'

const endpoint = (path: string, query?: Record<string, string>): ManifestEndpoint => ({
  method: 'GET',
  path,
  query,
})

export const communityEndpointRegistry: Record<string, ManifestEndpoint> = {
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
