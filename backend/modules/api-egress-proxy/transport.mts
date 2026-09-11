import { addGracefulShutdownDrainCallback } from '@data-stores/graceful-shutdown'
import {
  EXTERNAL_DISPATCHER_BODY_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_CONNECT_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_KEEP_ALIVE_MAX_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_KEEP_ALIVE_TIMEOUT_MS,
  LONG_RUNNING_EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
  getExternalFetch,
  getExternalRequestDispatcher,
  getLongRunningExternalFetch,
  getLongRunningExternalRequestDispatcher,
} from '@modules/utils'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'
import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from 'undici'
export type ApiEgressProxyProvider =
  | 'stripe_enabled'
  | 'openai_moderation_enabled'
  | 'apple_oauth_enabled'
  | 'github_oauth_enabled'
  | 'x_oauth_enabled'
  | 'bluesky_oauth_enabled'
  | 'fediverse_search_enabled'
  | 'bedrock_embeddings_enabled'

export type ProviderFetchProfile = 'routine' | 'long-running'

type ProviderFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

let proxyDispatchers: Partial<Record<ProviderFetchProfile, ProxyAgent>> = {}
let closePromise: Promise<void> | undefined
let providerRoutingResolver: ((provider: ApiEgressProxyProvider) => boolean) | undefined

export function installApiEgressProxyRoutingResolver(
  resolver: (provider: ApiEgressProxyProvider) => boolean,
): void {
  providerRoutingResolver = resolver
}

export function isApiEgressProxyRouteEnabled(provider: ApiEgressProxyProvider): boolean {
  return providerRoutingResolver?.(provider) === true
}

/**
 * Returns a stable fetch seam whose dispatcher is selected at request time, so a DynamicConfig
 * change applies to an already-created provider SDK client without a process restart.
 */
export function getProviderFetch(
  provider: ApiEgressProxyProvider,
  profile: ProviderFetchProfile = 'routine',
): ProviderFetch {
  return async (input, init) => {
    const dispatcher = isApiEgressProxyRouteEnabled(provider)
      ? getProxyDispatcher(profile)
      : undefined
    if (!dispatcher) {
      return profile === 'long-running'
        ? getLongRunningExternalFetch()(input, init)
        : getExternalFetch()(input, init)
    }
    return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher,
    }) as unknown as Promise<Response>
  }
}

export function getProxyDispatcher(profile: ProviderFetchProfile = 'routine'): Dispatcher {
  const existing = proxyDispatchers[profile]
  if (existing) return existing
  const proxyUrl = getApiEgressProxyUrl()
  const dispatcher = new ProxyAgent({
    uri: proxyUrl,
    connections: 5,
    headersTimeout:
      profile === 'long-running'
        ? LONG_RUNNING_EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS
        : EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
    bodyTimeout: EXTERNAL_DISPATCHER_BODY_TIMEOUT_MS,
    keepAliveTimeout: EXTERNAL_DISPATCHER_KEEP_ALIVE_TIMEOUT_MS,
    keepAliveMaxTimeout: EXTERNAL_DISPATCHER_KEEP_ALIVE_MAX_TIMEOUT_MS,
    connect: { timeout: EXTERNAL_DISPATCHER_CONNECT_TIMEOUT_MS },
  })
  proxyDispatchers[profile] = dispatcher
  return dispatcher
}

export function getProviderRequestDispatcher(
  provider: ApiEgressProxyProvider,
  profile: ProviderFetchProfile = 'routine',
): Dispatcher {
  return isApiEgressProxyRouteEnabled(provider)
    ? getProxyDispatcher(profile)
    : profile === 'long-running'
      ? getLongRunningExternalRequestDispatcher()
      : getExternalRequestDispatcher()
}

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

export async function closeApiEgressProxyTransport(): Promise<void> {
  if (closePromise) return await closePromise
  closePromise = Promise.all(
    Object.values(proxyDispatchers).map(dispatcher => dispatcher.close().catch(() => undefined)),
  ).then(() => undefined)
  return await closePromise
}

export async function resetApiEgressProxyTransportForTest(): Promise<void> {
  const previous = Object.values(proxyDispatchers)
  proxyDispatchers = {}
  closePromise = undefined
  providerRoutingResolver = undefined
  await Promise.all(previous.map(dispatcher => dispatcher.close().catch(() => undefined)))
}

addGracefulShutdownDrainCallback(closeApiEgressProxyTransport)
