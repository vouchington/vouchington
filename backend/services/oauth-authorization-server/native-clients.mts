import { getSiteOrigin } from '@modules/utils'
import type { ClientIdMetadataDocument } from './types.mts'

export const NATIVE_OAUTH_CLIENT_APPS = ['ios', 'macos', 'windows'] as const
export type NativeOAuthClientApp = (typeof NATIVE_OAUTH_CLIENT_APPS)[number]

const NATIVE_CLIENT_NAMES: Record<NativeOAuthClientApp, string> = {
  ios: 'Voucha for iOS',
  macos: 'Voucha for macOS',
  windows: 'Voucha for Windows',
}

export function getNativeOAuthClientDocument(app: NativeOAuthClientApp): ClientIdMetadataDocument {
  const origin = new URL(getSiteOrigin()).origin
  return {
    client_id: `${origin}/api/v1/oauth/native-clients/${app}`,
    client_name: NATIVE_CLIENT_NAMES[app],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    redirect_uris:
      app === 'windows'
        ? [
            'http://127.0.0.1/oauth/native/windows/callback',
            'http://[::1]/oauth/native/windows/callback',
          ]
        : [`${origin}/oauth/native/${app}/callback`],
    scope: 'mcp.user:read mcp.user:write',
  }
}

export function findNativeOAuthClientDocument(clientId: string): ClientIdMetadataDocument | null {
  for (const app of NATIVE_OAUTH_CLIENT_APPS) {
    const document = getNativeOAuthClientDocument(app)
    if (document.client_id === clientId) return document
  }
  return null
}
