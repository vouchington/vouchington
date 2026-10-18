import { caches } from '@services/entity-cache/caches'
import { getTopicByAny } from './get.mts'
import { getTopicsByAnyBatch } from './get-batch.mts'
import type { Topic } from './types.mts'

export const getTopicByAnyCached = caches.topics.cacheGetByAny(getTopicByAny)

/** Coalesce this cache read's synchronous stale refresh and foreground miss callbacks. */
export async function getTopicByAnyCachedBatch(identifiers: string[]) {
  const pending = new Set<string>()
  let collecting = true
  let loading: Promise<Map<string, Topic | null>> | undefined
  const get = caches.topics.cacheGetByAnyBatch<Topic>(async misses => {
    // A later refresh owns a fresh snapshot rather than retaining this invocation's rows.
    if (!collecting) return getTopicsByAnyBatch(misses)
    for (const id of misses) pending.add(id)
    loading ??= Promise.resolve().then(async () => {
      collecting = false
      const ids = [...pending]
      const rows = await getTopicsByAnyBatch(ids)
      return new Map(ids.map((id, index) => [id.trim().toLowerCase(), rows[index] ?? null]))
    })
    const rows = await loading
    return misses.map(id => rows.get(id.trim().toLowerCase()) ?? null)
  })
  const results = await get(identifiers)
  collecting = false
  return results
}
