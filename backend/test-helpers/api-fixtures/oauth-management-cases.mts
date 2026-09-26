import { listScopeCatalog } from '@modules/scopes'
import type { ApiFixtureCase } from './types.mts'

const timestamp = '2026-09-01T12:00:00.000Z'
const lastUsedAt = '2026-09-20T08:30:00.000Z'
const userId = '00000000-0000-7000-8000-000000000001'
const apiKeyId = '00000000-0000-7000-8000-000000000701'
const grantId = '00000000-0000-7000-8000-000000000711'
const clientRowId = '00000000-0000-7000-8000-000000000712'
const clientConsumers = ['swift-core', 'dotnet-core'] as const

export const oauthManagementApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'shared.scopes.catalog',
    method: 'GET',
    path: '/api/v1/scopes',
    route: { routeTemplate: '/api/v1/scopes' },
    auth: 'none',
    status: 200,
    body: { scopes: listScopeCatalog() },
    consumers: [...clientConsumers],
    migratedFrom: ['backend/api/v1/scopes/scopes.test.mts'],
  },
  {
    id: 'native.my.api-keys.create',
    method: 'POST',
    path: '/api/v1/my/api-keys',
    route: { routeTemplate: '/api/v1/my/api-keys' },
    auth: 'fixture-user',
    requestBody: {
      type: 'mcp',
      label: 'Coding agent',
      permissions: ['mcp.user:read', 'mcp.user:write'],
    },
    status: 201,
    body: {
      api_key: {
        id: apiKeyId,
        user_id: userId,
        prefix: 'voucha_mcp_0000',
        type: 'mcp',
        label: 'Coding agent',
        permissions: ['mcp.user:read', 'mcp.user:write'],
        created_at: timestamp,
        last_used_at: null,
        revoked_at: null,
        updated_at: timestamp,
      },
      raw_key: 'fixture-raw-api-key',
    },
    consumers: [...clientConsumers],
    migratedFrom: ['backend/api/v1/my/api-keys.test.mts'],
  },
  {
    id: 'native.my.oauth-grants.paginated',
    method: 'GET',
    path: '/api/v1/my/oauth-grants',
    query: { limit: '1', after: 'fixture-owner-scoped-oauth-grant-cursor' },
    route: { routeTemplate: '/api/v1/my/oauth-grants' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        {
          id: grantId,
          client: {
            id: clientRowId,
            client_id: 'voucha_fixture-client',
            client_name: 'Fixture Agent',
            verified: true,
          },
          resource: 'https://voucha.ai/api/v1/mcp',
          scopes: ['mcp.user:read', 'mcp.user:write'],
          consented_at: timestamp,
          last_used_at: lastUsedAt,
        },
      ],
      page_info: {
        has_next_page: true,
        start_cursor: 'fixture-oauth-grant-start-cursor',
        end_cursor: 'fixture-oauth-grant-end-cursor',
      },
    },
    consumers: [...clientConsumers],
    migratedFrom: ['backend/api/v1/my/oauth-grants.test.mts'],
  },
  {
    id: 'native.my.oauth-grants.revoke',
    method: 'DELETE',
    path: `/api/v1/my/oauth-grants/${grantId}`,
    route: { routeTemplate: '/api/v1/my/oauth-grants/:id', pathParams: { id: grantId } },
    auth: 'fixture-user',
    status: 204,
    body: null,
    consumers: [...clientConsumers],
    migratedFrom: ['backend/api/v1/my/oauth-grants.test.mts'],
  },
]
