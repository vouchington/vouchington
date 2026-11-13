import { LEGAL_REMOVAL_TAG } from '@ts-shared/cache/cache-tags'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'
import { purgeCacheTags } from './purge.mts'

export { LEGAL_REMOVAL_TAG }

/** A legal action completes only after the edge confirms removal. */
export async function purgeLegalRemovalCacheTag(): Promise<void> {
  if (isDeployedEnvironment()) {
    await purgeCacheTags([LEGAL_REMOVAL_TAG], { requireConfirmation: true })
    return
  }
  await purgeCacheTags([LEGAL_REMOVAL_TAG])
}
