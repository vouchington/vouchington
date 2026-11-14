import { LEGAL_REMOVAL_TAG } from '@ts-shared/cache/cache-tags'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'
import { advanceAnonymousCacheGeneration } from './anonymous-cache-generation.mts'
import { purgeCacheTags } from './purge.mts'
import { invalidateRssSnapshotsForLegalRemoval } from './rss-snapshot-generation.mts'

export { LEGAL_REMOVAL_TAG }

/**
 * A legal action completes only after the edge confirms removal. The anonymous origin
 * namespace advances first so an edge refill cannot read a pre-removal origin snapshot;
 * a failure in either step leaves the caller's durable legal work owed.
 */
export async function purgeLegalRemovalCacheTag(): Promise<void> {
  await advanceAnonymousCacheGeneration()
  if (isDeployedEnvironment()) {
    await purgeCacheTags([LEGAL_REMOVAL_TAG], { requireConfirmation: true })
    return
  }
  await purgeCacheTags([LEGAL_REMOVAL_TAG])
}

/**
 * Legal-removal surfaces shared by copyright and user deletion. Snapshots retire before the
 * edge purge so a refill cannot repopulate the edge from a removed snapshot. Callers record
 * completion only after this resolves, so a failure is retried.
 */
export async function purgeLegalRemovalSurfaces(): Promise<void> {
  await invalidateRssSnapshotsForLegalRemoval()
  await purgeLegalRemovalCacheTag()
}
