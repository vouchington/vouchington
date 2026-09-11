import type { ManifestEndpoint } from './endpoint-registry'

const endpoint = (path: string): ManifestEndpoint => ({
  method: 'GET',
  path,
})

/* c8 ignore next -- manifest-coverage.test asserts these static fixture entries through the aggregate registry. */
export const engineeringEndpointRegistry: Record<string, ManifestEndpoint> = {
  'native.admin-ai-costs.default': {
    ...endpoint('/api/v1/admin/ai-costs'),
    query: { limit: '25' },
  },
  'native.admin-ai-costs.page-2': {
    ...endpoint('/api/v1/admin/ai-costs'),
    query: {
      after:
        'eyJ0b3RhbF9jb3N0X21pY3JvdW5pdHMiOiI5MDA3MTk5MjU0NzQwOTkzMTIzNDU2NzgiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDEwMiJ9',
      limit: '25',
    },
  },
  'native.admin-ai-costs.empty': {
    ...endpoint('/api/v1/admin/ai-costs'),
    query: { limit: '25' },
  },
}
