import {
  enqueueUrlBlocklistRebuild,
  invalidateUrlBlocklistReadyMarker,
} from '@services/urls-domains-blacklist/bloom-filter'
import {
  enqueueEmailBlocklistRebuild,
  invalidateEmailBlocklistReadyMarker,
} from '@services/urls-domains-blacklist/email-bloom-filter'

export interface BloomRebuildDependencies {
  invalidateEmailReadyMarker: () => Promise<unknown>
  invalidateUrlReadyMarker: () => Promise<unknown>
  enqueueEmailRebuild: () => Promise<void>
  enqueueUrlRebuild: () => Promise<void>
}

export const defaultBloomRebuildDependencies: BloomRebuildDependencies = {
  invalidateEmailReadyMarker: invalidateEmailBlocklistReadyMarker,
  invalidateUrlReadyMarker: invalidateUrlBlocklistReadyMarker,
  enqueueEmailRebuild: enqueueEmailBlocklistRebuild,
  enqueueUrlRebuild: enqueueUrlBlocklistRebuild,
}

export async function rebuildBloomForSource(
  sourceType: 'url' | 'email',
  dependencies: BloomRebuildDependencies,
): Promise<void> {
  if (sourceType === 'email') {
    await dependencies.invalidateEmailReadyMarker()
    await dependencies.enqueueEmailRebuild()
  } else {
    await dependencies.invalidateUrlReadyMarker()
    await dependencies.enqueueUrlRebuild()
  }
}
