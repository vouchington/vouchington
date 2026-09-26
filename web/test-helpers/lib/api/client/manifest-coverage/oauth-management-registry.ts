import type { ManifestEndpoint } from './endpoint-registry'

const appPath = '/api/v1/my/oauth-apps/00000000-0000-7000-8000-000000000721'
const verificationPath =
  '/api/v1/admin/oauth-clients/00000000-0000-7000-8000-000000000721/verification'

/* c8 ignore next -- manifest-coverage.test asserts these static fixture entries through the aggregate registry. */
export const oauthManagementEndpointRegistry: Record<string, ManifestEndpoint> = {
  'web.my.oauth-apps.paginated': {
    method: 'GET',
    path: '/api/v1/my/oauth-apps',
    query: { limit: '1' },
  },
  'web.my.oauth-apps.create': {
    method: 'POST',
    path: '/api/v1/my/oauth-apps',
    requestBody: {
      client_name: 'Fixture Agent',
      redirect_uris: ['https://agent.example.com/oauth/callback'],
      scopes: ['mcp.user:read', 'mcp.user:write'],
      token_endpoint_auth_method: 'client_secret_basic',
    },
  },
  'web.my.oauth-apps.update': {
    method: 'PATCH',
    path: appPath,
    requestBody: { client_name: 'Renamed Agent' },
  },
  'web.my.oauth-apps.revoke': { method: 'DELETE', path: appPath },
  'web.my.oauth-apps.rotate-secret': { method: 'POST', path: `${appPath}/client-secrets` },
  'web.admin.oauth-clients.list': {
    method: 'GET',
    path: '/api/v1/admin/oauth-clients',
    query: { limit: '1', verification: 'unverified' },
  },
  'web.admin.oauth-clients.verify': {
    method: 'PUT',
    path: verificationPath,
    requestBody: { client_name: 'Fixture Agent' },
  },
  'web.admin.oauth-clients.unverify': { method: 'DELETE', path: verificationPath },
}
