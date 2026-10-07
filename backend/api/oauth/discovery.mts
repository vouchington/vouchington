import app from '../app.mts'
import type { Context } from '@jongleberry/api-server'
import { setAnonymousPublicCacheHeaders } from '../response-helpers.mts'
import {
  buildOAuthAuthorizationServerMetadata,
  buildOAuthProtectedResourceMetadata,
  getNativeOAuthClientDocument,
  NATIVE_OAUTH_CLIENT_APPS,
} from '@services/oauth-authorization-server'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

// RFC 8414 and RFC 9728 discovery documents, fetched anonymously by OAuth and MCP clients, so these
// routes intentionally skip the session-auth preamble. Two protected resources share this origin,
// so each has a path-derived metadata document and there is no root document.
app.route('/.well-known/oauth-authorization-server').get((ctx: Context) => {
  sendDiscoveryDocument(ctx, buildOAuthAuthorizationServerMetadata())
})

app.route('/.well-known/oauth-protected-resource/api/v1/mcp').get((ctx: Context) => {
  sendDiscoveryDocument(ctx, buildOAuthProtectedResourceMetadata('user'))
})

app.route('/.well-known/oauth-protected-resource/api/v1/admin/mcp').get((ctx: Context) => {
  sendDiscoveryDocument(ctx, buildOAuthProtectedResourceMetadata('admin'))
})

app.route('/api/v1/oauth/native-clients/:app').get((ctx: Context) => {
  const nativeApp = NATIVE_OAUTH_CLIENT_APPS.find(app => app === ctx.params.app)
  ctx.assert(nativeApp, 404, 'Not Found')
  sendDiscoveryDocument(ctx, getNativeOAuthClientDocument(nativeApp))
})

function sendDiscoveryDocument(ctx: Context, document: object): void {
  setAnonymousPublicCacheHeaders(ctx, null, HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
  ctx.response.buffer(Buffer.from(JSON.stringify(document)), 'application/json')
}
