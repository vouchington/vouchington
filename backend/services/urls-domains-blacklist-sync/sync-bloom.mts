import {
  enqueueUrlBlocklistRebuildOrThrow,
  invalidateUrlBlocklistReadyMarker,
} from '@services/urls-domains-blacklist/bloom-filter'
import {
  enqueueEmailBlocklistRebuildOrThrow,
  invalidateEmailBlocklistReadyMarker,
} from '@services/urls-domains-blacklist/email-bloom-filter'

export async function rebuildBloomForSource(sourceType: 'url' | 'email'): Promise<void> {
  // A failed bump must not leave the filter unavailable with no rebuild queued.
  if (sourceType === 'email') {
    try {
      await invalidateEmailBlocklistReadyMarker()
    } finally {
      await enqueueEmailBlocklistRebuildOrThrow()
    }
  } else {
    try {
      await invalidateUrlBlocklistReadyMarker()
    } finally {
      await enqueueUrlBlocklistRebuildOrThrow()
    }
  }
}
