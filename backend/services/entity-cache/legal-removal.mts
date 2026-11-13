import { LEGAL_REMOVAL_TAG } from '@ts-shared/cache/cache-tags'
import { purgeCacheTags } from './purge.mts'

export { LEGAL_REMOVAL_TAG }

/** A legal action completes only after the edge confirms removal. */
export async function purgeLegalRemovalCacheTag(): Promise<void> {
  await purgeCacheTags([LEGAL_REMOVAL_TAG])
}
