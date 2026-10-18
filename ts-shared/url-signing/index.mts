import { buildSignedProxyUrl } from '@vouchington/utils/url-signing'
import { isFirstPartyMediaUrl } from './media-host-policy.mts'
import { CURRENT_SIDELOAD_PATH_PREFIX } from './media-source-policy.mts'

export {
  CURRENT_SIDELOAD_PATH_PREFIX,
  TRANSFORMED_SIDELOAD_CACHE_PREFIX,
  getImagePlacementDeliveryKey,
  isCurrentSideloadRoute,
  isPlacementSourcePolicy,
  isRemovedSideloadRoute,
  parseMediaDeliveryEdgeEnforcementMode,
} from './media-source-policy.mts'
export { firstPartyMediaBlockedHosts, isFirstPartyMediaUrl } from './media-host-policy.mts'
export type {
  MediaDeliveryEdgeEnforcementMode,
  PlacementSourcePolicy,
} from './media-source-policy.mts'

export const SIDELOAD_SIGNING_KEYS_ENV = 'VOUCHA_SIDELOAD_SIGNING_KEYS'

/** Applies Voucha's route, host, origin and query contract to the shared signed-proxy builder. */
export function buildSideloadImageUrl(
  externalUrl: string,
  opts: {
    imageOrigin: string
    width: number
    signingKeys: string[]
    quality?: number
    aliases?: readonly string[]
  },
): string | null {
  return buildSignedProxyUrl(externalUrl, {
    origin: opts.imageOrigin,
    pathPrefix: CURRENT_SIDELOAD_PATH_PREFIX,
    query: { w: opts.width, q: opts.quality },
    signingKeys: Array.isArray(opts.signingKeys) ? opts.signingKeys : [],
    skip: (target: URL) => isFirstPartyMediaUrl(target, opts),
  })
}
