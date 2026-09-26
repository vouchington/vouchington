import nativeMyApiKeysCreate from '../../../../api-fixtures/v1/responses/native.my.api-keys.create.json'
import nativeMyOAuthGrantsPaginated from '../../../../api-fixtures/v1/responses/native.my.oauth-grants.paginated.json'
import nativeMyOAuthGrantsRevoke from '../../../../api-fixtures/v1/responses/native.my.oauth-grants.revoke.json'
import sharedScopesCatalog from '../../../../api-fixtures/v1/responses/shared.scopes.catalog.json'
import webAdminOAuthClientsList from '../../../../api-fixtures/v1/responses/web.admin.oauth-clients.list.json'
import webAdminOAuthClientsUnverify from '../../../../api-fixtures/v1/responses/web.admin.oauth-clients.unverify.json'
import webAdminOAuthClientsVerify from '../../../../api-fixtures/v1/responses/web.admin.oauth-clients.verify.json'
import webMyOAuthAppsCreate from '../../../../api-fixtures/v1/responses/web.my.oauth-apps.create.json'
import webMyOAuthAppsPaginated from '../../../../api-fixtures/v1/responses/web.my.oauth-apps.paginated.json'
import webMyOAuthAppsRevoke from '../../../../api-fixtures/v1/responses/web.my.oauth-apps.revoke.json'
import webMyOAuthAppsRotateSecret from '../../../../api-fixtures/v1/responses/web.my.oauth-apps.rotate-secret.json'
import webMyOAuthAppsUpdate from '../../../../api-fixtures/v1/responses/web.my.oauth-apps.update.json'
import type { ApiKey } from '@/types/api-keys'
import type { ListResponse } from '@/types/api-responses'
import type {
  AdminOAuthClient,
  AdminOAuthClientListItem,
  IssuedOAuthApp,
  OAuthApp,
  OAuthGrant,
} from '@/types/oauth-apps'
import type { ScopeCatalogResponse } from '@/types/scopes'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

const appId = '00000000-0000-7000-8000-000000000721'
const grantId = '00000000-0000-7000-8000-000000000711'
const scopes = ['mcp.user:read', 'mcp.user:write']

export const OAUTH_MANAGEMENT_DECLARATIONS = [
  defineWebApiFixture<ScopeCatalogResponse>()(
    'shared.scopes.catalog',
    sharedScopesCatalog,
    context => context.server.scopes.getScopeCatalog(),
  ),
  defineWebApiFixture<{ api_key: ApiKey; raw_key: string }>()(
    'native.my.api-keys.create',
    nativeMyApiKeysCreate,
    context => context.client.apiKeys.createApiKey('Coding agent', 'mcp', scopes),
  ),
  defineWebApiFixture<ListResponse<OAuthGrant>>()(
    'native.my.oauth-grants.paginated',
    nativeMyOAuthGrantsPaginated,
    context =>
      context.client.oauthGrants.getOAuthGrants({
        after: 'fixture-owner-scoped-oauth-grant-cursor',
        limit: 1,
      }),
    [
      context =>
        context.server.oauthGrants.getMyOAuthGrants({
          after: 'fixture-owner-scoped-oauth-grant-cursor',
          limit: 1,
        }),
    ],
  ),
  defineWebApiFixture<null>()('native.my.oauth-grants.revoke', nativeMyOAuthGrantsRevoke, context =>
    context.client.oauthGrants.revokeOAuthGrant(grantId),
  ),
  defineWebApiFixture<ListResponse<OAuthApp>>()(
    'web.my.oauth-apps.paginated',
    webMyOAuthAppsPaginated,
    context => context.client.oauthApps.getOAuthApps({ limit: 1 }),
    [context => context.server.oauthApps.getMyOAuthApps({ limit: 1 })],
  ),
  defineWebApiFixture<IssuedOAuthApp>()('web.my.oauth-apps.create', webMyOAuthAppsCreate, context =>
    context.client.oauthApps.createOAuthApp({
      client_name: 'Fixture Agent',
      redirect_uris: ['https://agent.example.com/oauth/callback'],
      token_endpoint_auth_method: 'client_secret_basic',
      scopes,
    }),
  ),
  defineWebApiFixture<{ oauth_app: OAuthApp }>()(
    'web.my.oauth-apps.update',
    webMyOAuthAppsUpdate,
    context => context.client.oauthApps.updateOAuthApp(appId, { client_name: 'Renamed Agent' }),
  ),
  defineWebApiFixture<null>()('web.my.oauth-apps.revoke', webMyOAuthAppsRevoke, context =>
    context.client.oauthApps.revokeOAuthApp(appId),
  ),
  defineWebApiFixture<IssuedOAuthApp>()(
    'web.my.oauth-apps.rotate-secret',
    webMyOAuthAppsRotateSecret,
    context => context.client.oauthApps.rotateOAuthAppSecret(appId),
  ),
  defineWebApiFixture<ListResponse<AdminOAuthClientListItem>>()(
    'web.admin.oauth-clients.list',
    webAdminOAuthClientsList,
    context =>
      context.client.adminOAuthClients.fetchAdminOAuthClients({
        verification: 'unverified',
        limit: 1,
      }),
    [
      context =>
        context.server.adminOAuthClients.getAdminOAuthClients({
          verification: 'unverified',
          limit: 1,
        }),
    ],
  ),
  defineWebApiFixture<{ oauth_client: AdminOAuthClient }>()(
    'web.admin.oauth-clients.verify',
    webAdminOAuthClientsVerify,
    context => context.client.adminOAuthClients.verifyOAuthClient(appId, 'Fixture Agent'),
  ),
  defineWebApiFixture<null>()(
    'web.admin.oauth-clients.unverify',
    webAdminOAuthClientsUnverify,
    context => context.client.adminOAuthClients.unverifyOAuthClient(appId),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
