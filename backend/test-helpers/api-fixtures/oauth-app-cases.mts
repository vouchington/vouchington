import type { ApiFixtureCase } from './types.mts'

const timestamp = '2026-09-01T12:00:00.000Z'
const appId = '00000000-0000-7000-8000-000000000721'
const redirectUri = 'https://agent.example.com/oauth/callback'

const oauthApp = {
  id: appId,
  client_id: 'voucha_fixture-app',
  client_name: 'Fixture Agent',
  client_type: 'confidential',
  token_endpoint_auth_method: 'client_secret_basic',
  redirect_uris: [redirectUri],
  scopes: ['mcp.user:read', 'mcp.user:write'],
  verified_at: null,
  created_at: timestamp,
  updated_at: timestamp,
}

export const oauthAppApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.my.oauth-apps.paginated',
    method: 'GET',
    path: '/api/v1/my/oauth-apps',
    query: { limit: '1' },
    route: { routeTemplate: '/api/v1/my/oauth-apps' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [oauthApp],
      page_info: {
        has_next_page: true,
        start_cursor: 'fixture-oauth-app-start-cursor',
        end_cursor: 'fixture-oauth-app-end-cursor',
      },
    },
    consumers: ['web'],
    migratedFrom: ['backend/api/v1/my/oauth-apps.test.mts'],
  },
  {
    id: 'web.my.oauth-apps.create',
    method: 'POST',
    path: '/api/v1/my/oauth-apps',
    route: { routeTemplate: '/api/v1/my/oauth-apps' },
    auth: 'fixture-user',
    requestBody: {
      client_name: 'Fixture Agent',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'client_secret_basic',
      scopes: ['mcp.user:read', 'mcp.user:write'],
    },
    status: 201,
    body: { oauth_app: oauthApp, client_secret: 'fixture-client-secret' },
    consumers: ['web'],
    migratedFrom: ['backend/api/v1/my/oauth-apps.test.mts'],
  },
  {
    id: 'web.my.oauth-apps.update',
    method: 'PATCH',
    path: `/api/v1/my/oauth-apps/${appId}`,
    route: { routeTemplate: '/api/v1/my/oauth-apps/:id', pathParams: { id: appId } },
    auth: 'fixture-user',
    requestBody: { client_name: 'Renamed Agent' },
    status: 200,
    body: { oauth_app: { ...oauthApp, client_name: 'Renamed Agent' } },
    consumers: ['web'],
    migratedFrom: ['backend/api/v1/my/oauth-apps.test.mts'],
  },
  {
    id: 'web.my.oauth-apps.revoke',
    method: 'DELETE',
    path: `/api/v1/my/oauth-apps/${appId}`,
    route: { routeTemplate: '/api/v1/my/oauth-apps/:id', pathParams: { id: appId } },
    auth: 'fixture-user',
    status: 204,
    body: null,
    consumers: ['web'],
    migratedFrom: ['backend/api/v1/my/oauth-apps.test.mts'],
  },
  {
    id: 'web.my.oauth-apps.rotate-secret',
    method: 'POST',
    path: `/api/v1/my/oauth-apps/${appId}/client-secrets`,
    route: {
      routeTemplate: '/api/v1/my/oauth-apps/:id/client-secrets',
      pathParams: { id: appId },
    },
    auth: 'fixture-user',
    status: 201,
    body: { oauth_app: oauthApp, client_secret: 'fixture-rotated-client-secret' },
    consumers: ['web'],
    migratedFrom: ['backend/api/v1/my/oauth-apps.test.mts'],
  },
]
