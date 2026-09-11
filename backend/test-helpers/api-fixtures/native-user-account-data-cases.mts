import type { ApiFixtureCase } from './types.mts'

const migratedFrom = [
  'docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md',
  'web/app/(my)/my/data/data-request-section.tsx',
]

export const nativeUserAccountDataApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.users.delete.default',
    method: 'DELETE',
    path: '/api/v1/users/user-abc',
    route: {
      routeTemplate: '/api/v1/users/:idOrSlug',
      pathParams: { idOrSlug: 'user-abc' },
    },
    auth: 'fixture-user',
    status: 202,
    body: { logout: true },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: [
      'docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md',
      'web/app/(my)/my/data/delete-account-dialog.tsx',
    ],
  },
  {
    id: 'native.users.data-request.default',
    method: 'GET',
    path: '/api/v1/users/user-abc/data-request',
    route: {
      routeTemplate: '/api/v1/users/:idOrSlug/data-request',
      pathParams: { idOrSlug: 'user-abc' },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      created_at: '2026-07-01T16:00:00Z',
      download_url: 'https://exports.example.test/user-abc/export.zip',
      expires_at: '2027-07-08T16:04:00Z',
      id: 'data-request-abc',
      status: 'ready',
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom,
  },
  {
    id: 'native.users.data-request.create.default',
    method: 'POST',
    path: '/api/v1/users/user-abc/data-request',
    route: {
      routeTemplate: '/api/v1/users/:idOrSlug/data-request',
      pathParams: { idOrSlug: 'user-abc' },
    },
    auth: 'fixture-user',
    status: 201,
    body: {
      created_at: '2026-07-01T16:00:00Z',
      expires_at: null,
      id: 'data-request-abc',
      status: 'pending',
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom,
  },
]
