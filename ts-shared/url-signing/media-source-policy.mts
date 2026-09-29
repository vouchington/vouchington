/** Current sideload route. Older `/sideload/` paths are removed and must not be served. */
export const CURRENT_SIDELOAD_PATH_PREFIX = '/sideload/v2/'

/** Transformed sideload objects live in this namespace so legacy render keys cannot be read. */
export const TRANSFORMED_SIDELOAD_CACHE_PREFIX = 'transformed/sideload/v2/'

const CANONICAL_FIRST_PARTY_MEDIA_HOSTS = ['images.voucha.ai', 'images-staging.voucha.ai'] as const

const PLACEMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type DependencyAuthorization = 'allow' | 'withheld' | 'unknown'

export type PlacementSourcePolicy = {
  placementId: string
  revision: number
  imageId: string
}

export function isCurrentSideloadRoute(pathname: string): boolean {
  return /^\/sideload\/v2\/[^/]+$/.test(pathname)
}

export function isRemovedSideloadRoute(pathname: string): boolean {
  return (
    pathname === '/sideload' ||
    (pathname.startsWith('/sideload/') && !isCurrentSideloadRoute(pathname))
  )
}

export function isPlacementSourcePolicy(value: unknown): value is PlacementSourcePolicy {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.placementId === 'string' &&
    PLACEMENT_UUID.test(record.placementId) &&
    typeof record.imageId === 'string' &&
    PLACEMENT_UUID.test(record.imageId) &&
    typeof record.revision === 'number' &&
    Number.isSafeInteger(record.revision) &&
    record.revision >= 0 &&
    record.revision <= 2147483647
  )
}

/** Empty manifests have no dependency bytes. Any withheld or unknown dependency denies delivery. */
export function authorizeDependencyStates(
  states: readonly DependencyAuthorization[],
): 'allow' | 'deny' {
  return states.every(state => state === 'allow') ? 'allow' : 'deny'
}

export function normalizeMediaHostname(hostname: string): string {
  return hostname.replace(/\.$/, '').toLowerCase()
}

function hostnameOf(value: string): string | undefined {
  if (value.includes('://')) {
    try {
      return normalizeMediaHostname(new URL(value).hostname)
    } catch {
      return undefined
    }
  }
  const host = value.trim()
  return host ? normalizeMediaHostname(host) : undefined
}

function protectedMediaHosts(options: {
  imageOrigin?: string
  aliases?: readonly string[]
  env?: NodeJS.ProcessEnv
}): Set<string> {
  const env = options.env ?? process.env
  const hosts = new Set<string>(CANONICAL_FIRST_PARTY_MEDIA_HOSTS)
  const configured = env.MEDIA_SOURCE_HOST_ALIASES ?? ''
  const configuredOrigin = env.IMAGE_ORIGIN
  if (configuredOrigin) {
    const host = hostnameOf(configuredOrigin)
    if (host) hosts.add(host)
  }
  for (const alias of configured.split(',')) {
    const host = hostnameOf(alias)
    if (host) hosts.add(host)
  }
  const originHost = options.imageOrigin ? hostnameOf(options.imageOrigin) : undefined
  if (originHost) hosts.add(originHost)
  for (const alias of options.aliases ?? []) {
    const host = hostnameOf(alias)
    if (host) hosts.add(host)
  }
  return hosts
}

function matchesProtectedHost(host: string, protectedHost: string): boolean {
  return host === protectedHost || host.endsWith(`.${protectedHost}`)
}

/** True for a first-party media origin or a hostname alias of one, including configured image origins. */
export function isFirstPartyMediaUrl(
  url: URL,
  options: { imageOrigin?: string; aliases?: readonly string[]; env?: NodeJS.ProcessEnv } = {},
): boolean {
  const host = normalizeMediaHostname(url.hostname)
  for (const protectedHost of protectedMediaHosts(options)) {
    if (matchesProtectedHost(host, protectedHost)) return true
  }
  return false
}

export function firstPartyMediaBlockedHosts(env: NodeJS.ProcessEnv = process.env): {
  exact: string[]
  suffixes: string[]
} {
  const hosts = [...protectedMediaHosts({ env })]
  return {
    exact: hosts,
    suffixes: hosts.map(host => `.${host}`),
  }
}
