/** Current sideload route. Older `/sideload/` paths are removed and must not be served. */
export const CURRENT_SIDELOAD_PATH_PREFIX = '/sideload/v2/'

/** Transformed sideload objects live in this namespace so legacy render keys cannot be read. */
export const TRANSFORMED_SIDELOAD_CACHE_PREFIX = 'transformed/sideload/v2/'

const PLACEMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type MediaDeliveryEdgeEnforcementMode = 'off' | 'report' | 'enforce'

export type PlacementSourcePolicy = {
  placementId: string
  revision: number
  imageId: string
}

export function parseMediaDeliveryEdgeEnforcementMode(
  env: NodeJS.ProcessEnv,
): MediaDeliveryEdgeEnforcementMode {
  const mode = env.MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE ?? 'off'
  if (mode === 'off' || mode === 'report' || mode === 'enforce') return mode
  throw new Error(`Invalid MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE: ${mode}`)
}

export function getImagePlacementDeliveryKey(input: PlacementSourcePolicy): string {
  return `image-placement:${input.placementId}:${input.revision}:${input.imageId}`
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
