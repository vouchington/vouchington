import {
  enqueueUrlBlocklistRebuildOrThrow,
  invalidateUrlBlocklistReadyMarker,
} from '@services/urls-domains-blacklist/bloom-filter'
import {
  enqueueEmailBlocklistRebuildOrThrow,
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
  enqueueEmailRebuild: enqueueEmailBlocklistRebuildOrThrow,
  enqueueUrlRebuild: enqueueUrlBlocklistRebuildOrThrow,
}

export async function rebuildBloomForSource(
  sourceType: 'url' | 'email',
  dependencies: BloomRebuildDependencies,
): Promise<void> {
  // A failed bump must not leave the filter unavailable with no rebuild queued.
  if (sourceType === 'email') {
    try {
      await dependencies.invalidateEmailReadyMarker()
    } finally {
      await dependencies.enqueueEmailRebuild()
    }
  } else {
    try {
      await dependencies.invalidateUrlReadyMarker()
    } finally {
      await dependencies.enqueueUrlRebuild()
    }
  }
}
