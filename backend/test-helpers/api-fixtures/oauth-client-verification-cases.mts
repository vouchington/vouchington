import type { ApiFixtureCase } from './types.mts'

const timestamp = '2026-09-01T12:00:00.000Z'
const verifiedAt = '2026-09-10T09:15:00.000Z'
const ownerId = '00000000-0000-7000-8000-000000000001'
const adminId = '00000000-0000-7000-8000-000000000002'
const clientId = '00000000-0000-7000-8000-000000000721'
const deferredWebConsumers: ApiFixtureCase['consumers'] = []

const adminClient = {
  id: clientId,
  client_id: 'voucha_fixture-app',
  client_name: 'Fixture Agent',
  client_type: 'confidential',
  redirect_uris: ['https://agent.example.com/oauth/callback'],
  scopes: ['mcp.user:read', 'mcp.user:write'],
  owner_user_id: ownerId,
  verified_at: null,
  verified_by_id: null,
  created_at: timestamp,
}

export const oauthClientVerificationApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.admin.oauth-clients.list',
    method: 'GET',
    path: '/api/v1/admin/oauth-clients',
    query: { verification: 'unverified', limit: '1' },
    route: { routeTemplate: '/api/v1/admin/oauth-clients' },
    auth: 'fixture-admin',
    status: 200,
    body: {
      results: [
        {
          ...adminClient,
          owner: {
            __entity_type: 'user',
            id: ownerId,
            username: 'fixture-user',
            roles: [],
            profile_image_id: null,
          },
        },
      ],
      page_info: {
        has_next_page: false,
        start_cursor: 'fixture-admin-oauth-client-start-cursor',
        end_cursor: 'fixture-admin-oauth-client-end-cursor',
      },
    },
    consumers: deferredWebConsumers,
    migratedFrom: ['backend/api/v1/admin/oauth-clients.test.mts'],
  },
  {
    id: 'web.admin.oauth-clients.verify',
    method: 'PUT',
    path: `/api/v1/admin/oauth-clients/${clientId}/verification`,
    route: {
      routeTemplate: '/api/v1/admin/oauth-clients/:id/verification',
      pathParams: { id: clientId },
    },
    auth: 'fixture-admin',
    requestBody: { client_name: 'Fixture Agent' },
    status: 200,
    body: { oauth_client: { ...adminClient, verified_at: verifiedAt, verified_by_id: adminId } },
    consumers: deferredWebConsumers,
    migratedFrom: ['backend/api/v1/admin/oauth-clients.test.mts'],
  },
  {
    id: 'web.admin.oauth-clients.unverify',
    method: 'DELETE',
    path: `/api/v1/admin/oauth-clients/${clientId}/verification`,
    route: {
      routeTemplate: '/api/v1/admin/oauth-clients/:id/verification',
      pathParams: { id: clientId },
    },
    auth: 'fixture-admin',
    status: 204,
    body: null,
    consumers: deferredWebConsumers,
    migratedFrom: ['backend/api/v1/admin/oauth-clients.test.mts'],
  },
]
