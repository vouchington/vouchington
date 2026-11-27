import { addGracefulShutdownDrainCallback } from '@data-stores/graceful-shutdown'
import {
  getExternalFetch,
  getExternalRequestDispatcher,
  getLongRunningExternalFetch,
  getLongRunningExternalRequestDispatcher,
  reportHttpTransportError,
} from '@modules/utils'
import {
  createProxyRoutedDispatchers,
  type ProxyRoutedDispatchers,
} from '@vouchington/http-transport/dispatchers'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'

export type ApiEgressProxyProvider =
  | 'stripe_enabled'
  | 'openai_moderation_enabled'
  | 'apple_oauth_enabled'
  | 'github_oauth_enabled'
  | 'x_oauth_enabled'
  | 'bluesky_oauth_enabled'
  | 'fediverse_search_enabled'
  | 'bedrock_embeddings_enabled'

export const apiEgressProxyTransport: ProxyRoutedDispatchers<ApiEgressProxyProvider> =
  createProxyRoutedDispatchers<ApiEgressProxyProvider>({
    direct: {
      getExternalFetch,
      getLongRunningExternalFetch,
      getExternalRequestDispatcher,
      getLongRunningExternalRequestDispatcher,
    },
    getProxyUrl: getApiEgressProxyUrl,
    onError: reportHttpTransportError,
  })

export function getApiEgressProxyUrl(): string {
  const rawUrl = process.env.API_EGRESS_PROXY_URL?.trim()
  if (!rawUrl)
    throw new Error('API_EGRESS_PROXY_URL is required when API egress proxying is enabled')
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('API_EGRESS_PROXY_URL must be a valid http URL')
  }
  if (
    url.protocol !== 'http:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('API_EGRESS_PROXY_URL must be an unauthenticated http URL')
  }
  if (isDeployedEnvironment() && (url.hostname !== 'api-egress-proxy' || url.port !== '3128')) {
    throw new Error(
      'API_EGRESS_PROXY_URL must use the api-egress-proxy:3128 Service Connect endpoint in deployed environments',
    )
  }
  return url.toString()
}

addGracefulShutdownDrainCallback(apiEgressProxyTransport.closeProxyDispatchers)
